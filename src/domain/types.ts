/**
 * PRD 7장 데이터 모델. 금액은 원 단위 양의 정수, 날짜는 로컬 `YYYY-MM-DD`, 달은 `YYYY-MM`(date.ts)이다.
 * 없는 값은 SQLite 열처럼 null이다. 계산 함수는 필요한 필드만 Pick으로 받는다.
 */

export type Transaction = {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  date: string;
  categoryId: string;
  reasonTagId: string | null;
  satisfaction: 'regret' | 'neutral' | 'satisfied' | null;
  memo: string | null;
  paymentMethod: 'card' | 'cash' | 'transfer' | null;
  isFixed: boolean;
  /** isFixed인 거래만 */
  fixedCostId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Category = {
  id: string;
  type: 'expense' | 'income';
  name: string;
  sortOrder: number;
  hidden: boolean;
  isDefault: boolean;
};

/** 한 달의 예산은 effectiveFrom이 그 달 이하인 것 중 가장 늦은 것이다(PRD 4.3) */
export type Budget = {
  effectiveFrom: string;
  total: number;
  /** categoryId → 금액. 예산을 정한 카테고리만 있다 */
  categoryBudgets: Record<string, number>;
};

export type FixedCost = {
  id: string;
  name: string;
  /** 예상 금액. 입력 폼 기본값으로만 쓴다(PRD 4.4) */
  amount: number;
  categoryId: string;
  /** 1~31. 그 달에 없는 날이면 말일로 본다 */
  dayOfMonth: number;
  paymentMethod: Transaction['paymentMethod'];
  sortOrder: number;
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
};

/** 예산·지표에 쓰는 변동비 지출. 고정비는 예산과 대부분의 지표에서 뺀다(PRD 4.3, 4.6) */
export function isVariableExpense(tx: Pick<Transaction, 'type' | 'isFixed'>) {
  return tx.type === 'expense' && !tx.isFixed;
}
