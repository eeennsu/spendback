import { sampleFacts, sampleNames } from '../jest/facts';
import { computeFacts } from '../src/domain/facts';
import { followTarget } from '../src/retro/follow';
import { keyFacts } from '../src/retro/keys';

/** 지난달 회고(9월). 제안만 바꿔 가며 쓴다 */
const september = (suggestion: string) => ({
  facts: keyFacts(sampleFacts, sampleNames),
  output: { headline: '', insights: [], suggestion },
});

describe('followTarget: 지난달 제안이 가리키는 대상(PRD 4.6)', () => {
  test('제안의 첫 이름 키가 가리키는 카테고리다', () => {
    expect(
      followTarget(
        september('다음 달에는 {category.3.name} 지출 전에 {tag.2.name} 태그를 보세요.'),
      ),
    ).toEqual({ kind: 'category', id: 3 });
  });

  test('이유 태그', () => {
    expect(followTarget(september('다음 달에는 {tag.2.name} 지출을 하루 쉬어 보세요.'))).toEqual({
      kind: 'tag',
      id: 2,
    });
  });

  test('메모 키는 지난달 스냅샷의 메모 글자로 바꾼다', () => {
    expect(
      followTarget(september('다음 달에는 {memo.1.text}{을/를} 집에서 준비해 보세요.')),
    ).toEqual({
      kind: 'memo',
      memo: '편의점 커피',
    });
    expect(followTarget(september('다음 달에는 {largest.memo} 대신 집밥을 먹어 보세요.'))).toEqual({
      kind: 'memo',
      memo: '야식 치킨',
    });
  });

  test('지난달 회고가 없거나 제안에 이름 키가 없으면 없다', () => {
    expect(followTarget(undefined)).toBeUndefined();
    expect(followTarget(september('다음 달에는 지출이 없는 날을 만들어 보세요.'))).toBeUndefined();
  });
});

describe('computeFacts의 follow: 대상의 이번 달과 지난달 변동비 지출', () => {
  const tx = (id: number, date: string, amount: number, extra: object = {}) => ({
    id,
    type: 'expense' as const,
    amount,
    date,
    categoryId: 3,
    reasonTagId: null,
    satisfaction: null,
    memo: null,
    isFixed: false,
    ...extra,
  });
  const facts = (
    follow: Parameters<typeof computeFacts>[0]['follow'],
    transactions: ReturnType<typeof tx>[],
  ) =>
    computeFacts({
      period: { kind: 'monthly', start: '2026-09-01' },
      transactions,
      firstRecordDate: '2026-01-01',
      budgets: [],
      categories: [],
      follow,
    }).follow;

  test('카테고리는 그 카테고리의 변동비다. 고정비는 뺀다', () => {
    const transactions = [
      tx(1, '2026-08-10', 40000),
      tx(2, '2026-09-10', 28000),
      tx(3, '2026-09-11', 500000, { isFixed: true }),
      tx(4, '2026-09-12', 9000, { categoryId: 1 }),
    ];
    expect(facts({ kind: 'category', id: 3 }, transactions)).toEqual({
      target: { kind: 'category', id: 3 },
      amount: 28000,
      previous: 40000,
    });
  });

  test('이유 태그와 메모(완전 일치)', () => {
    const transactions = [
      tx(1, '2026-08-10', 7000, { reasonTagId: 2, memo: '야식 치킨' }),
      tx(2, '2026-08-20', 3000, { memo: '야식 치킨 ' }),
      tx(3, '2026-09-10', 5000, { reasonTagId: 2 }),
    ];
    expect(facts({ kind: 'tag', id: 2 }, transactions)).toMatchObject({
      amount: 5000,
      previous: 7000,
    });
    expect(facts({ kind: 'memo', memo: '야식 치킨' }, transactions)).toMatchObject({
      amount: 0,
      previous: 7000,
    });
  });

  test('두 달 모두 0이면 없다', () => {
    expect(facts({ kind: 'category', id: 9 }, [tx(1, '2026-09-10', 1000)])).toBeUndefined();
    expect(facts(undefined, [tx(1, '2026-09-10', 1000)])).toBeUndefined();
  });
});
