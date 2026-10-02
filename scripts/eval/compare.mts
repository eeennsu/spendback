/**
 * 하네스 결과 여럿을 모델·프롬프트 버전별로 한 표에 모은다(PRD 11장 비교). 모델은 돌리지 않는다.
 * 예전 결과는 먼저 rescore.mts로 지금의 점검을 다시 센 .rescored.json을 준다.
 *
 *   pnpm exec tsx scripts/eval/compare.mts <결과.json> <결과.json> …
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { type Run, num, summarize } from './report';

const rows: string[] = [];
for (const file of process.argv.slice(2)) {
  const { meta, runs } = JSON.parse(readFileSync(file, 'utf8')) as {
    meta: Record<string, string>;
    runs: Run[];
  };
  for (const model of [...new Set(runs.map(r => r.model))]) {
    const s = summarize(runs.filter(r => r.model === model));
    const q = s.quality;
    rows.push(
      [
        model,
        meta.promptVersion,
        `${s.done}/${s.runs}`,
        `${s.firstAttemptPass}/${s.runs}`,
        `${s.clean}/${s.runs}`,
        s.tooLong,
        q.brokenDirection + q.directionSynonym,
        s.misattributed,
        q.notPolite + q.vowOrQuestion,
        q.wordRepeat + q.glued,
        q.numeralLeak + s.numeral,
        s.repeatedGroups,
        s.salientRuns ? `${s.missedSalient}/${s.salientRuns}` : '-',
        s.salientRuns ? `${s.salientHeadline}/${s.salientRuns}` : '-',
        num(s.promptTokens, 0),
        num(s.generatedTokens, 0),
        `${num(s.phoneFirst)} / ${num(s.phoneTotal)}`,
        basename(file),
      ].join(' | '),
    );
  }
}
console.log(
  [
    '| 모델 | 버전 | 완료 | 첫 시도 통과 | 걸린 데 없는 회고 | 길이 초과 | 증감 낱말 깨뜨리기·동의어 | 다른 사실에 이름 | 해요체 아님·다짐·질문 | 되풀이·뭉친 낱말 | 수사(누출+검사) | 같은 묶음 | 놓친 사실 | headline 적중 | 프롬프트 토큰 | 생성 토큰 | 폰 추정 첫 문장 / 전체(초) | 결과 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r} |`),
  ].join('\n'),
);
