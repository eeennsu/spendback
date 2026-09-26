import type { Output } from '../../src/retro/check';

/**
 * 하네스 자동 점검(PRD 6장). 앱의 사후 검사(src/retro/check.ts: 스키마, 모르는 키, 숫자·수사, 단위 중복, 방향 직접
 * 쓰기)를 통과한 출력에 더 보는 것들이다.
 * 길이 한도와 금지어는 첫 하네스 결과를 보고 조정한다.
 */

/** 채운 뒤 길이 한도(공백 포함). S24+ 본문 한 줄이 약 22자다 */
export const LIMITS = { headline: 30, insight: 60, suggestion: 45 };
/** 문장 수 한도 */
const SENTENCES = { headline: 1, insight: 2, suggestion: 1 };

export const BANNED = [
  '!',
  '안녕하세요',
  '여러분',
  '고객님',
  '항상',
  '절대',
  '완벽',
  '최고',
  '최악',
  '대박',
  '심각',
  '낭비',
  '과소비',
  '한심',
  '반성',
  // PRD 초안의 '해야 해요'를 넓혔다. '줄여야 해요', '써야 해요'도 같은 훈계다
  '야 해요',
  '것 같아요',
  '나 봐요',
  '듯해요',
];

const sentenceCount = (text: string) => Math.max(1, (text.match(/[.?!](?=\s|$)/g) ?? []).length);

export type Rendered = { headline: string; insights: string[]; suggestion: string };

export function autoCheck(output: Output, rendered: Rendered) {
  const lines = [
    { field: 'headline' as const, raw: output.headline, text: rendered.headline },
    ...output.insights.map((insight, i) => ({
      field: 'insight' as const,
      raw: insight.text,
      text: rendered.insights[i],
    })),
    { field: 'suggestion' as const, raw: output.suggestion, text: rendered.suggestion },
  ];
  const abouts = output.insights.map(i => i.about);
  return {
    tooLong: lines.filter(l => l.text.length > LIMITS[l.field]).map(l => l.text),
    tooManySentences: lines
      .filter(l => sentenceCount(l.text) > SENTENCES[l.field])
      .map(l => l.text),
    banned: [...new Set(lines.flatMap(l => BANNED.filter(word => l.text.includes(word))))],
    repeatedGroups: abouts.length - new Set(abouts).size,
  };
}
