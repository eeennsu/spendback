import { type FactsInput, computeFacts } from '../src/domain/facts';
import type { Budget } from '../src/domain/types';

type Tx = FactsInput['transactions'][number];

let seq = 0;
function tx(date: string, amount: number, overrides: Partial<Tx> = {}): Tx {
  seq += 1;
  return {
    id: `t${seq}`,
    type: 'expense',
    amount,
    date,
    categoryId: 'food',
    reasonTagId: null,
    satisfaction: null,
    memo: null,
    isFixed: false,
    ...overrides,
  };
}

const categories = [
  { id: 'food', sortOrder: 0 },
  { id: 'cafe', sortOrder: 1 },
  { id: 'delivery', sortOrder: 2 },
  { id: 'transport', sortOrder: 3 },
];

/** 2026-09-21(월) ~ 27(일). 직전 주는 14 ~ 20일 */
const WEEK = { kind: 'weekly', start: '2026-09-21' } as const;
/** 2026년 8월. 직전 달은 7월 */
const AUGUST = { kind: 'monthly', start: '2026-08-01' } as const;

function facts(input: Partial<FactsInput> & Pick<FactsInput, 'transactions'>) {
  return computeFacts({
    period: WEEK,
    firstRecordDate: '2026-01-01',
    budgets: [],
    categories,
    ...input,
  });
}

describe('기간', () => {
  test('주간은 월요일부터 일요일까지다', () => {
    expect(facts({ transactions: [] })).toMatchObject({ start: '2026-09-21', end: '2026-09-27' });
  });

  test('월간은 달력 월이다', () => {
    const f = facts({ period: { kind: 'monthly', start: '2026-02-01' }, transactions: [] });
    expect(f.end).toBe('2026-02-28');
  });

  test('1월의 직전 달은 지난해 12월이다', () => {
    const f = facts({
      period: { kind: 'monthly', start: '2026-01-01' },
      firstRecordDate: '2025-11-20',
      transactions: [tx('2025-12-31', 5000), tx('2025-11-30', 9000)],
    });
    expect(f.change?.previous).toBe(5000);
  });
});

describe('총지출', () => {
  const transactions = [
    tx('2026-09-21', 10000),
    tx('2026-09-22', 20000, { categoryId: 'cafe' }),
    tx('2026-09-25', 500000, { isFixed: true, categoryId: 'rent' }),
    tx('2026-09-23', 3000000, { type: 'income', categoryId: 'salary' }),
    tx('2026-09-28', 99999), // 다음 주
  ];

  test('전체·변동비·고정비를 따로 낸다. 수입과 기간 밖은 뺀다', () => {
    expect(facts({ transactions })).toMatchObject({
      total: 530000,
      variable: 30000,
      fixed: 500000,
    });
  });

  test('변동비 지출 건수(3건 미만이면 LLM을 부르지 않는다)', () => {
    expect(facts({ transactions }).variableCount).toBe(2);
  });
});

describe('직전 기간 대비 증감(변동비)', () => {
  const transactions = [
    tx('2026-09-15', 40000),
    tx('2026-09-16', 100000, { isFixed: true }),
    tx('2026-09-22', 72000),
  ];

  test('증감액과 직전 금액을 낸다. 고정비는 뺀다', () => {
    expect(facts({ transactions }).change).toEqual({ previous: 40000, amount: 32000 });
  });

  test('직전 기간이 첫 기록일과 겹치면 비교하지 않는다', () => {
    expect(facts({ transactions, firstRecordDate: '2026-09-16' }).change).toBeUndefined();
    // 첫 기록일이 직전 기간의 첫날이어도 겹친다
    expect(facts({ transactions, firstRecordDate: '2026-09-14' }).change).toBeUndefined();
    expect(facts({ transactions, firstRecordDate: '2026-09-13' }).change).toBeDefined();
  });

  test('기록이 없으면 비교하지 않는다', () => {
    expect(facts({ transactions: [], firstRecordDate: undefined }).change).toBeUndefined();
  });

  test('직전 금액이 0이어도 증감액은 낸다(증감률은 회고 파이프라인이 뺀다)', () => {
    expect(facts({ transactions: [tx('2026-09-22', 5000)] }).change).toEqual({
      previous: 0,
      amount: 5000,
    });
  });
});

