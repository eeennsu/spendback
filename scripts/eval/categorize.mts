/**
 * 카드 알림의 카테고리 추천 하네스(PRD 6장, 4.9). 가상 사용자의 과거 가맹점(merchants.ts)으로 처음 보는 가맹점 60건의
 * 카테고리를 고르게 하고, 프롬프트에 넣는 검색 결과에 따라 정답률을 비교한다. 앱의 suggestCategory를 그대로 부르고,
 * 모델을 부르는 부분만 llama.rn 대신 node-llama-cpp다. 온도 0이라 한 번만 돈다.
 *
 *   pnpm eval:cards [모델 id…] [--dir <모델 폴더>] [--min-score <예시의 최소 점수>]
 *
 * 조건: none(검색 없음), similar(비슷한 가맹점 5곳, 앱), representatives(similar + 카테고리별 대표 가맹점),
 * nearest(LLM 없이 가장 비슷한 가맹점의 카테고리). 결과는 scripts/eval/results/cards-<시각>.json과 .md다.
 */
import { getLlama } from 'node-llama-cpp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { knownMerchants } from '../../src/cards/merchant';
import { MIN_SCORE, findSimilar } from '../../src/cards/similar';
import { type Context, suggestCategory } from '../../src/cards/suggest';
import { APP_MODELS, INFERENCE, MODELS } from '../../src/retro/models';
import type { Generate } from '../../src/retro/narrate';
import { openModel } from './llama.mjs';
import { CASES, CATEGORIES, type CaseKind, HISTORY } from './merchants';
import { PHONE } from './report';

type Condition = Context | 'nearest';
type Answer = {
  model: string;
  condition: Condition;
  merchant: string;
  kind: CaseKind;
  answer: number;
  predicted: number | null;
  promptTokens: number;
  outputTokens: number;
  raw: string;
};

const argv = process.argv.slice(2);
const dirAt = argv.indexOf('--dir');
const dir = dirAt < 0 ? undefined : argv[dirAt + 1];
const scoreAt = argv.indexOf('--min-score');
const minScore = scoreAt < 0 ? MIN_SCORE : Number(argv[scoreAt + 1]);
const ids = argv.filter(
  (a, i) => !a.startsWith('--') && argv[i - 1] !== '--dir' && argv[i - 1] !== '--min-score',
);
const models = ids.length ? MODELS.filter(m => ids.includes(m.id)) : APP_MODELS;

const known = knownMerchants(HISTORY);
const nameOf = (id: number | null) => CATEGORIES.find(c => c.id === id)?.name ?? '(없음)';
const answers: Answer[] = [];

// LLM 없이 가장 비슷한 가맹점의 카테고리. 모델이 없을 때 쓸 수 있는지 본다
for (const c of CASES) {
  const [nearest] = findSimilar(c.merchant, known, 1, minScore);
  answers.push({
    model: '-',
    condition: 'nearest',
    merchant: c.merchant,
    kind: c.kind,
    answer: c.answer,
    predicted: nearest?.categoryId ?? null,
    promptTokens: 0,
    outputTokens: 0,
    raw: nearest ? `${nearest.name} (${nearest.score.toFixed(2)})` : '',
  });
}

const llama = await getLlama();
for (const model of models) {
  const { generate, countTokens, dispose } = await openModel(
    llama,
    model,
    { ...INFERENCE, presencePenalty: 0 },
    dir,
  );
  for (const condition of ['none', 'similar', 'representatives'] as const) {
    for (const c of CASES) {
      let promptTokens = 0;
      let raw = '';
      const recorded: Generate = async (request, onToken, signal) => {
        promptTokens = countTokens(request.messages.map(m => m.content).join('\n'));
        raw = await generate(request, onToken, signal);
        return raw;
      };
      const suggestion = await suggestCategory({
        merchant: c.merchant,
        known,
        categories: CATEGORIES,
        generate: recorded,
        context: condition,
        minScore,
      });
      answers.push({
        model: model.id,
        condition,
        merchant: c.merchant,
        kind: c.kind,
        answer: c.answer,
        predicted: suggestion?.categoryId ?? null,
        promptTokens,
        outputTokens: raw ? countTokens(raw) : 0,
        raw,
      });
    }
    const done = answers.filter(a => a.model === model.id && a.condition === condition);
    console.log(
      `${model.id} ${condition}: ${done.filter(a => a.predicted === a.answer).length}/${done.length}`,
    );
  }
  await dispose();
}

const KINDS: CaseKind[] = ['overlap', 'habit', 'world'];
const KIND_NAMES: Record<CaseKind, string> = {
  overlap: '글자 겹침',
  habit: '글자 안 겹침(습관)',
  world: '세상 지식',
};
const CONDITION_NAMES: Record<Condition, string> = {
  none: '검색 없음',
  similar: '비슷한 가맹점 5곳',
  representatives: '+ 카테고리별 대표 가맹점',
  nearest: 'LLM 없이 가장 비슷한 가맹점',
};
const score = (list: Answer[]) =>
  `${list.filter(a => a.predicted === a.answer).length}/${list.length}`;
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const groups = [...new Set(answers.map(a => `${a.model}\t${a.condition}`))].map(key => {
  const [model, condition] = key.split('\t');
  return answers.filter(a => a.model === model && a.condition === condition);
});
const rows = groups.map(list => {
  const { model, condition } = list[0];
  const speed = PHONE[model];
  const prompt = average(list.map(a => a.promptTokens));
  const output = average(list.map(a => a.outputTokens));
  const phone = speed ? (prompt / speed.prompt + output / speed.generate).toFixed(1) : '-';
  return `| ${model} | ${CONDITION_NAMES[condition as Condition]} | ${score(list)} | ${KINDS.map(k => score(list.filter(a => a.kind === k))).join(' | ')} | ${Math.round(prompt) || '-'} | ${phone} |`;
});
const mistakes = groups.map(list => {
  const wrong = list.filter(a => a.predicted !== a.answer);
  const { model, condition } = list[0];
  return [
    `### ${model} · ${CONDITION_NAMES[condition as Condition]}`,
    '',
    ...wrong.map(
      a =>
        `- [${KIND_NAMES[a.kind]}] ${a.merchant}: ${nameOf(a.predicted)} (정답 ${nameOf(a.answer)})${a.condition === 'nearest' && a.raw ? ` ← ${a.raw}` : ''}`,
    ),
    '',
  ].join('\n');
});

const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const meta = {
  date,
  'node-llama-cpp': `llama.cpp ${llama.llamaCppRelease.release}, ${llama.gpu || 'cpu'}`,
  'cases': String(CASES.length),
  'minScore': String(minScore),
};
const markdown = [
  `# 카드 알림 카테고리 추천 ${date}`,
  '',
  ...Object.entries(meta).map(([k, v]) => `- ${k}: ${v}`),
  '',
  `| 모델 | 조건 | 전체 | ${KINDS.map(k => KIND_NAMES[k]).join(' | ')} | 프롬프트 토큰 | 폰 추정(초) |`,
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '폰 추정은 모델을 올린 뒤 한 건에 드는 시간이다(프롬프트·생성 토큰을 S24+ 속도로 나눔, report.ts PHONE). 로드 시간은 빠져 있다.',
  '',
  '## 틀린 것',
  '',
  ...mistakes,
].join('\n');

const outDir = join(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `cards-${date}.json`), JSON.stringify({ meta, answers }, null, 2));
writeFileSync(join(outDir, `cards-${date}.md`), markdown);
console.log(`결과: scripts/eval/results/cards-${date}.md`);
