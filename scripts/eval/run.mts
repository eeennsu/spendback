/**
 * 평가 하네스(PRD 6장). 폰과 같은 GGUF·프롬프트·GBNF·사후 검사(narrate)로 facts 스냅샷을 돌려 자동 점검한다.
 *
 *   pnpm eval [모델 id…] [--runs 1] [--only week-base,month-base] [--dir <모델 폴더>] [--temp 0.7] [--repeat 1.1] [--prompt v3]
 *
 * 결과는 scripts/eval/results/<시각>.json(전체)과 .md(모델 비교표, 사람 채점용 문장)다.
 * PC에서는 Metal·CUDA·Vulkan 같은 GPU로 돌아 속도가 폰(CPU)과 다르다. 속도는 참고만 하고 품질을 본다.
 */
import { getLlama } from 'node-llama-cpp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { keyFacts } from '../../src/retro/keys';
import { INFERENCE, MODELS } from '../../src/retro/models';
import { type Generate, formatFor, narrate, renderOutput } from '../../src/retro/narrate';
import type { PromptVersion } from '../../src/retro/prompt';
import { parseArgs } from './args';
import { autoCheck } from './checks';
import { type Inference, openModel } from './llama.mjs';
import { type Attempt, type Run, markdown } from './report';
import { SNAPSHOTS, type Snapshot } from './snapshots';

async function runOnce(
  generate: Generate,
  countTokens: (text: string) => number,
  snapshot: Snapshot,
  run: number,
  model: string,
  version: PromptVersion,
): Promise<Run> {
  const keyed = keyFacts(snapshot.facts, snapshot.names);
  const format = formatFor(keyed, version);
  const attempts: Attempt[] = [];
  let promptTokens: number | undefined;
  const recorded: Generate = async (request, onToken, signal) => {
    promptTokens ??= countTokens(request.messages.map(m => m.content).join('\n'));
    const start = performance.now();
    let first: number | null = null;
    const raw = await generate(
      request,
      token => {
        first ??= performance.now() - start;
        onToken(token);
      },
      signal,
    );
    const headlineEnd = /"headline":\s*"[^"]*"/.exec(raw);
    attempts.push({
      ms: performance.now() - start,
      firstTokenMs: first,
      tokens: countTokens(raw),
      headlineTokens: headlineEnd
        ? countTokens(raw.slice(0, headlineEnd.index + headlineEnd[0].length))
        : undefined,
      aborted: signal.aborted,
      problems: [
        ...(signal.aborted || format.parse(raw) ? [] : ['unparsable']),
        ...format.fields(raw).flatMap(f => format.check(f)),
      ],
      raw,
    });
    return raw;
  };

  const start = performance.now();
  let firstSentenceMs: number | null = null;
  const result = await narrate({
    facts: snapshot.facts,
    names: snapshot.names,
    generate: recorded,
    seed: run * 100,
    version,
    onSentence: () => {
      firstSentenceMs ??= performance.now() - start;
    },
    onRetry: () => {
      firstSentenceMs = null;
    },
  });
  const base = {
    model,
    snapshot: snapshot.id,
    run,
    status: result.status === 'fallback' ? `fallback:${result.reason}` : result.status,
    firstSentenceMs,
    totalMs: performance.now() - start,
    promptTokens,
    attempts,
  };
  if (result.status !== 'done') return base;
  const rendered = renderOutput(result.keyed, result.output);
  return {
    ...base,
    output: result.output,
    rendered,
    auto: autoCheck(result.output, rendered, result.keyed, snapshot.salient),
  };
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

const {
  models,
  dir,
  runs: runCount,
  only,
  temperature,
  repeatPenalty,
  topP,
  presencePenalty,
  prompt: version,
} = parseArgs(process.argv.slice(2));
const inference: Inference = {
  ...INFERENCE,
  presencePenalty: presencePenalty ?? 0,
  ...(temperature === undefined ? {} : { temperature }),
  ...(repeatPenalty === undefined ? {} : { repeatPenalty }),
  ...(topP === undefined ? {} : { topP }),
};
const snapshots = only ? SNAPSHOTS.filter(s => only.includes(s.id)) : SNAPSHOTS;
const llama = await getLlama();
const runs: Run[] = [];

for (const model of MODELS.filter(m => models.includes(m.id))) {
  const { generate, countTokens, dispose } = await openModel(llama, model, inference, dir);
  for (const snapshot of snapshots) {
    for (let run = 1; run <= runCount; run++) {
      const result = await runOnce(generate, countTokens, snapshot, run, model.id, version);
      runs.push(result);
      console.log(
        `${model.id} ${snapshot.id} #${run}: ${result.status}, 시도 ${result.attempts.length}, ${seconds(result.totalMs)}초`,
      );
    }
  }
  await dispose();
}

const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const meta = {
  date,
  'promptVersion': version,
  'inference': JSON.stringify(inference),
  'node-llama-cpp': `llama.cpp ${llama.llamaCppRelease.release}, ${llama.gpu || 'cpu'}`,
  'runs': String(runCount),
};
const outDir = join(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${date}.json`), JSON.stringify({ meta, runs }, null, 2));
writeFileSync(join(outDir, `${date}.md`), markdown(runs, meta));
console.log(`결과: scripts/eval/results/${date}.md`);
