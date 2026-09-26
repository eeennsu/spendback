import { budgetForMonth, weeklyBudget } from './budget';
import { addDays, daysInMonth, weekday } from './date';
import { type Budget, type Category, type Transaction, isVariableExpense } from './types';

type Tx = Pick<
  Transaction,
  | 'id'
  | 'type'
  | 'amount'
  | 'date'
  | 'categoryId'
  | 'reasonTagId'
  | 'satisfaction'
  | 'memo'
  | 'isFixed'
>;

/** 주간은 월요일 start부터 일요일까지, 월간은 start(`YYYY-MM-01`)가 있는 달력 월이다 */
export type Period = { kind: 'weekly' | 'monthly'; start: string };

export type FactsInput = {
  period: Period;
  /** 이번 기간과 직전 기간의 거래. 범위 밖은 무시한다 */
  transactions: Tx[];
  /** 가장 이른 거래의 날짜. 기록이 없으면 undefined */
  firstRecordDate: string | undefined;
  budgets: Budget[];
  /** 증감 상위 3개에서 동점을 가르는 카테고리 순서. 숨긴 카테고리도 넣는다 */
  categories: Pick<Category, 'id' | 'sortOrder'>[];
};

function periodEnd({ kind, start }: Period) {
  if (kind === 'weekly') return addDays(start, 6);
  const month = start.slice(0, 7);
  return `${month}-${daysInMonth(month)}`;
}

function previousStart({ kind, start }: Period) {
  return kind === 'weekly' ? addDays(start, -7) : `${addDays(start, -1).slice(0, 7)}-01`;
}

const sum = (txs: Tx[]) => txs.reduce((total, tx) => total + tx.amount, 0);

