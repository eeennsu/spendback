import type { Facts } from '../../src/domain/facts';
import type { Names } from '../../src/retro/keys';

/**
 * 평가 하네스 입력(PRD 6장). 고정된 월간 facts 스냅샷 20개로, 직전 기간 없음·기록 적음·예산 초과·고정비 비중이
 * 큼 같은 경계 사례를 담는다. 회고는 월간만 있다(PRD 4.6). 카테고리·태그 id는 기본값 마이그레이션(0001_seed.sql)의
 * 순서다.
 */
export type Snapshot = {
  id: string;
  note: string;
  facts: Facts;
  names: Names;
  /**
   * 회고가 꼭 말해야 할 사실. facts 키의 앞부분이고, 첫 것은 headline감이다. 하네스가 "놓친 사실"과
   * "headline 적중"을 센다(PRD 11장 사실 고르기)
   */
  salient?: string[];
};

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

/**
 * LLM 스파이크의 한 주(9월 21~27일)를 한 달치로 늘린 9월. 금액은 주간의 네 배로, 비중·증감률·예산 사용률이 같아
 * 사실을 고르는 순서(src/retro/keys.ts salience)도 그대로다. 다른 9월 스냅샷이 이것을 고쳐 쓴다
 */
const spike: Facts = {
  kind: 'monthly',
  start: '2026-09-01',
  end: '2026-09-30',
  variableCount: 58,
  total: 1649200,
  variable: 749200,
  fixed: 900000,
  change: { previous: 619600, amount: 129600 },
  categories: [
    { categoryId: 3, amount: 272000 },
    { categoryId: 1, amount: 164800 },
    { categoryId: 2, amount: 94400 },
    { categoryId: 4, amount: 80000 },
    { categoryId: 5, amount: 72000 },
    { categoryId: 6, amount: 66000 },
  ],
  // 나머지 카테고리(교통·쇼핑·생활)는 +15,800·+15,400·+15,200원이라 상위 셋에 못 든다
  topCategoryChanges: [
    { categoryId: 3, current: 272000, previous: 156000, change: 116000 },
    { categoryId: 1, current: 164800, previous: 214000, change: -49200 },
    { categoryId: 2, current: 94400, previous: 78000, change: 16400 },
  ],
  budget: {
    budget: 1120000,
    spent: 749200,
    categories: [{ categoryId: 1, budget: 280000, spent: 164800 }],
  },
  reasonTags: [
    { reasonTagId: 2, amount: 216000 },
    { reasonTagId: 3, amount: 154000 },
    { reasonTagId: 1, amount: 120000 },
  ],
  regret: 188000,
  largest: expense(9, 42000, '2026-09-24', 3, '야식 치킨'),
  noSpendDays: 4,
  busiestWeekday: { weekday: 5, amount: 196000 },
  repeatedMemos: [{ memo: '편의점 커피', count: 18, amount: 45000 }],
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
  busiestWeekday: { weekday: 5, amount: 312000 },
  repeatedMemos: [
    { memo: '편의점 커피', count: 14, amount: 35000 },
    { memo: '점심 도시락', count: 9, amount: 58500 },
    { memo: '택시', count: 6, amount: 71400 },
  ],
  incomeRatio: { income: 3200000, expense: 1964000 },
};

const snapshot = (id: string, note: string, facts: Facts, override?: Partial<Names>): Snapshot => ({
  id,
  note,
  facts,
  names: { ...names, ...override },
  salient: SALIENT[id],
});

/** 스냅샷마다 꼭 말해야 할 사실(Snapshot.salient) */
const SALIENT: Record<string, string[]> = {
  'month-spike': ['category.3.change'],
  'month-over': ['budget.'],
  'month-fixed-heavy': ['total.fixed'],
  'month-down': ['total.change'],
  'month-dominant': ['category.3.'],
  'month-regret': ['regret.'],
  'month-no-spend': ['no_spend.'],
  'month-category-over': ['category.3.budget'],
  'month-base': ['category.1.budget'],
  'month-deficit': ['income.'],
  'month-no-income': ['budget.'],
};

