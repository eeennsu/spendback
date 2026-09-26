/**
 * 평가 하네스(PRD 6장). 폰과 같은 GGUF·프롬프트·GBNF·사후 검사(narrate)로 facts 스냅샷을 돌려 자동 점검한다.
 *
 *   pnpm eval [모델 id…] [--runs 1] [--only week-base,month-base] [--dir <모델 폴더>] [--temp 0.7] [--repeat 1.1]
 *
 * 결과는 scripts/eval/results/<시각>.json(전체)과 .md(모델 비교표, 사람 채점용 문장)다.
 * PC에서는 Metal·CUDA 같은 GPU로 돌아 속도가 폰(CPU)과 다르다. 속도는 참고만 하고 품질을 본다.
 */
import {
  type ChatWrapper,
  type Llama,
  LlamaChatSession,
  type LlamaContext,
  getLlama,
  resolveChatWrapper,
} from 'node-llama-cpp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Output, checkField, parseOutput } from '../../src/retro/check';
import { keyFacts } from '../../src/retro/keys';
import { INFERENCE, MODELS } from '../../src/retro/models';
import { type Generate, completedFields, narrate, renderOutput } from '../../src/retro/narrate';
import { PROMPT_VERSION } from '../../src/retro/prompt';
import { modelsDir, parseArgs } from './args';
import { type Rendered, autoCheck } from './checks';
import { SNAPSHOTS, type Snapshot } from './snapshots';

type Attempt = {
  ms: number;
  firstTokenMs: number | null;
  tokens: number;
  /** 사후 검사가 끊은 시도 */
  aborted: boolean;
  problems: string[];
  raw: string;
};

type Run = {
  model: string;
  snapshot: string;
  run: number;
  status: string;
  firstSentenceMs: number | null;
  totalMs: number;
  attempts: Attempt[];
  output?: Output;
  rendered?: Rendered;
  auto?: ReturnType<typeof autoCheck>;
};

/** node-llama-cpp 구현. 앱의 llama.rn 구현과 같은 설정을 쓴다(src/retro/models.ts INFERENCE) */
function llamaGenerate(
  llama: Llama,
  context: LlamaContext,
  chatWrapper: ChatWrapper,
  inference: typeof INFERENCE,
): Generate {
  return async ({ messages, grammar, seed }, onToken, signal) => {
    const sequence = context.getSequence();
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        chatWrapper,
        systemPrompt: messages[0].content,
      });
      return await session.prompt(messages[1].content, {
        grammar: await llama.createGrammar({ grammar }),
        seed,
        temperature: inference.temperature,
        topK: inference.topK,
        topP: inference.topP,
        minP: inference.minP,
        maxTokens: inference.maxTokens,
        repeatPenalty:
          inference.repeatPenalty === 1
            ? false
            : { penalty: inference.repeatPenalty, lastTokens: inference.repeatLastTokens },
        onTextChunk: onToken,
        signal,
        stopOnAbortSignal: true,
      });
    } finally {
      await sequence.dispose();
    }
  };
}

