import { and, asc, eq, max } from 'drizzle-orm';

import type { Db } from '.';
import { categories, fixedCosts, reasonTags } from './schema';

/**
 * 사용자가 편집하는 목록: 카테고리, 이유 태그, 고정비 항목(PRD 4.2, 4.4).
 * 지우지 않고 숨긴다. 과거 거래와 집계, 회고의 이름이 그대로 남는다
 */

export type CategoryRow = typeof categories.$inferSelect;
export type ReasonTagRow = typeof reasonTags.$inferSelect;
export type FixedCostRow = typeof fixedCosts.$inferSelect;

/** 숨긴 것까지 모두. 이름 지도와 편집 화면이 쓴다 */
export function allCategories(db: Db) {
  return db.select().from(categories).orderBy(asc(categories.type), asc(categories.sortOrder));
}

export function allReasonTags(db: Db) {
  return db.select().from(reasonTags).orderBy(asc(reasonTags.sortOrder));
}

export function allFixedCosts(db: Db) {
  return db.select().from(fixedCosts).orderBy(asc(fixedCosts.sortOrder));
}

export async function addCategory(db: Db, type: CategoryRow['type'], name: string) {
  const row = await db
    .select({ last: max(categories.sortOrder) })
    .from(categories)
    .where(eq(categories.type, type))
    .get();
  await db.insert(categories).values({ type, name, sortOrder: (row?.last ?? -1) + 1 });
}

export function renameCategory(db: Db, id: number, name: string) {
  return db.update(categories).set({ name }).where(eq(categories.id, id));
}

export function setCategoryHidden(db: Db, id: number, hidden: boolean) {
  return db.update(categories).set({ hidden }).where(eq(categories.id, id));
}

export async function addReasonTag(db: Db, name: string) {
  const row = await db
    .select({ last: max(reasonTags.sortOrder) })
    .from(reasonTags)
    .get();
  await db.insert(reasonTags).values({ name, sortOrder: (row?.last ?? -1) + 1 });
}

export function renameReasonTag(db: Db, id: number, name: string) {
  return db.update(reasonTags).set({ name }).where(eq(reasonTags.id, id));
}

export function setReasonTagHidden(db: Db, id: number, hidden: boolean) {
  return db.update(reasonTags).set({ hidden }).where(eq(reasonTags.id, id));
}

export type FixedCostInput = Pick<
  FixedCostRow,
  'name' | 'amount' | 'categoryId' | 'dayOfMonth' | 'paymentMethod'
>;

export async function addFixedCost(db: Db, input: FixedCostInput) {
  const row = await db
    .select({ last: max(fixedCosts.sortOrder) })
    .from(fixedCosts)
    .get();
  await db.insert(fixedCosts).values({ ...input, sortOrder: (row?.last ?? -1) + 1 });
}

export function updateFixedCost(db: Db, id: number, input: FixedCostInput) {
  return db.update(fixedCosts).set(input).where(eq(fixedCosts.id, id));
}

/** 해지는 숨김이다(PRD 4.4) */
export function setFixedCostHidden(db: Db, id: number, hidden: boolean) {
  return db.update(fixedCosts).set({ hidden }).where(eq(fixedCosts.id, id));
}

/** 이름이 같은 항목이 이미 있는가. 같은 종류(지출·수입) 안에서만 본다 */
export async function categoryNameTaken(db: Db, type: CategoryRow['type'], name: string) {
  const row = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.type, type), eq(categories.name, name)))
    .get();
  return row !== undefined;
}
