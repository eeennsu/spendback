import { and, asc, eq, isNotNull, max } from 'drizzle-orm';

import type { Db } from '.';
import { splitInstallment } from '../domain/fixedCost';
import { categories, fixedCosts, reasonTags } from './schema';
import { type TransactionInput, type Writer, addTransaction } from './transactions';

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

async function nextFixedCostOrder(db: Writer) {
  const row = await db
    .select({ last: max(fixedCosts.sortOrder) })
    .from(fixedCosts)
    .get();
  return (row?.last ?? -1) + 1;
}

export async function addFixedCost(db: Db, input: FixedCostInput) {
  await db.insert(fixedCosts).values({ ...input, sortOrder: await nextFixedCostOrder(db) });
}

export type InstallmentPlan = { months: number; name: string };

/**
 * 할부를 시작한다(PRD 4.4). 산 날의 지출(input, 금액은 총액)로 할부 항목을 만들고, 그 항목에 연결한 1회차 거래 입력을
 * 돌려준다. 산 날이 1회차라 결제일은 산 날의 일이다. 거래는 부르는 쪽이 같은 트랜잭션 안에서 넣는다
 */
export async function startInstallment(
  db: Writer,
  input: TransactionInput,
  plan: InstallmentPlan,
): Promise<TransactionInput> {
  const { monthly, first } = splitInstallment(input.amount, plan.months);
  const [item] = await db
    .insert(fixedCosts)
    .values({
      name: plan.name,
      amount: monthly,
      categoryId: input.categoryId,
      dayOfMonth: Number(input.date.slice(8)),
      paymentMethod: input.paymentMethod ?? null,
      installmentMonths: plan.months,
      installmentTotal: input.amount,
      installmentStart: input.date.slice(0, 7),
      sortOrder: await nextFixedCostOrder(db),
    })
    .returning({ id: fixedCosts.id });
  return { ...input, amount: first, isFixed: true, fixedCostId: item.id };
}

/** 할부 항목과 1회차 거래를 함께 만든다. 거래 id를 돌려준다 */
export function addInstallment(db: Db, input: TransactionInput, plan: InstallmentPlan) {
  return db.transaction(async tx => addTransaction(tx, await startInstallment(tx, input, plan)));
}

export function updateFixedCost(db: Db, id: number, input: FixedCostInput) {
  return db.update(fixedCosts).set(input).where(eq(fixedCosts.id, id));
}

/** 해지는 숨김이다(PRD 4.4) */
export function setFixedCostHidden(db: Db, id: number, hidden: boolean) {
  return db.update(fixedCosts).set({ hidden }).where(eq(fixedCosts.id, id));
}

/** 산 결제가 취소된 할부는 남은 회차가 없어 숨긴다. 매달 내는 고정비는 한 번 취소돼도 남긴다 */
export function hideInstallment(db: Writer, id: number) {
  return db
    .update(fixedCosts)
    .set({ hidden: true })
    .where(and(eq(fixedCosts.id, id), isNotNull(fixedCosts.installmentStart)));
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