async function runOnce(
  generate: Generate,
  countTokens: (text: string) => number,
  snapshot: Snapshot,
  run: number,
  model: string,
): Promise<Run> {
  const keyed = keyFacts(snapshot.facts, snapshot.names);
  const attempts: Attempt[] = [];
  const recorded: Generate = async (request, onToken, signal) => {
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
    attempts.push({
      ms: performance.now() - start,
      firstTokenMs: first,
      tokens: countTokens(raw),
      aborted: signal.aborted,
      problems: [
        ...(signal.aborted || parseOutput(raw) ? [] : ['unparsable']),
        ...completedFields(raw).flatMap(f => checkField(keyed, f)),
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
    attempts,
  };
  if (result.status !== 'done') return base;
  const rendered = renderOutput(result.keyed, result.output);
  return { ...base, output: result.output, rendered, auto: autoCheck(result.output, rendered) };
}

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const seconds = (ms: number) => (ms / 1000).toFixed(1);

function summarize(runs: Run[]) {
  const done = runs.filter(r => r.status === 'done');
  const attempts = runs.flatMap(r => r.attempts);
  const problems = attempts.flatMap(a => a.problems);
  const count = (name: string) => problems.filter(p => p === name).length;
  const auto = done.flatMap(r => (r.auto ? [r.auto] : []));
  return {
    runs: runs.length,
    done: done.length,
    firstAttemptPass: runs.filter(r => r.attempts[0]?.problems.length === 0 && r.status === 'done')
      .length,
    avgAttempts: average(runs.map(r => r.attempts.length)),
    firstSentence: average(
      done.flatMap(r => (r.firstSentenceMs === null ? [] : [r.firstSentenceMs])),
    ),
    total: average(done.map(r => r.totalMs)),
    tokensPerSecond: average(
      attempts
        .filter(a => a.firstTokenMs !== null && a.ms > (a.firstTokenMs ?? 0))
        .map(a => a.tokens / ((a.ms - (a.firstTokenMs ?? 0)) / 1000)),
    ),
    numeral: count('numeral'),
    unknownKey: count('unknown-key') + count('unknown-group'),
    unparsable: count('unparsable'),
    danglingUnit: count('dangling-unit'),
    direction: count('direction'),
    repetition: count('repetition'),
    tooLong: auto.reduce((n, a) => n + a.tooLong.length, 0),
    tooManySentences: auto.reduce((n, a) => n + a.tooManySentences.length, 0),
    banned: auto.reduce((n, a) => n + a.banned.length, 0),
    repeatedGroups: auto.reduce((n, a) => n + a.repeatedGroups, 0),
  };
}

function markdown(runs: Run[], meta: Record<string, string>) {
  const models = [...new Set(runs.map(r => r.model))];
  const rows = models.map(model => {
    const s = summarize(runs.filter(r => r.model === model));
    return `| ${model} | ${s.done}/${s.runs} | ${s.firstAttemptPass}/${s.runs} | ${s.avgAttempts.toFixed(2)} | ${seconds(s.firstSentence)} | ${seconds(s.total)} | ${s.tokensPerSecond.toFixed(1)} | ${s.numeral} | ${s.unknownKey} | ${s.unparsable} | ${s.danglingUnit} | ${s.direction} | ${s.repetition} | ${s.tooLong} | ${s.tooManySentences} | ${s.banned} | ${s.repeatedGroups} |`;
  });
  const samples = SNAPSHOTS.filter(snapshot => runs.some(r => r.snapshot === snapshot.id)).map(
    snapshot => {
      const entries = runs
        .filter(r => r.snapshot === snapshot.id)
        .map(r => {
          const head = `**${r.model}** 실행 ${r.run} · ${r.status} · 시도 ${r.attempts.length}`;
          if (!r.rendered || !r.output) return head;
          const insights = r.rendered.insights.map(
            (text, i) => `- (${r.output?.insights[i].about}) ${text}`,
          );
          return [
            head,
            '',
            `> ${r.rendered.headline}`,
            '',
            ...insights,
            '',
            `제안: ${r.rendered.suggestion}`,
          ].join('\n');
        });
      return [`### ${snapshot.id} — ${snapshot.note}`, '', ...entries.flatMap(e => [e, ''])].join(
        '\n',
      );
    },
  );
  return [
    `# 평가 하네스 결과 ${meta.date}`,
    '',
    ...Object.entries(meta).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## 모델 비교',
    '',
    '| 모델 | 완료 | 첫 시도 통과 | 평균 시도 | 첫 문장(초) | 전체(초) | 생성 tok/s | 수사 | 모르는 키 | 읽기 실패 | 단위 | 방향 | 되풀이 | 길이 초과 | 문장 수 초과 | 금지어 | 같은 묶음 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '수사부터 방향까지는 모든 시도에서 사후 검사가 잡은 수, 길이 초과부터는 완료한 회고의 문장 수다(README 참고).',
    '',
    '## 문장(사람 채점)',
    '',
    ...samples,
  ].join('\n');
}

const {
  models,
  dir,
  runs: runCount,
  only,
  temperature,
  repeatPenalty,
} = parseArgs(process.argv.slice(2));
const inference = {
  ...INFERENCE,
  ...(temperature === undefined ? {} : { temperature }),
  ...(repeatPenalty === undefined ? {} : { repeatPenalty }),
};
const snapshots = only ? SNAPSHOTS.filter(s => only.includes(s.id)) : SNAPSHOTS;
const llama = await getLlama();
const runs: Run[] = [];

for (const model of MODELS.filter(m => models.includes(m.id))) {
  const loaded = await llama.loadModel({ modelPath: join(modelsDir(dir), model.fileName) });
  const context = await loaded.createContext({ contextSize: INFERENCE.contextSize });
  // 추론 모드를 끈다(PRD 6장). Qwen 래퍼는 빈 think 블록을 프롬프트에 넣는다. budgets로 끄면 문법이 고른 첫 토큰이
  // think 구간에 들어가 사라진다
  const chatWrapper = resolveChatWrapper(loaded, {
    customWrapperSettings: { qwen: { thoughts: 'discourage' } },
  });
  const generate = llamaGenerate(llama, context, chatWrapper, inference);
  const countTokens = (text: string) => loaded.tokenize(text).length;
  for (const snapshot of snapshots) {
    for (let run = 1; run <= runCount; run++) {
      const result = await runOnce(generate, countTokens, snapshot, run, model.id);
      runs.push(result);
      console.log(
        `${model.id} ${snapshot.id} #${run}: ${result.status}, 시도 ${result.attempts.length}, ${seconds(result.totalMs)}초`,
      );
    }
  }
  await context.dispose();
  await loaded.dispose();
}

const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const meta = {
  date,
  'promptVersion': PROMPT_VERSION,
  'inference': JSON.stringify(inference),
  'node-llama-cpp': `llama.cpp ${llama.llamaCppRelease.release}, ${llama.gpu || 'cpu'}`,
  'runs': String(runCount),
};
const outDir = join(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${date}.json`), JSON.stringify({ meta, runs }, null, 2));
writeFileSync(join(outDir, `${date}.md`), markdown(runs, meta));
console.log(`결과: scripts/eval/results/${date}.md`);
