import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';

import type { Db } from '.';
import { transactions } from './schema';

export type TransactionRow = typeof transactions.$inferSelect;
export type TransactionInput = Omit<
  typeof transactions.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>;

/** 지출만 받는 필드(PRD 4.1). 수입이면 비운다 */
function normalize(input: TransactionInput): TransactionInput {
  if (input.type === 'expense') {
    return { ...input, fixedCostId: input.isFixed ? (input.fixedCostId ?? null) : null };
  }
  return {
    ...input,
    reasonTagId: null,
    satisfaction: null,
    isFixed: false,
    fixedCostId: null,
  };
}

export async function addTransaction(db: Db, input: TransactionInput) {
  const [row] = await db
    .insert(transactions)
    .values(normalize(input))
    .returning({ id: transactions.id });
  return row.id;
}

export function updateTransaction(db: Db, id: number, input: TransactionInput) {
  return db.update(transactions).set(normalize(input)).where(eq(transactions.id, id));
}

export function deleteTransaction(db: Db, id: number) {
  return db.delete(transactions).where(eq(transactions.id, id));
}

export function getTransaction(db: Db, id: number) {
  return db.select().from(transactions).where(eq(transactions.id, id)).get();
}

/** 날짜 범위(양 끝 포함)의 거래. 최근 날짜 먼저, 같은 날은 나중에 쓴 것 먼저 */
export function transactionsBetween(db: Db, from: string, to: string) {
  return db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id));
}

export type HistoryFilter = {
  from: string;
  to: string;
  type?: 'expense' | 'income';
  categoryIds?: number[];
  reasonTagIds?: number[];
};

/** 내역 필터(PRD 4.5). 비운 조건은 거르지 않는다 */
export function filterTransactions(db: Db, filter: HistoryFilter) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.date, filter.from),
        lte(transactions.date, filter.to),
        filter.type ? eq(transactions.type, filter.type) : undefined,
        filter.categoryIds?.length
          ? inArray(transactions.categoryId, filter.categoryIds)
          : undefined,
        filter.reasonTagIds?.length
          ? inArray(transactions.reasonTagId, filter.reasonTagIds)
          : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id));
}

/** 홈의 최근 지출 */
export function recentExpenses(db: Db, limit = 5) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.type, 'expense'))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit);
}

/** 가장 이른 거래의 날짜. 회고의 비교 기준과 무지출일 계산에 쓴다(PRD 4.6). 기록이 없으면 undefined */
export async function firstRecordDate(db: Db) {
  const row = await db
    .select({ date: transactions.date })
    .from(transactions)
    .orderBy(asc(transactions.date))
    .limit(1)
    .get();
  return row?.date;
}

/** 회고 목록용. 지출의 날짜와 고정비 여부만 읽는다 */
export function expenseDays(db: Db) {
  return db
    .select({ date: transactions.date, isFixed: transactions.isFixed })
    .from(transactions)
    .where(eq(transactions.type, 'expense'))
    .orderBy(asc(transactions.date));
}

/**
 * 메모 제안(docs/DESIGN.md 4.3). 칸이 비면 최근 메모, 입력하면 그 글자를 포함하는 과거 메모 중 최근 것을 limit개까지.
 * 같은 메모는 한 번만 나온다
 */
export async function memoSuggestions(db: Db, text: string, type: 'expense' | 'income', limit = 3) {
  const query = text.trim();
  const rows = await db
    .select({ memo: transactions.memo, last: sql<number>`max(${transactions.createdAt})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, type),
        isNotNull(transactions.memo),
        ne(transactions.memo, ''),
        query ? sql`instr(${transactions.memo}, ${query}) > 0` : undefined,
        // 입력한 그대로인 메모는 제안할 필요가 없다
        query ? ne(transactions.memo, query) : undefined,
      ),
    )
    .groupBy(transactions.memo)
    .orderBy(desc(sql`max(${transactions.createdAt})`))
    .limit(limit);
  return rows.flatMap(row => (row.memo ? [row.memo] : []));
}

/** 같은 메모에 마지막으로 고른 카테고리(PRD 4.1). 없으면 undefined */
export async function lastCategoryForMemo(db: Db, memo: string, type: 'expense' | 'income') {
  const row = await db
    .select({ categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.type, type), eq(transactions.memo, memo)))
    .orderBy(desc(transactions.createdAt), desc(transactions.id))
    .limit(1)
    .get();
  return row?.categoryId;
}
