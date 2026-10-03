import { testDb } from '../jest/db';
import {
  confirmCancel,
  dismissInbox,
  inboxView,
  saveFromInbox,
  suggestPending,
  suggestionAccuracy,
  syncInbox,
} from '../src/cards/inbox';
import { DEV_APP } from '../src/cards/parse';
import type { Db } from '../src/db';
import { cardInbox } from '../src/db/schema';
import { type TransactionInput, addTransaction, getTransaction } from '../src/db/transactions';
import { fakeGenerate } from '../src/retro/fake';
import { NarratorError } from '../src/retro/narrate';

const CATEGORIES = [
  { id: 1, name: '식비' },
  { id: 2, name: '카페·간식' },
  { id: 3, name: '배달' },
];
const NOW = new Date(2026, 9, 3, 15, 0).getTime();

/** adb로 흉내 낸 개발용 형식(src/cards/parse.ts) */
const raw = (text: string, postedAt = NOW) => ({
  app: DEV_APP,
  title: '테스트카드',
  text,
  postedAt,
});

const expense = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  type: 'expense',
  amount: 4500,
  date: '2026-09-28',
  categoryId: 2,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: 'card',
  isFixed: false,
  fixedCostId: null,
  ...overrides,
});

const rows = (db: Db) => db.select().from(cardInbox);

describe('syncInbox', () => {
  test('읽은 알림을 대기열에 넣고, 같은 알림은 한 번만 받는다', async () => {
    const db = testDb();
    const notification = raw('승인 4,500원 10/03 14:22 스타벅스 역삼점');
    expect(await syncInbox(db, [notification, notification], NOW)).toBe(1);
    expect(await syncInbox(db, [notification], NOW)).toBe(0);
    expect(await rows(db)).toEqual([
      expect.objectContaining({
        kind: 'approval',
        amount: 4500,
        merchant: '스타벅스 역삼점',
        date: '2026-10-03',
        status: 'pending',
      }),
    ]);
  });

  test('읽지 못한 알림도 원문과 함께 넣는다', async () => {
    const db = testDb();
    await syncInbox(db, [raw('이번 달 결제 예정 금액을 확인하세요')], NOW);
    expect(await rows(db)).toEqual([
      expect.objectContaining({
        kind: 'unreadable',
        amount: null,
        text: '이번 달 결제 예정 금액을 확인하세요',
      }),
    ]);
  });

  test('취소가 대기 중인 승인과 짝이 맞으면 둘 다 처리한다', async () => {
    const db = testDb();
    await syncInbox(db, [raw('승인 4,500원 10/03 14:22 스타벅스 역삼점')], NOW);
    await syncInbox(db, [raw('취소 4,500원 10/03 14:30 스타벅스 역삼점')], NOW);
    expect((await rows(db)).map(r => r.status)).toEqual(['done', 'done']);
  });

  test('취소가 저장한 거래와 짝이 맞으면 그 거래를 남겨 두고 확인을 기다린다', async () => {
    const db = testDb();
    const id = await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    await syncInbox(db, [raw('취소 4,500원 10/03 14:30 스타벅스 역삼점')], NOW);
    expect(await rows(db)).toEqual([
      expect.objectContaining({ kind: 'cancel', status: 'pending', pairedTransactionId: id }),
    ]);
  });

  test('같은 결제 둘을 각각 취소하면 서로 다른 거래와 짝짓는다', async () => {
    const db = testDb();
    const first = await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    const second = await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    await syncInbox(
      db,
      [
        raw('취소 4,500원 10/03 14:30 스타벅스 역삼점'),
        raw('취소 4,500원 10/03 14:31 스타벅스 역삼점'),
      ],
      NOW,
    );
    expect((await rows(db)).map(r => r.pairedTransactionId).sort()).toEqual([first, second].sort());
  });

  test('처리한 지 90일이 지난 항목은 지우고, 대기 중인 항목은 남긴다', async () => {
    const db = testDb();
    const old = new Date(2026, 6, 1).getTime();
    await syncInbox(
      db,
      [raw('승인 4,500원 07/01 14:22 스타벅스', old), raw('승인 3,000원 07/01 15:00 CU', old)],
      old,
    );
    const [first] = await rows(db);
    await dismissInbox(db, first.id);
    await syncInbox(db, [], NOW);
    expect((await rows(db)).map(r => r.merchant)).toEqual(['CU']);
  });
});

