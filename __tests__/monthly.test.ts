import { monthlyVariable } from '../src/domain/monthly';

const tx = (date: string, amount: number, extra: object = {}) => ({
  type: 'expense' as const,
  isFixed: false,
  amount,
  date,
  ...extra,
});

describe('monthlyVariable: 회고 목록의 달별 변동비 막대(PRD 4.6 목록)', () => {
  test('이번 달까지 count개월의 변동비를 오래된 달부터 낸다. 고정비와 수입은 뺀다', () => {
    const transactions = [
      tx('2026-08-03', 10000),
      tx('2026-08-20', 5000),
      tx('2026-09-01', 500000, { isFixed: true }),
      tx('2026-09-02', 3000000, { type: 'income' }),
      tx('2026-10-05', 7000),
      tx('2026-07-31', 9999), // 범위 밖
    ];
    expect(monthlyVariable(transactions, '2026-10-05', 3)).toEqual([
      { month: '2026-08', amount: 15000 },
      { month: '2026-09', amount: 0 },
      { month: '2026-10', amount: 7000 },
    ]);
  });

  test('해를 넘긴다', () => {
    expect(monthlyVariable([tx('2025-12-31', 1000)], '2026-01-10', 2)).toEqual([
      { month: '2025-12', amount: 1000 },
      { month: '2026-01', amount: 0 },
    ]);
  });
});
