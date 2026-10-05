import { testDb } from '../jest/db';
import { cardInbox, transactions } from '../src/db/schema';
import { addTransaction } from '../src/db/transactions';

/**
 * 앱 DB는 연결 하나에 drizzle sqlite-proxy를 쓴다. drizzle 트랜잭션은 begin, 문장, commit을 따로 보내므로, 잠그지
 * 않으면 다른 흐름(입력 시트 저장, 카드 알림 동기화, 백업 가져오기)의 문장이 열린 트랜잭션에 끼어든다. 열린
 * 트랜잭션이 있으면 다른 쿼리는 끝날 때까지 기다려야 한다(PRD 4.8 "한 트랜잭션으로, 도중에 실패하면 그대로")
 */
const expense = (memo: string) => ({
  type: 'expense' as const,
  amount: 9500,
  date: '2026-09-15',
  categoryId: 1,
  reasonTagId: null,
  satisfaction: null,
  memo,
  paymentMethod: null,
  isFixed: false,
  fixedCostId: null,
});

/** 열어 두고, release()를 부르면 throws에 따라 롤백하거나 커밋하는 트랜잭션 */
function heldTransaction(db: ReturnType<typeof testDb>, throws: boolean) {
  let release = () => {};
  const gate = new Promise<void>(resolve => (release = resolve));
  let opened = () => {};
  const started = new Promise<void>(resolve => (opened = resolve));
  const done = db.transaction(async tx => {
    await tx.update(cardInbox).set({ status: 'done' });
    opened();
    await gate;
    if (throws) throw new Error('동기화 실패');
  });
  return { started, release, done };
}

test('열린 트랜잭션이 롤백돼도 그사이 밖에서 저장한 기록은 남는다', async () => {
  const db = testDb();
  const held = heldTransaction(db, true);
  await held.started;
  const saving = addTransaction(db, expense('입력 시트'));
  held.release();
  await expect(held.done).rejects.toThrow('동기화 실패');
  await saving;
  expect((await db.select().from(transactions)).map(t => t.memo)).toEqual(['입력 시트']);
});

test('트랜잭션 둘이 겹치면 뒤의 것은 앞의 것이 끝나기를 기다렸다가 커밋한다', async () => {
  const db = testDb();
  const held = heldTransaction(db, false);
  await held.started;
  const second = db.transaction(async tx => {
    await addTransaction(tx, expense('카드 알림 저장'));
  });
  held.release();
  await held.done;
  await second;
  expect(await db.select().from(transactions)).toHaveLength(1);
});
