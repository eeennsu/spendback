import { and, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';

import type { Db } from '.';
import { cardInbox, transactions } from './schema';

/**
 * 카드 알림 대기열과 그 판단에 쓰는 거래 조회(PRD 4.9). 무엇을 넣고 짝짓고 추천할지는 src/cards/inbox.ts가 정한다.
 */

export type InboxRow = typeof cardInbox.$inferSelect;
export type InboxInsert = typeof cardInbox.$inferInsert;

/** 새로 넣은 수. 지문이 같은 알림은 넣지 않는다(같은 배치 안에서도) */
export async function insertInbox(db: Db, rows: InboxInsert[]) {
  if (!rows.length) return 0;
  const inserted = await db
    .insert(cardInbox)
    .values(rows)
    .onConflictDoNothing({ target: cardInbox.fingerprint })
    .returning({ id: cardInbox.id });
  return inserted.length;
}

/** 대기 중인 항목. 결제일이 늦은 것 먼저(읽지 못한 알림은 날짜가 없어 끝), 같으면 나중에 받은 것 먼저 */
export function pendingInbox(db: Db) {
  return db
    .select()
    .from(cardInbox)
    .where(eq(cardInbox.status, 'pending'))
    .orderBy(desc(cardInbox.date), desc(cardInbox.postedAt), desc(cardInbox.id));
}

export function getInbox(db: Db, id: number) {
  return db.select().from(cardInbox).where(eq(cardInbox.id, id)).get();
}

export function updateInbox(db: Db, id: number, patch: Partial<InboxInsert>) {
  return db.update(cardInbox).set(patch).where(eq(cardInbox.id, id));
}

/** 처리한 항목 중 이 시각보다 먼저 받은 것을 지운다. 대기 중인 항목은 남긴다 */
export function pruneInbox(db: Db, before: number) {
  return db
    .delete(cardInbox)
    .where(and(ne(cardInbox.status, 'pending'), lt(cardInbox.postedAt, before)));
}

/** 가맹점이 있는 지출(최근 것 먼저). 정확 일치와 검색의 자료다. 결제대행사 결제는 메모를 가게 이름으로 쓴다 */
export function merchantHistory(db: Db) {
  return db
    .select({
      merchant: sql<string>`${transactions.merchant}`,
      memo: transactions.memo,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(eq(transactions.type, 'expense'), isNotNull(transactions.merchant)))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id));
}

/** 이 날 이후의 가맹점이 있는 지출. 취소 짝짓기의 후보다 */
export function merchantExpensesSince(db: Db, from: string) {
  return db
    .select({
      id: transactions.id,
      merchant: sql<string>`${transactions.merchant}`,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'expense'),
        isNotNull(transactions.merchant),
        gte(transactions.date, from),
      ),
    );
}

/** 그 날들의 지출. 겹친 기록 판정에 쓴다 */
export function expensesOn(db: Db, dates: string[]) {
  if (!dates.length) return Promise.resolve([]);
  return db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
    })
    .from(transactions)
    .where(and(eq(transactions.type, 'expense'), inArray(transactions.date, dates)));
}

export function transactionsByIds(db: Db, ids: number[]) {
  if (!ids.length) return Promise.resolve([]);
  return db.select().from(transactions).where(inArray(transactions.id, ids));
}

/** 추천이 붙은 거래를 출처마다 센다. accepted는 추천 그대로인(지금도 그 카테고리인) 거래다 */
export function suggestionCounts(db: Db) {
  return db
    .select({
      source: transactions.suggestionSource,
      total: sql<number>`count(*)`,
      accepted: sql<number>`sum(${transactions.categoryId} = ${transactions.suggestedCategoryId})`,
    })
    .from(transactions)
    .where(isNotNull(transactions.suggestionSource))
    .groupBy(transactions.suggestionSource);
}
