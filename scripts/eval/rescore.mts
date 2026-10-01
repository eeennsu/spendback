/**
 * 저장한 하네스 결과를 지금의 자동 점검(checks.ts)으로 다시 센다. 모델은 돌리지 않고, 토큰 수를 세려고
 * 토크나이저만 올린다(프롬프트 토큰이 없는 예전 결과의 폰 시간 추정).
 * 점검 항목을 더한 뒤 지난 결과와 같은 잣대로 비교할 때 쓴다.
 *
 *   pnpm exec tsx scripts/eval/rescore.mts scripts/eval/results/<시각>.json [--dir <모델 폴더>]
 *
 * 같은 폴더에 <시각>.rescored.md를 쓴다.
 */
import { getLlama } from 'node-llama-cpp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { keyFacts } from '../../src/retro/keys';
import { MODELS } from '../../src/retro/models';
import { formatFor } from '../../src/retro/narrate';
import { PROMPT_VERSIONS, type PromptVersion } from '../../src/retro/prompt';
import { modelsDir } from './args';
import { autoCheck } from './checks';
import { type Run, markdown } from './report';
import { SNAPSHOTS } from './snapshots';

const file = process.argv[2];
if (!file) throw new Error('결과 JSON 경로를 준다');
const dirIndex = process.argv.indexOf('--dir');
const dir = dirIndex < 0 ? undefined : process.argv[dirIndex + 1];
const { meta, runs } = JSON.parse(readFileSync(file, 'utf8')) as {
  meta: Record<string, string>;
  runs: Run[];
};
const version = (PROMPT_VERSIONS as readonly string[]).includes(meta.promptVersion)
  ? (meta.promptVersion as PromptVersion)
  : 'v1';

const llama = await getLlama({ gpu: false });
const tokenizers = new Map<string, (text: string) => number>();
for (const model of MODELS.filter(m => runs.some(r => r.model === m.id))) {
  const loaded = await llama.loadModel({
    modelPath: join(modelsDir(dir), model.fileName),
    vocabOnly: true,
  });
  tokenizers.set(model.id, text => loaded.tokenize(text).length);
}

const rescored = runs.map(r => {
  const snapshot = SNAPSHOTS.find(s => s.id === r.snapshot);
  if (!snapshot) return r;
  const keyed = keyFacts(snapshot.facts, snapshot.names);
  const count = tokenizers.get(r.model);
  const promptTokens =
    r.promptTokens ??
    count?.(
      formatFor(keyed, version)
        .request.messages.map(m => m.content)
        .join('\n'),
    );
  const attempts = r.attempts.map(a => {
    if (a.headlineTokens !== undefined || !count) return a;
    const end = /"headline":\s*"[^"]*"/.exec(a.raw);
    return {
      ...a,
      headlineTokens: end ? count(a.raw.slice(0, end.index + end[0].length)) : undefined,
    };
  });
  const base = { ...r, promptTokens, attempts };
  if (!r.output || !r.rendered) return base;
  return { ...base, auto: autoCheck(r.output, r.rendered, keyed) };
});
const out = file.replace(/\.json$/, '.rescored.md');
writeFileSync(out, markdown(rescored, { ...meta, rescored: new Date().toISOString() }));
console.log(out);
