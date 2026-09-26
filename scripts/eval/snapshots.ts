import type { Facts } from '../../src/domain/facts';
import type { Names } from '../../src/retro/keys';

/**
 * 평가 하네스 입력(PRD 6장). 고정된 facts 스냅샷 20개로, 직전 기간 없음·기록 적음·예산 초과·고정비 비중이 큼 같은
 * 경계 사례를 담는다. 카테고리·태그 id는 기본값 마이그레이션(0001_seed.sql)의 순서다.
 */
export type Snapshot = { id: string; note: string; facts: Facts; names: Names };

const names: Names = {
  categories: new Map([
    [1, '식비'],
    [2, '카페·간식'],
    [3, '배달'],
    [4, '교통'],
    [5, '쇼핑'],
    [6, '생활'],
    [7, '주거·통신'],
    [8, '문화·여가'],
    [9, '의료·건강'],
    [10, '경조사·선물'],
    [11, '기타'],
  ]),
  reasonTags: new Map([
    [1, '필요'],
    [2, '충동'],
    [3, '보상·스트레스'],
    [4, '약속·사교'],
    [5, '습관'],
    [6, '선물'],
  ]),
};

const expense = (
  id: number,
  amount: number,
  date: string,
  categoryId: number,
  memo: string | null,
) => ({
  id,
  type: 'expense' as const,
  amount,
  date,
  categoryId,
  reasonTagId: null,
  satisfaction: null,
  memo,
  isFixed: false,
});

/** 스파이크와 같은 한 주(9월 21~27일) */
const week: Facts = {
  kind: 'weekly',
  start: '2026-09-21',
  end: '2026-09-27',
  variableCount: 14,
  total: 412300,
  variable: 187300,
  fixed: 225000,
  change: { previous: 154900, amount: 32400 },
  categories: [
    { categoryId: 3, amount: 68000 },
    { categoryId: 1, amount: 41200 },
    { categoryId: 2, amount: 23600 },
    { categoryId: 4, amount: 20000 },
    { categoryId: 5, amount: 18000 },
    { categoryId: 6, amount: 16500 },
  ],
  topCategoryChanges: [
    { categoryId: 3, current: 68000, previous: 39000, change: 29000 },
    { categoryId: 1, current: 41200, previous: 53500, change: -12300 },
    { categoryId: 2, current: 23600, previous: 19500, change: 4100 },
  ],
  budget: {
    budget: 280000,
    spent: 187300,
    categories: [{ categoryId: 1, budget: 70000, spent: 41200 }],
  },
  reasonTags: [
    { reasonTagId: 2, amount: 54000 },
    { reasonTagId: 3, amount: 38500 },
    { reasonTagId: 1, amount: 30000 },
  ],
  regret: 47000,
  largest: expense(9, 32000, '2026-09-24', 3, '야식 치킨'),
  noSpendDays: 1,
  busiestDay: { date: '2026-09-26', amount: 71500 },
  busiestWeekday: undefined,
  repeatedMemos: [{ memo: '편의점 커피', count: 5, amount: 12500 }],
  incomeRatio: undefined,
};

/** 8월 한 달 */
const month: Facts = {
  kind: 'monthly',
  start: '2026-08-01',
  end: '2026-08-31',
  variableCount: 82,
  total: 1964000,
  variable: 1184000,
  fixed: 780000,
  change: { previous: 1093000, amount: 91000 },
  categories: [
    { categoryId: 1, amount: 312000 },
    { categoryId: 3, amount: 241000 },
    { categoryId: 5, amount: 205000 },
    { categoryId: 4, amount: 121000 },
    { categoryId: 8, amount: 120000 },
    { categoryId: 2, amount: 98000 },
    { categoryId: 6, amount: 87000 },
  ],
  topCategoryChanges: [
    { categoryId: 5, current: 205000, previous: 121000, change: 84000 },
    { categoryId: 3, current: 241000, previous: 204000, change: 37000 },
    { categoryId: 8, current: 120000, previous: 150000, change: -30000 },
  ],
  budget: {
    budget: 1200000,
    spent: 1184000,
    categories: [{ categoryId: 1, budget: 300000, spent: 312000 }],
  },
  reasonTags: [
    { reasonTagId: 1, amount: 410000 },
    { reasonTagId: 2, amount: 188000 },
    { reasonTagId: 4, amount: 142000 },
  ],
  regret: 96000,
  largest: expense(301, 89000, '2026-08-15', 8, '콘서트'),
  noSpendDays: 3,
  busiestDay: undefined,
  busiestWeekday: { weekday: 5, amount: 312000 },
  repeatedMemos: [
    { memo: '편의점 커피', count: 14, amount: 35000 },
    { memo: '점심 도시락', count: 9, amount: 58500 },
    { memo: '택시', count: 6, amount: 71400 },
  ],
  incomeRatio: { income: 3200000, expense: 1964000 },
};

const snapshot = (id: string, note: string, facts: Facts, override?: Partial<Names>) => ({
  id,
  note,
  facts,
  names: { ...names, ...override },
});

