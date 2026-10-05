import { addMonths } from './date';
import { type Transaction, isVariableExpense } from './types';

type Spending = Pick<Transaction, 'type' | 'isFixed' | 'amount' | 'date'>;

/**
 * 오늘이 든 달까지 count개월의 변동비 합계. 오래된 달부터다. 회고 목록 위의 막대가 쓴다(PRD 4.6 목록). 회고 지표와
 * 같이 고정비는 뺀다
 */
export function monthlyVariable(transactions: Spending[], today: string, count: number) {
  const last = today.slice(0, 7);
  const months = Array.from({ length: count }, (_, i) => addMonths(last, i - count + 1));
  const totals = new Map(months.map(month => [month, 0]));
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    if (isVariableExpense(tx) && totals.has(month)) {
      totals.set(month, (totals.get(month) ?? 0) + tx.amount);
    }
  }
  return months.map(month => ({ month, amount: totals.get(month) ?? 0 }));
}
