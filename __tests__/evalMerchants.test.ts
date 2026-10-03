import { CASES, HISTORY } from '../scripts/eval/merchants';
import { knownMerchants, nameGrams, normalizeMerchant } from '../src/cards/merchant';

/** 하네스 데이터가 종류의 정의대로인지(scripts/eval/merchants.ts) */
const known = knownMerchants(HISTORY);
const sharesGrams = (a: string, b: string) => nameGrams(a).some(g => nameGrams(b).includes(g));
const sameKindOverlap = (c: (typeof CASES)[number]) =>
  known.some(m => m.categoryId === c.answer && sharesGrams(c.merchant, m.name));

test('처음 보는 가맹점은 과거 가맹점과 이름이 같지 않다', () => {
  const names = new Set(known.map(m => m.name));
  expect(CASES.filter(c => names.has(normalizeMerchant(c.merchant)))).toEqual([]);
});

test('overlap 사례는 같은 카테고리의 과거 가맹점과 조각이 겹친다', () => {
  expect(
    CASES.filter(c => c.kind === 'overlap' && !sameKindOverlap(c)).map(c => c.merchant),
  ).toEqual([]);
});

test('habit 사례는 같은 카테고리의 과거 가맹점과 조각이 겹치지 않는다', () => {
  expect(CASES.filter(c => c.kind === 'habit' && sameKindOverlap(c)).map(c => c.merchant)).toEqual(
    [],
  );
});

test('종류마다 20건이다', () => {
  expect(
    ['overlap', 'habit', 'world'].map(kind => CASES.filter(c => c.kind === kind).length),
  ).toEqual([20, 20, 20]);
});
