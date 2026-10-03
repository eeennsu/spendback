import type { Message } from '../retro/prompt';
import type { Known } from './merchant';
import type { Similar } from './similar';

/**
 * 처음 보는 가맹점의 카테고리 추천 프롬프트와 문법(PRD 4.9). LLM은 가맹점이 무엇인지(세상 지식)는 알지만, 사용자가
 * 그런 지출을 어디에 적는지(개인 습관)는 모른다. 그 습관을 사용자가 전에 적은 비슷한 가맹점으로 준다.
 */

/** 사용자의 보이는 지출 카테고리 */
export type Category = { id: number; name: string };
/** 카테고리마다 사용자가 자주 적은 가맹점. 글자가 겹치지 않는 가맹점(GS25와 세븐일레븐)을 위한 비교 조건이다 */
export type Representative = { categoryId: number; names: string[] };

/**
 * 출력은 카테고리 이름 하나다. id가 아니라 이름인 것은 2B 모델에게 "3"보다 "배달"이 뜻이 있는 출력이어서다.
 * 이름은 종류 안에서 겹치지 않고(lists.ts categoryNameTaken), 이름을 통째로 고르게 해 없는 이름을 지어낼 수 없다.
 * 문자열 이스케이프는 GBNF와 JSON이 같다(retro/grammar.ts)
 */
export function categoryGrammar(categories: Category[]) {
  return `root ::= ${categories.map(c => JSON.stringify(c.name)).join(' | ')}`;
}

const SYSTEM = `너는 가계부 앱에서 카드 결제의 지출 카테고리를 고르는 분류기다. 사용자의 카테고리 중 하나를 이름 그대로 답한다.

규칙:
- 사용자가 전에 적은 가맹점이 있으면 그 습관을 따른다. 같은 종류의 가맹점은 같은 카테고리에 적는다.
- 비슷한 가맹점이 없으면 가맹점이 무엇을 파는 곳인지로 고른다.
- 카테고리 이름만 쓴다.`;

export function categoryMessages(
  merchant: string,
  categories: Category[],
  context: { similar: Similar[]; representatives?: Representative[] },
): Message[] {
  const nameOf = new Map(categories.map(c => [c.id, c.name]));
  const sections = [`카테고리: ${categories.map(c => c.name).join(', ')}`];
  if (context.similar.length) {
    sections.push(
      [
        '사용자가 전에 적은 비슷한 가맹점:',
        ...context.similar.map(m => `- ${m.name} → ${nameOf.get(m.categoryId)}`),
      ].join('\n'),
    );
  }
  if (context.representatives?.length) {
    sections.push(
      [
        '카테고리별로 사용자가 자주 적은 가맹점:',
        ...context.representatives.map(r => `- ${nameOf.get(r.categoryId)}: ${r.names.join(', ')}`),
      ].join('\n'),
    );
  }
  sections.push(`가맹점: ${merchant}`);
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: sections.join('\n\n') },
  ];
}

/** 카테고리 순서대로, 카테고리마다 거래가 많은 가맹점부터 perCategory곳까지. 가맹점이 없는 카테고리는 뺀다 */
export function representatives(known: Known[], categories: Category[], perCategory = 3) {
  return categories.flatMap(category => {
    const names = known
      .filter(m => m.categoryId === category.id)
      // sort는 안정 정렬이라 거래 수가 같으면 최근 가맹점이 먼저다
      .sort((a, b) => b.count - a.count)
      .slice(0, perCategory)
      .map(m => m.name);
    return names.length ? [{ categoryId: category.id, names }] : [];
  });
}