describe('inboxView', () => {
  test('전에 적은 가맹점은 가장 최근 거래의 카테고리를 추천한다', async () => {
    const db = testDb();
    await addTransaction(
      db,
      expense({ merchant: 'GS25 역삼점', categoryId: 1, date: '2026-09-01' }),
    );
    await addTransaction(
      db,
      expense({ merchant: 'GS25 역삼점', categoryId: 2, date: '2026-09-20' }),
    );
    await syncInbox(db, [raw('승인 3,000원 10/03 09:00 gs25 역삼점')], NOW);
    const [item] = await inboxView(db, CATEGORIES);
    expect(item.suggestion).toEqual({ categoryId: 2, source: 'exact' });
  });

  test('같은 날 같은 금액의 지출이 있으면 이미 기록했을 수 있다고 알린다', async () => {
    const db = testDb();
    await addTransaction(db, expense({ amount: 3000, date: '2026-10-03', memo: '편의점' }));
    await syncInbox(
      db,
      [raw('승인 3,000원 10/03 09:00 CU 역삼점'), raw('승인 3,500원 10/03 10:00 CU 역삼점')],
      NOW,
    );
    const view = await inboxView(db, CATEGORIES);
    expect(view.map(i => [i.amount, i.maybeDuplicate])).toEqual([
      [3500, false],
      [3000, true],
    ]);
  });

  test('가맹점이 다른 카드 결제는 같은 날 같은 금액이어도 겹친 기록으로 보지 않는다', async () => {
    const db = testDb();
    await addTransaction(
      db,
      expense({ amount: 3000, date: '2026-10-03', merchant: 'GS25 역삼점' }),
    );
    await syncInbox(db, [raw('승인 3,000원 10/03 09:00 CU 역삼점')], NOW);
    expect((await inboxView(db, CATEGORIES))[0].maybeDuplicate).toBe(false);
  });

  test('취소는 짝지은 거래를 함께 보인다', async () => {
    const db = testDb();
    await addTransaction(db, expense({ merchant: '스타벅스 역삼점', memo: '스타벅스' }));
    await syncInbox(db, [raw('취소 4,500원 10/03 14:30 스타벅스 역삼점')], NOW);
    const [item] = await inboxView(db, CATEGORIES);
    expect(item.paired).toMatchObject({ date: '2026-09-28', amount: 4500, memo: '스타벅스' });
  });
});

