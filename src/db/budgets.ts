import { asc } from 'drizzle-orm';

import type { Db } from '.';
import { budgets } from './schema';

export type BudgetRow = typeof budgets.$inferSelect;

export function allBudgets(db: Db) {
  return db.select().from(budgets).orderBy(asc(budgets.effectiveFrom));
}

/**
 * 그 달(`YYYY-MM`)부터 적용하는 예산(PRD 4.3). 다음 달에도 이어 쓰고, 지난 달의 예산은 고치지 않는다.
 * 같은 달에 다시 정하면 덮어쓴다
 */
export function setBudget(
  db: Db,
  month: string,
  total: number,
  categoryBudgets: BudgetRow['categoryBudgets'],
) {
  const row = { effectiveFrom: month, total, categoryBudgets };
  return db
    .insert(budgets)
    .values(row)
    .onConflictDoUpdate({ target: budgets.effectiveFrom, set: { total, categoryBudgets } });
}