describe('카테고리', () => {
  test('합계를 큰 순서로, 같으면 카테고리 순서로 낸다. 비중의 분모는 변동비 합계다', () => {
    const f = facts({
      transactions: [
        tx('2026-09-21', 5000, { categoryId: 'delivery' }),
        tx('2026-09-22', 5000, { categoryId: 'cafe' }),
        tx('2026-09-23', 9000),
        tx('2026-09-23', 50000, { categoryId: 'transport', isFixed: true }),
      ],
    });
    expect(f.categories).toEqual([
      { categoryId: 'food', amount: 9000 },
      { categoryId: 'cafe', amount: 5000 },
      { categoryId: 'delivery', amount: 5000 },
    ]);
  });

  describe('증감 상위 3개', () => {
    const transactions = [
      // 직전 주
      tx('2026-09-14', 10000),
      tx('2026-09-14', 30000, { categoryId: 'cafe' }),
      tx('2026-09-15', 8000, { categoryId: 'transport' }),
      // 이번 주
      tx('2026-09-21', 30000), // food +20,000
      tx('2026-09-22', 20000, { categoryId: 'delivery' }), // delivery +20,000(이번 금액이 작다)
      tx('2026-09-23', 8000, { categoryId: 'transport' }), // transport 0
      // cafe -30,000(이번 주에 없다)
    ];

    test('증감액 절댓값 순, 같으면 이번 금액 큰 순. 증감 0은 넣지 않는다', () => {
      expect(facts({ transactions }).topCategoryChanges).toEqual([
        { categoryId: 'cafe', current: 0, previous: 30000, change: -30000 },
        { categoryId: 'food', current: 30000, previous: 10000, change: 20000 },
        { categoryId: 'delivery', current: 20000, previous: 0, change: 20000 },
      ]);
    });

    test('금액까지 같으면 카테고리 순서다', () => {
      const f = facts({
        transactions: [
          tx('2026-09-21', 5000, { categoryId: 'delivery' }),
          tx('2026-09-21', 5000, { categoryId: 'cafe' }),
        ],
      });
      expect(f.topCategoryChanges?.map(c => c.categoryId)).toEqual(['cafe', 'delivery']);
    });

    test('3개까지다', () => {
      const f = facts({
        transactions: categories.map((c, i) =>
          tx('2026-09-21', 1000 * (i + 1), { categoryId: c.id }),
        ),
      });
      expect(f.topCategoryChanges).toHaveLength(3);
    });

    test('비교할 수 없으면 없다', () => {
      expect(
        facts({ transactions, firstRecordDate: '2026-09-14' }).topCategoryChanges,
      ).toBeUndefined();
    });
  });
});

describe('예산 대비(변동비)', () => {
  const budgets: Budget[] = [
    { effectiveFrom: '2026-08', total: 1240000, categoryBudgets: { food: 310000 } },
  ];
  const transactions = [
    tx('2026-08-03', 200000),
    tx('2026-08-04', 50000, { categoryId: 'cafe' }),
    tx('2026-08-05', 600000, { isFixed: true }),
  ];

  test('월간은 그 달의 예산이다', () => {
    expect(facts({ period: AUGUST, budgets, transactions }).budget).toEqual({
      budget: 1240000,
      spent: 250000,
      categories: [{ categoryId: 'food', budget: 310000, spent: 200000 }],
    });
  });

  test('주간은 일할한 예산이다', () => {
    // 2026-08-03(월) 주: 1,240,000 ÷ 31 × 7
    const f = facts({ period: { kind: 'weekly', start: '2026-08-03' }, budgets, transactions });
    expect(f.budget).toMatchObject({ budget: 280000, spent: 250000 });
    expect(f.budget?.categories).toEqual([{ categoryId: 'food', budget: 70000, spent: 200000 }]);
  });

  test('예산이 없으면 없다', () => {
    expect(facts({ period: AUGUST, transactions }).budget).toBeUndefined();
  });
});

describe('이유 태그와 후회', () => {
  const transactions = [
    tx('2026-09-21', 12000, { reasonTagId: 'impulse', satisfaction: 'regret' }),
    tx('2026-09-22', 8000, { reasonTagId: 'impulse' }),
    tx('2026-09-22', 30000, { reasonTagId: 'need', satisfaction: 'regret' }),
    tx('2026-09-23', 5000),
    tx('2026-09-24', 90000, { reasonTagId: 'need', satisfaction: 'regret', isFixed: true }),
  ];

  test('태그별 합계를 큰 순서로 낸다. 태그 없는 지출과 고정비는 뺀다', () => {
    expect(facts({ transactions }).reasonTags).toEqual([
      { reasonTagId: 'need', amount: 30000 },
      { reasonTagId: 'impulse', amount: 20000 },
    ]);
  });

  test('"후회" 지출 합계는 변동비만이다', () => {
    expect(facts({ transactions }).regret).toBe(42000);
  });
});

describe('최대 단일 지출(변동비)', () => {
  test('고정비는 빼고, 같은 금액이면 이른 날이다', () => {
    const f = facts({
      transactions: [
        tx('2026-09-24', 45000, { memo: '저녁' }),
        tx('2026-09-22', 45000, { memo: '점심' }),
        tx('2026-09-21', 500000, { isFixed: true }),
      ],
    });
    expect(f.largest).toMatchObject({ amount: 45000, date: '2026-09-22', memo: '점심' });
  });

  test('변동비가 없으면 없다', () => {
    expect(facts({ transactions: [] }).largest).toBeUndefined();
  });
});