export const SNAPSHOTS: Snapshot[] = [
  snapshot('week-base', '스파이크와 같은 한 주. 배달 증가, 예산 여유', week),
  snapshot('week-first', '기록 첫 주. 직전 기간과 비교할 수 없다', {
    ...week,
    change: undefined,
    topCategoryChanges: undefined,
  }),
  snapshot('week-few', '변동비 3건뿐인 주', {
    ...week,
    variableCount: 3,
    total: 36500,
    variable: 36500,
    fixed: 0,
    change: { previous: 52000, amount: -15500 },
    categories: [
      { categoryId: 1, amount: 24000 },
      { categoryId: 2, amount: 12500 },
    ],
    topCategoryChanges: [{ categoryId: 1, current: 24000, previous: 41000, change: -17000 }],
    budget: { budget: 280000, spent: 36500, categories: [] },
    reasonTags: [],
    regret: 0,
    largest: expense(3, 18000, '2026-09-23', 1, null),
    noSpendDays: 4,
    busiestDay: { date: '2026-09-23', amount: 18000 },
    repeatedMemos: [],
  }),
  snapshot('week-over', '주간 예산 초과', {
    ...week,
    variable: 313600,
    total: 538600,
    change: { previous: 201000, amount: 112600 },
    budget: { budget: 280000, spent: 313600, categories: [] },
  }),
  snapshot('week-no-budget', '예산을 정하지 않았다', { ...week, budget: undefined }),
  snapshot('week-fixed-heavy', '월세가 나간 주. 고정비가 변동비의 열 배가 넘는다', {
    ...week,
    total: 1248000,
    variable: 98000,
    fixed: 1150000,
    change: { previous: 121000, amount: -23000 },
    categories: [
      { categoryId: 1, amount: 51000 },
      { categoryId: 2, amount: 27000 },
      { categoryId: 4, amount: 20000 },
    ],
    topCategoryChanges: [{ categoryId: 1, current: 51000, previous: 70000, change: -19000 }],
    budget: { budget: 280000, spent: 98000, categories: [] },
  }),
  snapshot('week-down', '변동비가 크게 줄었다', {
    ...week,
    variable: 142300,
    total: 367300,
    change: { previous: 187300, amount: -45000 },
    topCategoryChanges: [
      { categoryId: 3, current: 23000, previous: 68000, change: -45000 },
      { categoryId: 5, current: 0, previous: 18000, change: -18000 },
      { categoryId: 1, current: 59200, previous: 41200, change: 18000 },
    ],
  }),
  snapshot('week-prev-zero', '직전 주에는 변동비가 없었다(증감률 없음)', {
    ...week,
    change: { previous: 0, amount: 187300 },
    topCategoryChanges: [{ categoryId: 3, current: 68000, previous: 0, change: 68000 }],
  }),
  snapshot('week-dominant', '배달이 변동비의 81%', {
    ...week,
    variable: 210000,
    total: 435000,
    categories: [
      { categoryId: 3, amount: 170000 },
      { categoryId: 2, amount: 25000 },
      { categoryId: 4, amount: 15000 },
    ],
    topCategoryChanges: [{ categoryId: 3, current: 170000, previous: 62000, change: 108000 }],
    change: { previous: 150000, amount: 60000 },
    budget: { budget: 280000, spent: 210000, categories: [] },
  }),
  snapshot('week-spread', '여덟 카테고리에 고르게 썼다', {
    ...week,
    variable: 200000,
    total: 425000,
    categories: [1, 2, 3, 4, 5, 6, 8, 9].map((categoryId, i) => ({
      categoryId,
      amount: 28000 - i * 1000,
    })),
  }),
  snapshot('week-sparse', '태그·후회·반복 메모가 없다', {
    ...week,
    reasonTags: [],
    regret: 0,
    repeatedMemos: [],
    largest: expense(9, 32000, '2026-09-24', 3, null),
  }),
  snapshot('week-regret', '후회한 지출과 충동 태그가 크다', {
    ...week,
    reasonTags: [
      { reasonTagId: 2, amount: 84000 },
      { reasonTagId: 3, amount: 41000 },
    ],
    regret: 96000,
  }),
  snapshot(
    'week-names',
    '이름에 숫자와 영문이 있다',
    {
      ...week,
      largest: expense(9, 32000, '2026-09-24', 3, '2층 카페 케이크'),
      repeatedMemos: [{ memo: 'GS25 커피', count: 5, amount: 12500 }],
    },
    {
      categories: new Map([...names.categories, [3, 'GS25'], [2, 'Starbucks']]),
      reasonTags: new Map([...names.reasonTags, [2, '충동 1순위']]),
    },
  ),
  snapshot('week-no-spend', '무지출일이 5일', {
    ...week,
    variableCount: 4,
    noSpendDays: 5,
    variable: 61000,
    total: 61000,
    fixed: 0,
    categories: [
      { categoryId: 1, amount: 38000 },
      { categoryId: 4, amount: 23000 },
    ],
    change: { previous: 154900, amount: -93900 },
    topCategoryChanges: [{ categoryId: 3, current: 0, previous: 39000, change: -39000 }],
    budget: { budget: 280000, spent: 61000, categories: [] },
    repeatedMemos: [],
  }),
  snapshot('week-category-over', '총예산은 여유, 배달 예산만 넘었다', {
    ...week,
    budget: {
      budget: 280000,
      spent: 187300,
      categories: [
        { categoryId: 1, budget: 70000, spent: 41200 },
        { categoryId: 3, budget: 40000, spent: 68000 },
      ],
    },
  }),
  snapshot('week-same', '변동비가 지난주와 같다', {
    ...week,
    change: { previous: 187300, amount: 0 },
  }),
  snapshot('month-base', '8월. 수입 있음, 예산 안, 식비 예산만 초과', month),
  snapshot('month-deficit', '수입보다 많이 썼다', {
    ...month,
    incomeRatio: { income: 1750000, expense: 1964000 },
  }),
  snapshot('month-no-income', '수입 기록이 없고 예산을 넘었다', {
    ...month,
    incomeRatio: undefined,
    budget: { budget: 1000000, spent: 1184000, categories: [] },
  }),
  snapshot('month-first', '기록 첫 달. 비교 없음', {
    ...month,
    change: undefined,
    topCategoryChanges: undefined,
  }),
];
