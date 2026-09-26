import type { budgets, categories, fixedCosts, transactions } from '../db/schema';

/**
 * PRD 7장 데이터 모델의 타입. 정본은 src/db/schema.ts다. 없는 값은 null이다.
 * 계산 함수는 필요한 필드만 Pick으로 받는다.
 */
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type FixedCost = typeof fixedCosts.$inferSelect;

/** 예산·지표에 쓰는 변동비 지출. 고정비는 예산과 대부분의 지표에서 뺀다(PRD 4.3, 4.6) */
export function isVariableExpense(tx: Pick<Transaction, 'type' | 'isFixed'>) {
  return tx.type === 'expense' && !tx.isFixed;
}