describe('suggestPending', () => {
  test('처음 보는 가맹점만 LLM에 묻고 결과를 남긴다', async () => {
    const db = testDb();
    await addTransaction(db, expense({ merchant: 'BBQ치킨', categoryId: 3 }));
    await syncInbox(
      db,
      [raw('승인 20,000원 10/03 19:00 교촌치킨 역삼점'), raw('승인 18,000원 10/02 19:00 BBQ치킨')],
      NOW,
    );
    const fake = fakeGenerate(['배달']);
    await suggestPending(db, CATEGORIES, fake.generate, new AbortController().signal, NOW);
    expect(fake.calls).toHaveLength(1);
    const view = await inboxView(db, CATEGORIES);
    expect(view.map(i => [i.merchant, i.suggestion])).toEqual([
      ['교촌치킨 역삼점', { categoryId: 3, source: 'llm' }],
      ['BBQ치킨', { categoryId: 3, source: 'exact' }],
    ]);
  });

  test('처음 보는 가맹점은 LLM 추천을 기다리고, 물은 뒤에는 기다리지 않는다', async () => {
    const db = testDb();
    await addTransaction(db, expense({ merchant: 'BBQ치킨', categoryId: 3 }));
    await syncInbox(
      db,
      [raw('승인 20,000원 10/03 19:00 교촌치킨'), raw('승인 18,000원 10/02 19:00 BBQ치킨')],
      NOW,
    );
    const before = await inboxView(db, CATEGORIES);
    expect(before.map(i => i.needsSuggestion)).toEqual([true, false]);
    await suggestPending(
      db,
      CATEGORIES,
      fakeGenerate(['아무말']).generate,
      new AbortController().signal,
      NOW,
    );
    expect((await inboxView(db, CATEGORIES)).map(i => i.needsSuggestion)).toEqual([false, false]);
  });

  test('한 번 물은 항목은 다시 묻지 않는다', async () => {
    const db = testDb();
    await syncInbox(db, [raw('승인 20,000원 10/03 19:00 교촌치킨')], NOW);
    const fake = fakeGenerate(['아무말']);
    await suggestPending(db, CATEGORIES, fake.generate, new AbortController().signal, NOW);
    await suggestPending(db, CATEGORIES, fake.generate, new AbortController().signal, NOW);
    expect(fake.calls).toHaveLength(1);
    expect((await inboxView(db, CATEGORIES))[0].suggestion).toBeUndefined();
  });

  test('모델이 없으면 멈추고, 모델을 받은 뒤 다시 묻는다', async () => {
    const db = testDb();
    await syncInbox(
      db,
      [raw('승인 20,000원 10/03 19:00 교촌치킨'), raw('승인 9,000원 10/03 12:00 김밥집')],
      NOW,
    );
    const none = fakeGenerate([new NarratorError('no-model')]);
    await suggestPending(db, CATEGORIES, none.generate, new AbortController().signal, NOW);
    expect(none.calls).toHaveLength(1);
    const fake = fakeGenerate(['배달', '식비']);
    await suggestPending(db, CATEGORIES, fake.generate, new AbortController().signal, NOW);
    expect(fake.calls).toHaveLength(2);
  });
});

describe('저장과 처리', () => {
  test('항목을 저장하면 거래에 가맹점과 추천값이 남고 항목은 처리된다', async () => {
    const db = testDb();
    await syncInbox(db, [raw('승인 20,000원 10/03 19:00 교촌치킨')], NOW);
    const [item] = await rows(db);
    const id = await saveFromInbox(
      db,
      item.id,
      expense({ amount: 20000, date: '2026-10-03', categoryId: 1, memo: '치킨' }),
      { categoryId: 3, source: 'llm' },
    );
    expect(await getTransaction(db, id)).toMatchObject({
      merchant: '교촌치킨',
      suggestedCategoryId: 3,
      suggestionSource: 'llm',
      categoryId: 1,
    });
    expect((await rows(db))[0].status).toBe('done');
    expect(await inboxView(db, CATEGORIES)).toEqual([]);
  });

  test('취소를 확인하면 짝지은 거래를 지운다', async () => {
    const db = testDb();
    const id = await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    await syncInbox(db, [raw('취소 4,500원 10/03 14:30 스타벅스 역삼점')], NOW);
    const [item] = await rows(db);
    await confirmCancel(db, item.id);
    expect(await getTransaction(db, id)).toBeUndefined();
    expect((await rows(db))[0].status).toBe('done');
  });

  test('추천 정확도는 추천을 고치지 않고 저장한 비율이다', async () => {
    const db = testDb();
    await addTransaction(
      db,
      expense({ merchant: 'a', categoryId: 3, suggestedCategoryId: 3, suggestionSource: 'llm' }),
    );
    await addTransaction(
      db,
      expense({ merchant: 'b', categoryId: 1, suggestedCategoryId: 3, suggestionSource: 'llm' }),
    );
    await addTransaction(
      db,
      expense({ merchant: 'c', categoryId: 2, suggestedCategoryId: 2, suggestionSource: 'exact' }),
    );
    await addTransaction(db, expense({ merchant: 'd', categoryId: 2 }));
    expect(await suggestionAccuracy(db)).toEqual({
      exact: { accepted: 1, total: 1 },
      llm: { accepted: 1, total: 2 },
    });
  });
});