export const SNAPSHOTS: Snapshot[] = [
  snapshot('month-spike', '스파이크와 같은 한 주를 한 달로 늘린 9월. 배달 증가, 예산 여유', spike),
  snapshot('month-no-previous', '기록 첫 달, 수입 기록 없음. 직전 기간과 비교할 수 없다', {
    ...spike,
    change: undefined,
    topCategoryChanges: undefined,
  }),
  snapshot('month-few', '변동비 3건뿐인 달', {
    ...spike,
    variableCount: 3,
    total: 146000,
    variable: 146000,
    fixed: 0,
    change: { previous: 208000, amount: -62000 },
    categories: [
      { categoryId: 1, amount: 96000 },
      { categoryId: 2, amount: 50000 },
    ],
    topCategoryChanges: [
      { categoryId: 1, current: 96000, previous: 164000, change: -68000 },
      { categoryId: 2, current: 50000, previous: 44000, change: 6000 },
    ],
    budget: { budget: 1120000, spent: 146000, categories: [] },
    reasonTags: [],
    regret: 0,
    largest: expense(3, 72000, '2026-09-23', 1, null),
    // 세 건이 사흘에 나뉘어 27일은 쓰지 않았다
    noSpendDays: 27,
    busiestWeekday: { weekday: 2, amount: 72000 },
    repeatedMemos: [],
  }),
  snapshot('month-over', '월간 예산 초과', {
    ...spike,
    variable: 1254400,
    total: 2154400,
    change: { previous: 804000, amount: 450400 },
    categories: [
      { categoryId: 3, amount: 340000 },
      { categoryId: 1, amount: 300000 },
      { categoryId: 2, amount: 170000 },
      { categoryId: 4, amount: 160000 },
      { categoryId: 5, amount: 150000 },
      { categoryId: 6, amount: 134400 },
    ],
    topCategoryChanges: [
      { categoryId: 3, current: 340000, previous: 156000, change: 184000 },
      { categoryId: 2, current: 170000, previous: 78000, change: 92000 },
      { categoryId: 1, current: 300000, previous: 214000, change: 86000 },
    ],
    budget: { budget: 1120000, spent: 1254400, categories: [] },
  }),
  snapshot('month-no-budget', '예산을 정하지 않았다', { ...spike, budget: undefined }),
  snapshot('month-fixed-heavy', '월세가 나간 달. 고정비가 총지출의 4분의 3이다', {
    ...spike,
    total: 1542000,
    variable: 392000,
    fixed: 1150000,
    change: { previous: 484000, amount: -92000 },
    categories: [
      { categoryId: 1, amount: 204000 },
      { categoryId: 2, amount: 108000 },
      { categoryId: 4, amount: 80000 },
    ],
    topCategoryChanges: [
      { categoryId: 1, current: 204000, previous: 280000, change: -76000 },
      { categoryId: 2, current: 108000, previous: 124000, change: -16000 },
    ],
    budget: { budget: 1120000, spent: 392000, categories: [] },
    reasonTags: [
      { reasonTagId: 2, amount: 84000 },
      { reasonTagId: 3, amount: 60000 },
      { reasonTagId: 1, amount: 52000 },
    ],
    regret: 190000,
    largest: expense(9, 48000, '2026-09-24', 1, '가족 외식'),
    busiestWeekday: { weekday: 3, amount: 104000 },
  }),
  snapshot('month-down', '변동비가 크게 줄었다', {
    ...spike,
    variable: 569200,
    total: 1469200,
    change: { previous: 749200, amount: -180000 },
    categories: [
      { categoryId: 1, amount: 236800 },
      { categoryId: 2, amount: 94400 },
      { categoryId: 3, amount: 92000 },
      { categoryId: 4, amount: 80000 },
      { categoryId: 6, amount: 66000 },
    ],
    topCategoryChanges: [
      { categoryId: 3, current: 92000, previous: 272000, change: -180000 },
      { categoryId: 1, current: 236800, previous: 164800, change: 72000 },
      { categoryId: 5, current: 0, previous: 72000, change: -72000 },
    ],
    budget: {
      budget: 1120000,
      spent: 569200,
      categories: [{ categoryId: 1, budget: 280000, spent: 236800 }],
    },
  }),
  snapshot('month-prev-zero', '직전 달에는 변동비가 없었다(증감률 없음)', {
    ...spike,
    change: { previous: 0, amount: 749200 },
    topCategoryChanges: [
      { categoryId: 3, current: 272000, previous: 0, change: 272000 },
      { categoryId: 1, current: 164800, previous: 0, change: 164800 },
      { categoryId: 2, current: 94400, previous: 0, change: 94400 },
    ],
  }),
  snapshot('month-dominant', '배달이 변동비의 81%', {
    ...spike,
    variable: 840000,
    total: 1740000,
    categories: [
      { categoryId: 3, amount: 680000 },
      { categoryId: 2, amount: 100000 },
      { categoryId: 4, amount: 60000 },
    ],
    topCategoryChanges: [{ categoryId: 3, current: 680000, previous: 248000, change: 432000 }],
    change: { previous: 408000, amount: 432000 },
    budget: { budget: 1120000, spent: 840000, categories: [] },
  }),
  snapshot('month-spread', '여덟 카테고리에 고르게 썼다', {
    ...spike,
    variable: 784000,
    total: 1684000,
    change: { previous: 650000, amount: 134000 },
    categories: [1, 2, 3, 4, 5, 6, 8, 9].map((categoryId, i) => ({
      categoryId,
      amount: 112000 - i * 4000,
    })),
    topCategoryChanges: [
      { categoryId: 3, current: 104000, previous: 70000, change: 34000 },
      { categoryId: 5, current: 96000, previous: 70000, change: 26000 },
      { categoryId: 4, current: 100000, previous: 80000, change: 20000 },
    ],
    budget: {
      budget: 1120000,
      spent: 784000,
      categories: [{ categoryId: 1, budget: 280000, spent: 112000 }],
    },
  }),
  snapshot('month-sparse', '태그·후회·반복 메모가 없다', {
    ...spike,
    reasonTags: [],
    regret: 0,
    repeatedMemos: [],
    largest: expense(9, 42000, '2026-09-24', 3, null),
  }),
  snapshot('month-regret', '후회한 지출과 충동 태그가 크다', {
    ...spike,
    reasonTags: [
      { reasonTagId: 2, amount: 336000 },
      { reasonTagId: 3, amount: 164000 },
    ],
    regret: 384000,
  }),
  snapshot(
    'month-names',
    '이름에 숫자와 영문이 있다',
    {
      ...spike,
      largest: expense(9, 42000, '2026-09-24', 3, '2층 카페 케이크'),
      repeatedMemos: [{ memo: 'GS25 커피', count: 18, amount: 45000 }],
    },
    {
      categories: new Map([...names.categories, [3, 'GS25'], [2, 'Starbucks']]),
      reasonTags: new Map([...names.reasonTags, [2, '충동 1순위']]),
    },
  ),
  snapshot('month-no-spend', '무지출일이 15일', {
    ...spike,
    variableCount: 17,
    noSpendDays: 15,
    variable: 244000,
    total: 244000,
    fixed: 0,
    categories: [
      { categoryId: 1, amount: 152000 },
      { categoryId: 4, amount: 92000 },
    ],
    change: { previous: 619600, amount: -375600 },
    topCategoryChanges: [
      { categoryId: 3, current: 0, previous: 156000, change: -156000 },
      { categoryId: 2, current: 0, previous: 78000, change: -78000 },
      { categoryId: 1, current: 152000, previous: 214000, change: -62000 },
    ],
    budget: { budget: 1120000, spent: 244000, categories: [] },
    reasonTags: [
      { reasonTagId: 1, amount: 90000 },
      { reasonTagId: 2, amount: 60000 },
      { reasonTagId: 3, amount: 40000 },
    ],
    regret: 48000,
    largest: expense(9, 42000, '2026-09-24', 1, '가족 외식'),
    busiestWeekday: { weekday: 3, amount: 74000 },
    repeatedMemos: [],
  }),
  snapshot('month-category-over', '총예산은 여유, 배달 예산만 넘었다', {
    ...spike,
    budget: {
      budget: 1120000,
      spent: 749200,
      categories: [
        { categoryId: 1, budget: 280000, spent: 164800 },
        { categoryId: 3, budget: 160000, spent: 272000 },
      ],
    },
  }),
  snapshot('month-same', '변동비가 지난달과 같다', {
    ...spike,
    change: { previous: 749200, amount: 0 },
    topCategoryChanges: [
      { categoryId: 3, current: 272000, previous: 156000, change: 116000 },
      { categoryId: 1, current: 164800, previous: 226800, change: -62000 },
      { categoryId: 2, current: 94400, previous: 148400, change: -54000 },
    ],
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