describe('무지출일(변동비 지출이 없는 날)', () => {
  const transactions = [
    tx('2026-09-21', 1000),
    tx('2026-09-21', 2000),
    tx('2026-09-23', 1000),
    tx('2026-09-24', 500000, { isFixed: true }),
    tx('2026-09-25', 3000000, { type: 'income' }),
  ];

  test('고정비와 수입만 있는 날도 무지출일이다', () => {
    expect(facts({ transactions }).noSpendDays).toBe(5);
  });

  test('첫 기록일 전의 날은 세지 않는다', () => {
    // 23 ~ 27일 중 23일에만 썼다
    const f = facts({ transactions: transactions.slice(2), firstRecordDate: '2026-09-23' });
    expect(f.noSpendDays).toBe(4);
  });
});

describe('지출이 가장 많은 날·요일(변동비)', () => {
  test('주간은 가장 많이 쓴 날이고, 같으면 이른 날이다', () => {
    const f = facts({
      transactions: [
        tx('2026-09-22', 10000),
        tx('2026-09-22', 5000),
        tx('2026-09-21', 15000),
        tx('2026-09-23', 90000, { isFixed: true }),
      ],
    });
    expect(f.busiestDay).toEqual({ date: '2026-09-21', amount: 15000 });
    expect(f.busiestWeekday).toBeUndefined();
  });

  test('월간은 요일별 합계가 가장 큰 요일이다(월요일 0)', () => {
    const f = facts({
      period: AUGUST,
      transactions: [
        tx('2026-08-07', 30000), // 금
        tx('2026-08-14', 30000), // 금
        tx('2026-08-10', 50000), // 월
      ],
    });
    expect(f.busiestWeekday).toEqual({ weekday: 4, amount: 60000 });
    expect(f.busiestDay).toBeUndefined();
  });
});

describe('같은 메모가 반복된 지출(변동비, 메모 완전 일치)', () => {
  test('2번 이상 나온 메모를 횟수 순, 같으면 금액 순으로 3개까지 낸다', () => {
    const f = facts({
      transactions: [
        ...['2026-09-21', '2026-09-22', '2026-09-23'].map(d => tx(d, 4500, { memo: '커피' })),
        tx('2026-09-21', 9000, { memo: '택시' }),
        tx('2026-09-24', 9000, { memo: '택시' }),
        tx('2026-09-22', 3000, { memo: '편의점' }),
        tx('2026-09-25', 3000, { memo: '편의점' }),
        tx('2026-09-23', 1000, { memo: '빵' }),
        tx('2026-09-26', 1000, { memo: '빵' }),
        tx('2026-09-26', 1000, { memo: '커피 ' }), // 완전 일치가 아니다
        tx('2026-09-27', 1000, { memo: '혼자' }),
        tx('2026-09-24', 500000, { memo: '월세', isFixed: true }),
        tx('2026-09-25', 500000, { memo: '월세', isFixed: true }),
      ],
    });
    expect(f.repeatedMemos).toEqual([
      { memo: '커피', count: 3, amount: 13500 },
      { memo: '택시', count: 2, amount: 18000 },
      { memo: '편의점', count: 2, amount: 6000 },
    ]);
  });

  test('빈 메모는 세지 않는다', () => {
    const f = facts({
      transactions: [tx('2026-09-21', 1000, { memo: '' }), tx('2026-09-22', 1000, { memo: '' })],
    });
    expect(f.repeatedMemos).toEqual([]);
  });
});

describe('수입 대비 지출률(월간, 수입 기록이 있을 때만)', () => {
  const transactions = [
    tx('2026-08-10', 2000000, { type: 'income', categoryId: 'salary' }),
    tx('2026-08-20', 500000, { type: 'income', categoryId: 'side' }),
    tx('2026-08-05', 600000, { isFixed: true }),
    tx('2026-08-06', 400000),
  ];

  test('지출은 고정비를 포함한 전체다', () => {
    expect(facts({ period: AUGUST, transactions }).incomeRatio).toEqual({
      income: 2500000,
      expense: 1000000,
    });
  });

  test('수입 기록이 없으면 없다', () => {
    expect(
      facts({ period: AUGUST, transactions: transactions.slice(2) }).incomeRatio,
    ).toBeUndefined();
  });

  test('주간에는 없다', () => {
    const f = facts({ period: { kind: 'weekly', start: '2026-08-03' }, transactions });
    expect(f.incomeRatio).toBeUndefined();
  });
});
