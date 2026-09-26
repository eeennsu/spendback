import { addDays, daysInMonth } from './date';
import { type Budget, type Transaction, isVariableExpense } from './types';

/** 예산은 변동비에만 적용한다. 수입은 예산을 늘리지 않는다(PRD 4.3) */
type Spending = Pick<Transaction, 'type' | 'isFixed' | 'amount' | 'date' | 'categoryId'>;

type PeriodBudget = Pick<Budget, 'total' | 'categoryBudgets'>;

/** 그 달(`YYYY-MM`)의 예산. effectiveFrom이 그 달 이하인 것 중 가장 늦은 것이다 */
export function budgetForMonth(budgets: Budget[], month: string) {
  let found: Budget | undefined;
  for (const budget of budgets) {
    if (budget.effectiveFrom <= month && (!found || budget.effectiveFrom > found.effectiveFrom)) {
      found = budget;
    }
  }
  return found;
}

/**
 * 월요일 start부터 7일의 예산. 날마다 "그 달 예산 ÷ 그 달 일수"를 더하고 원 단위로 내린다.
 * 하루라도 예산이 없으면 없고, 카테고리 예산은 모든 날에 있는 카테고리만 넣는다(PRD 4.3).
 */
export function weeklyBudget(budgets: Budget[], start: string): PeriodBudget | undefined {
  const daysByMonth = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const month = addDays(start, i).slice(0, 7);
    daysByMonth.set(month, (daysByMonth.get(month) ?? 0) + 1);
  }

  const slices: Array<{ budget: Budget; days: number; monthDays: number }> = [];
  for (const [month, days] of daysByMonth) {
    const budget = budgetForMonth(budgets, month);
    if (!budget) return undefined;
    slices.push({ budget, days, monthDays: daysInMonth(month) });
  }

  const prorate = (amountOf: (budget: Budget) => number) => {
    // 날마다 부동소수로 더하면 정확히 떨어지는 합이 1원 모자랄 수 있다(31일 달 둘에 걸친 주).
    // 분모를 통분해 한 번에 나눈다
    const denominator = slices.reduce((d, s) => d * s.monthDays, 1);
    const numerator = slices.reduce(
      (n, s) => n + amountOf(s.budget) * s.days * (denominator / s.monthDays),
      0,
    );
    return Math.floor(numerator / denominator);
  };

  const amountFor = (budget: Budget, categoryId: number) =>
    budget.categoryBudgets.find(c => c.categoryId === categoryId)?.amount;
  const categoryBudgets = slices[0].budget.categoryBudgets
    .filter(({ categoryId }) => slices.every(s => amountFor(s.budget, categoryId) !== undefined))
    .map(({ categoryId }) => ({
      categoryId,
      amount: prorate(b => amountFor(b, categoryId) ?? 0),
    }));
  return { total: prorate(b => b.total), categoryBudgets };
}

/**
 * 홈의 이번 달 예산과 소비 속도(PRD 4.3 표). 예산이 없는 달이면 없다.
 * 비율은 화면이 `formatPercent(spent, total)`, `formatPercent(dayOfMonth, monthDays)`로 쓴다.
 */
export function monthStatus(budgets: Budget[], transactions: Spending[], today: string) {
  const month = today.slice(0, 7);
  const budget = budgetForMonth(budgets, month);
  if (!budget) return undefined;

  const spentBy = (categoryId?: number) =>
    transactions
      .filter(
        tx =>
          isVariableExpense(tx) &&
          tx.date.startsWith(month) &&
          tx.date <= today &&
          (categoryId === undefined || tx.categoryId === categoryId),
      )
      .reduce((sum, tx) => sum + tx.amount, 0);

  const spent = spentBy();
  const remaining = budget.total - spent;
  const dayOfMonth = Number(today.slice(8));
  const monthDays = daysInMonth(month);
  // 오늘은 아직 쓸 수 있는 날이라 남은 일수에 넣는다
  const remainingDays = monthDays - dayOfMonth + 1;

  return {
    total: budget.total,
    spent,
    /** 0보다 작으면 초과 상태이고 -remaining이 초과액이다 */
    remaining,
    remainingDays,
    /** 하루 쓸 수 있는 금액. 초과 상태에서는 없다 */
    dailyAllowance: remaining < 0 ? undefined : Math.floor(remaining / remainingDays),
    /** 지난 비율(게이지 기준선)은 dayOfMonth ÷ monthDays다. 오늘이 끝날 때까지의 몫이라 1일에도 0이 아니다 */
    dayOfMonth,
    monthDays,
    /** 사용률(spent ÷ total)이 지난 비율보다 크다. 양변에 분모를 곱해 정수로 비교한다 */
    fast: spent * monthDays > dayOfMonth * budget.total,
    categories: budget.categoryBudgets.map(({ categoryId, amount }) => ({
      categoryId,
      budget: amount,
      spent: spentBy(categoryId),
    })),
  };
}
