import type { Facts } from '../src/domain/facts';

/** 스파이크의 facts(9월 셋째 주)와 같은 숫자를 9월 한 달로 둔다. 주간 회고는 2026-10-05에 뺐다 */
export const sampleFacts: Facts = {
  kind: 'monthly',
  start: '2026-09-01',
  end: '2026-09-30',
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
    { categoryId: 7, current: 0, previous: 30000, change: -30000 },
  ],
  budget: {
    budget: 280000,
    spent: 187300,
    categories: [{ categoryId: 1, budget: 70000, spent: 41200 }],
  },
  reasonTags: [{ reasonTagId: 2, amount: 54000 }],
  regret: 47000,
  largest: {
    id: 9,
    type: 'expense',
    amount: 32000,
    date: '2026-09-24',
    categoryId: 3,
    reasonTagId: null,
    satisfaction: null,
    memo: '야식 치킨',
    isFixed: false,
  },
  noSpendDays: 1,
  busiestWeekday: { weekday: 5, amount: 71500 },
  repeatedMemos: [{ memo: '편의점 커피', count: 5, amount: 12500 }],
  incomeRatio: undefined,
  follow: undefined,
};

export const sampleNames = {
  categories: new Map([
    [1, '식비'],
    [2, '카페·간식'],
    [3, '배달'],
    [4, '교통'],
    [5, '쇼핑'],
    [6, '생활'],
    [7, '문화·여가'],
  ]),
  reasonTags: new Map([[2, '충동']]),
};
