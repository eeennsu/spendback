import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import {
  type InboxRow,
  expensesOn,
  getInbox,
  insertInbox,
  merchantExpensesSince,
  merchantHistory,
  pendingInbox,
  pruneInbox,
  suggestionCounts,
  transactionsByIds,
  updateInbox,
} from '../db/cardInbox';
import { cardInbox } from '../db/schema';
import { type TransactionInput, addTransaction, deleteTransaction } from '../db/transactions';
import { addDays } from '../domain/date';
import { type Generate, NarratorError } from '../retro/narrate';
import { knownMerchants, normalizeMerchant } from './merchant';
import { PAIR_DAYS, pairCancel } from './pair';
import { type RawNotification, cardAppName, parseCardNotification } from './parse';
import type { Category } from './prompt';
import { type Suggestion, exactMatch, suggestCategory } from './suggest';

/**
 * 카드 알림 대기열의 흐름(PRD 4.9). 네이티브 서비스가 적은 원문을 읽어 넣고(syncInbox), 취소를 짝짓고, 처음 보는
 * 가맹점의 카테고리를 LLM에 묻고(suggestPending), 홈에 보일 항목을 만든다(inboxView). 거래는 사용자가 폼에서
 * 확인해야 생긴다(saveFromInbox).
 */

/** 처리한 항목을 남겨 두는 기간. 그동안 같은 알림을 다시 받지 않는다 */
const KEEP_MS = 90 * 86_400_000;

export type InboxItem = {
  id: number;
  kind: InboxRow['kind'];
  /** 카드 앱의 이름(parse.ts) */
  appName: string;
  amount: number | null;
  merchant: string | null;
  date: string | null;
  title: string;
  text: string;
  /** 승인만. 전에 적은 가맹점은 보일 때마다 코드가 다시 정한다(최근 기록을 따른다) */
  suggestion?: Suggestion;
  /** 처음 보는 가맹점이라 LLM 추천을 기다린다(아직 묻지 않았다). 홈이 보이면 suggestPending을 돌린다 */
  needsSuggestion: boolean;
  /** 같은 날 같은 금액의 지출이 이미 있다(직접 적었거나 같은 가맹점) */
  maybeDuplicate: boolean;
  /** 취소가 짝지은 저장한 거래 */
  paired?: { id: number; date: string; amount: number; memo: string | null };
};

/** 원문을 읽어 대기열에 넣고, 취소를 짝짓고, 오래된 처리 항목을 지운다. 새로 넣은 수를 돌려준다 */
export async function syncInbox(db: Db, raws: RawNotification[], now = Date.now()) {
  const inserted = await insertInbox(
    db,
    raws.map(raw => {
      const read = parseCardNotification(raw);
      return {
        fingerprint: `${raw.app}\n${raw.title}\n${raw.text}`,
        app: raw.app,
        title: raw.title,
        text: raw.text,
        postedAt: raw.postedAt,
        ...(read.kind === 'unreadable'
          ? { kind: read.kind }
          : { kind: read.kind, amount: read.amount, merchant: read.merchant, date: read.date }),
      };
    }),
  );
  await pairCancels(db);
  await pruneInbox(db, now - KEEP_MS);
  return inserted;
}

type Payment = { id: number; app: string; merchant: string; amount: number; date: string };
const payment = (row: InboxRow): Payment[] =>
  row.merchant && row.amount && row.date
    ? [{ id: row.id, app: row.app, merchant: row.merchant, amount: row.amount, date: row.date }]
    : [];
const pairedIds = (rows: InboxRow[]) =>
  rows.flatMap(row => (row.pairedTransactionId ? [row.pairedTransactionId] : []));

/**
 * 짝이 없는 취소를 짝짓는다. 대기 중인 승인과 맞으면 둘 다 처리하고(잃는 기록이 없다), 저장한 거래와 맞으면 그 거래를
 * 남겨 두고 사용자의 확인을 기다린다. 짝이 없는 취소는 다음에 다시 본다(가져오기로 짝이 비었을 때도)
 */
async function pairCancels(db: Db) {
  const pending = await pendingInbox(db);
  const cancels = pending
    .filter(row => row.kind === 'cancel' && row.pairedTransactionId === null)
    .flatMap(payment)
    .reverse(); // 먼저 받은 취소부터
  if (!cancels.length) return;
  let approvals = pending.filter(row => row.kind === 'approval').flatMap(payment);
  const taken = new Set(pairedIds(pending));
  const from = addDays(cancels.map(c => c.date).sort()[0], -PAIR_DAYS);
  const saved = await merchantExpensesSince(db, from);

  for (const cancel of cancels) {
    const pair = pairCancel(cancel, approvals, saved, taken);
    if (pair?.kind === 'pending') {
      await db.transaction(async tx => {
        await tx.update(cardInbox).set({ status: 'done' }).where(eq(cardInbox.id, cancel.id));
        await tx.update(cardInbox).set({ status: 'done' }).where(eq(cardInbox.id, pair.inboxId));
      });
      approvals = approvals.filter(a => a.id !== pair.inboxId);
    } else if (pair?.kind === 'saved') {
      await updateInbox(db, cancel.id, { pairedTransactionId: pair.transactionId });
      taken.add(pair.transactionId);
    }
  }
}

