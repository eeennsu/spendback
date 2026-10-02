import type { Output } from '../../src/retro/check';
import { type AutoCheck, QUALITY, type QualityName, type Rendered, isClean } from './checks';
import { SNAPSHOTS } from './snapshots';

/** 하네스 결과 집계와 마크다운(run.mts, rescore.mts) */

export type Attempt = {
  ms: number;
  firstTokenMs: number | null;
  tokens: number;
  /** 첫 필드(headline)가 끝날 때까지 생성한 토큰. 폰의 첫 문장 시간을 추정한다 */
  headlineTokens?: number;
  /** 사후 검사가 끊은 시도 */
  aborted: boolean;
  problems: string[];
  raw: string;
};

export type Run = {
  model: string;
  snapshot: string;
  run: number;
  status: string;
  firstSentenceMs: number | null;
  totalMs: number;
  /** 시스템·사용자 메시지의 토큰 수(채팅 템플릿 토큰은 뺀 값) */
  promptTokens?: number;
  attempts: Attempt[];
  output?: Output;
  rendered?: Rendered;
  auto?: AutoCheck;
};

/**
 * 폰(S24+, CPU, 스레드 6) 속도. LLM 스파이크(spike/llm-runtime/README.md)의 프롬프트 처리·생성 tok/s다.
 * 재시도는 같은 프롬프트라 캐시가 남아 생성 시간만 더한다(스파이크: 다시 돌리면 첫 토큰 0.1~0.2초)
 */
export const PHONE: Record<string, { prompt: number; generate: number }> = {
  'qwen3.5-2b': { prompt: 107, generate: 18.8 },
  'kanana-1.5-2.1b': { prompt: 54, generate: 12.8 },
  'exaone-4.0-1.2b': { prompt: 100, generate: 19 },
};

/** 폰에서 걸릴 시간 추정(초). 첫 문장은 실패한 시도의 토큰과 마지막 시도의 headline까지다 */
export function phoneSeconds(r: Run) {
  const speed = PHONE[r.model];
  if (!speed || r.promptTokens === undefined) return undefined;
  const prompt = r.promptTokens / speed.prompt;
  const generated = r.attempts.reduce((n, a) => n + a.tokens, 0);
  const failed = r.attempts.slice(0, -1).reduce((n, a) => n + a.tokens, 0);
  const last = r.attempts[r.attempts.length - 1];
  return {
    first: prompt + (failed + (last?.headlineTokens ?? last?.tokens ?? 0)) / speed.generate,
    total: prompt + generated / speed.generate,
  };
}

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const seconds = (ms: number) => (ms / 1000).toFixed(1);

export const QUALITY_LABELS: Record<QualityName, string> = {
  brokenDirection: '증감 낱말 깨뜨리기',
  directionSynonym: '증감 동의어',
  numeralLeak: '수사 누출',
  promptLeak: '프롬프트 옮기기',
  notPolite: '해요체 아님',
  vowOrQuestion: '다짐·질문',
  wordRepeat: '낱말 되풀이',
  glued: '뭉친 낱말',
};

export function summarize(runs: Run[]) {
  const done = runs.filter(r => r.status === 'done');
  const attempts = runs.flatMap(r => r.attempts);
  const problems = attempts.flatMap(a => a.problems);
  const count = (name: string) => problems.filter(p => p === name).length;
  const auto = done.flatMap(r => (r.auto ? [r.auto] : []));
  const phone = done.flatMap(r => {
    const s = phoneSeconds(r);
    return s ? [s] : [];
  });
  const sentences = done.reduce((n, r) => n + 2 + (r.output?.insights.length ?? 0), 0);
  return {
    runs: runs.length,
    done: done.length,
    clean: auto.filter(isClean).length,
    sentences,
    firstAttemptPass: runs.filter(r => r.attempts[0]?.problems.length === 0 && r.status === 'done')
      .length,
    avgAttempts: average(runs.map(r => r.attempts.length)),
    firstSentence: average(
      done.flatMap(r => (r.firstSentenceMs === null ? [] : [r.firstSentenceMs])),
    ),
    total: average(done.map(r => r.totalMs)),
    promptTokens: average(
      runs.flatMap(r => (r.promptTokens === undefined ? [] : [r.promptTokens])),
    ),
    generatedTokens: average(runs.map(r => r.attempts.reduce((n, a) => n + a.tokens, 0))),
    phoneFirst: average(phone.map(p => p.first)),
    phoneTotal: average(phone.map(p => p.total)),
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
    misattributed: auto.reduce((n, a) => n + (a.misattributed?.length ?? 0), 0),
    quality: Object.fromEntries(
      (Object.keys(QUALITY) as QualityName[]).map(name => [
        name,
        auto.reduce((n, a) => n + (a.quality?.[name]?.length ?? 0), 0),
      ]),
    ) as Record<QualityName, number>,
  };
}

/** 값이 없으면(예전 결과의 프롬프트 토큰 등) - */
export const num = (n: number, digits = 1) => (n ? n.toFixed(digits) : '-');

export function markdown(runs: Run[], meta: Record<string, string>) {
  const models = [...new Set(runs.map(r => r.model))];
  const stats = models.map(model => ({ model, s: summarize(runs.filter(r => r.model === model)) }));
  const rows = stats.map(
    ({ model, s }) =>
      `| ${model} | ${s.done}/${s.runs} | ${s.firstAttemptPass}/${s.runs} | ${s.avgAttempts.toFixed(2)} | ${seconds(s.firstSentence)} | ${seconds(s.total)} | ${s.tokensPerSecond.toFixed(1)} | ${s.numeral} | ${s.unknownKey} | ${s.unparsable} | ${s.danglingUnit} | ${s.direction} | ${s.repetition} | ${s.tooLong} | ${s.tooManySentences} | ${s.banned} | ${s.repeatedGroups} |`,
  );
  const qualityNames = Object.keys(QUALITY) as QualityName[];
  const qualityRows = stats.map(
    ({ model, s }) =>
      `| ${model} | ${s.clean}/${s.runs} | ${s.sentences} | ${s.misattributed} | ${qualityNames.map(n => s.quality[n]).join(' | ')} |`,
  );
  const speedRows = stats.map(
    ({ model, s }) =>
      `| ${model} | ${num(s.promptTokens, 0)} | ${num(s.generatedTokens, 0)} | ${num(s.phoneFirst)} | ${num(s.phoneTotal)} |`,
  );
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
    '## 문장 품질 휴리스틱',
    '',
    `| 모델 | 걸린 데 없는 회고 | 문장 | 다른 사실에 이름 | ${qualityNames.map(n => QUALITY_LABELS[n]).join(' | ')} |`,
    `|---|---|---|---|${qualityNames.map(() => '---').join('|')}|`,
    ...qualityRows,
    '',
    '완료한 회고의 문장 수다. "걸린 데 없는 회고"는 길이·문장 수·금지어·같은 묶음과 이 표의 항목에 하나도 걸리지 않은 회고다(scripts/eval/checks.ts).',
    '',
    '## 폰 시간 추정',
    '',
    '| 모델 | 프롬프트 토큰 | 생성 토큰(시도 합) | 첫 문장(초) | 전체(초) |',
    '|---|---|---|---|---|',
    ...speedRows,
    '',
    'LLM 스파이크의 S24+ 속도(report.ts PHONE)로 추정했다. 재시도는 프롬프트 캐시가 남아 생성 시간만 더했다.',
    '',
    '## 문장(사람 채점)',
    '',
    ...samples,
  ].join('\n');
}
