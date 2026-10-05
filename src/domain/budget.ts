import { daysInMonth } from './date';
import { type Budget, type Transaction, isVariableExpense } from './types';

/** 예산은 변동비에만 적용한다. 수입은 예산을 늘리지 않는다(PRD 4.3) */
type Spending = Pick<Transaction, 'type' | 'isFixed' | 'amount' | 'date' | 'categoryId'>;

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
 * 홈의 이번 달 예산과 소비 속도(PRD 4.3 표). 예산이 없는 달이면 없다. 총예산이 0원이어도 없다(비율을 낼 수 없다).
 * 비율은 화면이 `formatPercent(spent, total)`, `formatPercent(dayOfMonth, monthDays)`로 쓴다.
 */
export function monthStatus(budgets: Budget[], transactions: Spending[], today: string) {
  const month = today.slice(0, 7);
  const budget = budgetForMonth(budgets, month);
  if (!budget || budget.total <= 0) return undefined;

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