/** 홈의 대기 목록. categories는 보이는 지출 카테고리다 */
export async function inboxView(db: Db, categories: Category[]): Promise<InboxItem[]> {
  const pending = await pendingInbox(db);
  const known = knownMerchants(await merchantHistory(db));
  const visible = new Set(categories.map(c => c.id));
  const dates = pending.flatMap(row => (row.kind === 'approval' && row.date ? [row.date] : []));
  const sameDay = await expensesOn(db, [...new Set(dates)]);
  const paired = new Map((await transactionsByIds(db, pairedIds(pending))).map(tx => [tx.id, tx]));

  return pending.map(row => {
    const item: InboxItem = {
      id: row.id,
      kind: row.kind,
      appName: cardAppName(row.app),
      amount: row.amount,
      merchant: row.merchant,
      date: row.date,
      title: row.title,
      text: row.text,
      maybeDuplicate: false,
      needsSuggestion: false,
    };
    if (row.kind === 'approval' && row.merchant) {
      const exact = exactMatch(row.merchant, known, categories);
      if (exact !== undefined) item.suggestion = { categoryId: exact, source: 'exact' };
      else if (row.suggestedCategoryId !== null && visible.has(row.suggestedCategoryId))
        item.suggestion = { categoryId: row.suggestedCategoryId, source: 'llm' };
      item.needsSuggestion = exact === undefined && row.suggestedAt === null;
      const name = normalizeMerchant(row.merchant);
      // 직접 적은 지출(가맹점 없음)이나 같은 가맹점의 지출만 겹친 것으로 본다. 다른 가맹점이면 다른 결제다
      item.maybeDuplicate = sameDay.some(
        tx =>
          tx.date === row.date &&
          tx.amount === row.amount &&
          (tx.merchant === null || normalizeMerchant(tx.merchant) === name),
      );
    }
    const tx = row.pairedTransactionId ? paired.get(row.pairedTransactionId) : undefined;
    if (tx) item.paired = { id: tx.id, date: tx.date, amount: tx.amount, memo: tx.memo };
    return item;
  });
}

/**
 * 처음 보는 가맹점의 승인에 LLM 추천을 붙인다. 한 번 물은 항목은 다시 묻지 않는다. 모델이 없거나 올리지 못하면
 * 멈추고 시도 시각을 남기지 않아, 모델을 받은 뒤 다시 묻는다. 취소되면 그 항목은 다음에 다시 묻는다
 */
export async function suggestPending(
  db: Db,
  categories: Category[],
  generate: Generate,
  signal: AbortSignal,
  now = Date.now(),
) {
  const known = knownMerchants(await merchantHistory(db));
  const todo = (await pendingInbox(db)).filter(
    row => row.kind === 'approval' && row.merchant && row.suggestedAt === null,
  );
  for (const row of todo) {
    if (signal.aborted) return;
    const merchant = row.merchant as string;
    if (exactMatch(merchant, known, categories) !== undefined) continue;
    let suggestion: Suggestion | undefined;
    try {
      suggestion = await suggestCategory({ merchant, known, categories, generate, signal });
    } catch (error) {
      if (error instanceof NarratorError) return;
      throw error;
    }
    if (signal.aborted) return;
    await updateInbox(db, row.id, {
      suggestedCategoryId: suggestion?.categoryId ?? null,
      suggestionSource: suggestion ? 'llm' : null,
      suggestedAt: now,
    });
  }
}

/** 폼에서 확인한 승인을 거래로 저장한다. 가맹점 원문과 폼이 보인 추천을 함께 남긴다(정확도) */
export async function saveFromInbox(
  db: Db,
  id: number,
  input: TransactionInput,
  suggestion?: Suggestion,
) {
  const row = await getInbox(db, id);
  return db.transaction(async tx => {
    const transactionId = await addTransaction(tx, {
      ...input,
      merchant: row?.merchant ?? null,
      suggestedCategoryId: suggestion?.categoryId ?? null,
      suggestionSource: suggestion?.source ?? null,
    });
    await tx.update(cardInbox).set({ status: 'done' }).where(eq(cardInbox.id, id));
    return transactionId;
  });
}

/** "기록 안 함", 짝 없는 취소와 읽지 못한 알림 넘기기 */
export function dismissInbox(db: Db, id: number) {
  return updateInbox(db, id, { status: 'dismissed' });
}

/** 취소를 확인하면 짝지은 거래를 지운다. 사용자가 이미 지웠으면 처리만 한다 */
export async function confirmCancel(db: Db, id: number) {
  const row = await getInbox(db, id);
  await db.transaction(async tx => {
    if (row?.pairedTransactionId) await deleteTransaction(tx, row.pairedTransactionId);
    await tx.update(cardInbox).set({ status: 'done' }).where(eq(cardInbox.id, id));
  });
}

/** 추천을 고치지 않고 저장한 비율(PRD 4.9). 설정의 카드 알림 화면이 보인다 */
export async function suggestionAccuracy(db: Db) {
  const counts = { exact: { accepted: 0, total: 0 }, llm: { accepted: 0, total: 0 } };
  for (const row of await suggestionCounts(db)) {
    if (row.source)
      counts[row.source] = { accepted: Number(row.accepted), total: Number(row.total) };
  }
  return counts;
}