function totalsBy<K>(txs: Tx[], keyOf: (tx: Tx) => K | null) {
  const totals = new Map<K, number>();
  for (const tx of txs) {
    const key = keyOf(tx);
    if (key !== null) totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  return totals;
}

/** 합계가 가장 큰 키. 같으면 앞선 키(이른 날, 앞 요일)다 */
function largestEntry<K extends string | number>(totals: Map<K, number>): [K, number] | undefined {
  return [...totals].sort(([ka, a], [kb, b]) => b - a || (ka < kb ? -1 : 1))[0];
}

/**
 * 회고의 facts(PRD 4.6 표). 계산은 모두 여기서 하고 LLM은 숫자를 쓰지 않는다(PRD 2장).
 * 값은 원 단위 정수와 id다. 비율·증감률은 회고 파이프라인이 formatPercent로 쓰고, facts 키 이름도 거기서 정한다.
 * 고정비는 특정 날짜에 몰려 비교를 왜곡하므로 총지출과 수입 대비 지출률 말고는 변동비만 쓴다.
 */
export function computeFacts({
  period,
  transactions,
  firstRecordDate,
  budgets,
  categories,
}: FactsInput) {
  const { kind, start } = period;
  const end = periodEnd(period);
  const prevStart = previousStart(period);
  const between = (from: string, to: string) =>
    transactions.filter(tx => tx.date >= from && tx.date <= to);

  const current = between(start, end);
  const expenses = current.filter(tx => tx.type === 'expense');
  const variable = expenses.filter(isVariableExpense);
  const variableTotal = sum(variable);

  // 직전 기간이 첫 기록일과 겹치면(첫날 포함) 반쪽 기간이라 비교하지 않는다
  const comparable = firstRecordDate !== undefined && firstRecordDate < prevStart;
  const previousVariable = between(prevStart, addDays(start, -1)).filter(isVariableExpense);

  const sortOrder = new Map(categories.map(c => [c.id, c.sortOrder]));
  const orderOf = (categoryId: number) => sortOrder.get(categoryId) ?? Infinity;

  const categoryTotals = totalsBy(variable, tx => tx.categoryId);
  const previousCategoryTotals = totalsBy(previousVariable, tx => tx.categoryId);

  const periodBudget =
    kind === 'weekly' ? weeklyBudget(budgets, start) : budgetForMonth(budgets, start.slice(0, 7));

  const memos = new Map<string, { memo: string; count: number; amount: number }>();
  for (const tx of variable) {
    if (!tx.memo) continue;
    const entry = memos.get(tx.memo) ?? { memo: tx.memo, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += tx.amount;
    memos.set(tx.memo, entry);
  }

  // 첫 기록일 전의 날은 기록하지 않은 날이지 쓰지 않은 날이 아니다
  const spendDays = new Set(variable.map(tx => tx.date));
  let noSpendDays = 0;
  const countFrom = firstRecordDate && firstRecordDate > start ? firstRecordDate : start;
  for (let date = countFrom; date <= end; date = addDays(date, 1)) {
    if (!spendDays.has(date)) noSpendDays += 1;
  }

  const busiestDay =
    kind === 'weekly' ? largestEntry(totalsBy(variable, tx => tx.date)) : undefined;
  const busiestWeekday =
    kind === 'monthly' ? largestEntry(totalsBy(variable, tx => weekday(tx.date))) : undefined;
  const largest: Tx | undefined = [...variable].sort(
    (a, b) => b.amount - a.amount || a.date.localeCompare(b.date) || a.id - b.id,
  )[0];
  const income = sum(current.filter(tx => tx.type === 'income'));

  return {
    kind,
    start,
    end,
    /** 변동비 지출 건수. 3건 미만이면 LLM을 부르지 않는다 */
    variableCount: variable.length,
    total: sum(expenses),
    variable: variableTotal,
    fixed: sum(expenses) - variableTotal,
    /** 증감액(이번 − 직전). 직전이 0이면 증감률은 없다 */
    change: comparable
      ? { previous: sum(previousVariable), amount: variableTotal - sum(previousVariable) }
      : undefined,
    /** 합계 큰 순. 비중의 분모는 variable이다 */
    categories: [...categoryTotals]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount || orderOf(a.categoryId) - orderOf(b.categoryId)),
    /** 증감액 절댓값 순, 같으면 이번 금액 큰 순, 그다음 카테고리 순서. 증감 0은 넣지 않는다 */
    topCategoryChanges: comparable
      ? [...new Set([...categoryTotals.keys(), ...previousCategoryTotals.keys()])]
          .map(categoryId => {
            const now = categoryTotals.get(categoryId) ?? 0;
            const before = previousCategoryTotals.get(categoryId) ?? 0;
            return { categoryId, current: now, previous: before, change: now - before };
          })
          .filter(c => c.change !== 0)
          .sort(
            (a, b) =>
              Math.abs(b.change) - Math.abs(a.change) ||
              b.current - a.current ||
              orderOf(a.categoryId) - orderOf(b.categoryId),
          )
          .slice(0, 3)
      : undefined,
    /** 주간은 일할한 예산이다. 예산이 없는 날이 끼면 없다 */
    budget: periodBudget && {
      budget: periodBudget.total,
      spent: variableTotal,
      categories: periodBudget.categoryBudgets.map(({ categoryId, amount }) => ({
        categoryId,
        budget: amount,
        spent: categoryTotals.get(categoryId) ?? 0,
      })),
    },
    /** 합계 큰 순. 태그 없는 지출은 뺀다. 비중의 분모는 variable이다 */
    reasonTags: [...totalsBy(variable, tx => tx.reasonTagId)]
      .map(([reasonTagId, amount]) => ({ reasonTagId, amount }))
      .sort((a, b) => b.amount - a.amount || a.reasonTagId - b.reasonTagId),
    regret: sum(variable.filter(tx => tx.satisfaction === 'regret')),
    /** 같은 금액이면 이른 날 */
    largest,
    noSpendDays,
    busiestDay: busiestDay && { date: busiestDay[0], amount: busiestDay[1] },
    /** 월요일 0 … 일요일 6 */
    busiestWeekday: busiestWeekday && { weekday: busiestWeekday[0], amount: busiestWeekday[1] },
    /** 메모 완전 일치로 2번 이상. 횟수 순, 같으면 금액 순, 3개까지 */
    repeatedMemos: [...memos.values()]
      .filter(m => m.count >= 2)
      .sort((a, b) => b.count - a.count || b.amount - a.amount || (a.memo < b.memo ? -1 : 1))
      .slice(0, 3),
    /** 월간만, 수입 기록이 있을 때만. 지출은 고정비를 포함한다 */
    incomeRatio: kind === 'monthly' && income > 0 ? { income, expense: sum(expenses) } : undefined,
  };
}
