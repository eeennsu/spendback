import { testDb } from '../jest/db';
import type { Db } from '../src/db';
import {
  BackupError,
  backupSummary,
  exportBackup,
  importBackup,
  parseBackup,
} from '../src/db/backup';
import { allBudgets, setBudget } from '../src/db/budgets';
import {
  addCategory,
  addFixedCost,
  allCategories,
  allFixedCosts,
  categoryNameTaken,
  setCategoryHidden,
} from '../src/db/lists';
import { saveRetrospective } from '../src/db/retrospectives';
import { cardInbox } from '../src/db/schema';
import { getSetting, setSetting } from '../src/db/settings';
import {
  type TransactionInput,
  addTransaction,
  deleteTransaction,
  filterTransactions,
  firstRecordDate,
  getTransaction,
  lastCategoryForMemo,
  memoSuggestions,
  recentExpenses,
  updateTransaction,
} from '../src/db/transactions';

const expense = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  type: 'expense',
  amount: 9500,
  date: '2026-09-24',
  categoryId: 1,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: null,
  isFixed: false,
  fixedCostId: null,
  ...overrides,
});

async function withMemos(db: Db) {
  // createdAt으로 최근 순을 가르므로 조금씩 늦게 쓴다
  const memos: Array<[string, number]> = [
    ['점심 순대국', 1],
    ['편의점 커피', 2],
    ['점심 김밥', 1],
    ['편의점 커피', 2],
    ['택시', 4],
  ];
  for (const [memo, categoryId] of memos) {
    await addTransaction(db, expense({ memo, categoryId }));
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

describe('거래', () => {
  test('수입은 지출 전용 필드를 비우고, 고정비가 아니면 항목 연결을 비운다', async () => {
    const db = testDb();
    const income = await addTransaction(
      db,
      expense({
        type: 'income',
        categoryId: 12,
        reasonTagId: 2,
        satisfaction: 'regret',
        isFixed: true,
      }),
    );
    expect(await getTransaction(db, income)).toMatchObject({
      reasonTagId: null,
      satisfaction: null,
      isFixed: false,
      fixedCostId: null,
    });
    await addFixedCost(db, {
      name: '휴대폰 요금',
      amount: 55000,
      categoryId: 7,
      dayOfMonth: 21,
      paymentMethod: 'card',
    });
    const id = await addTransaction(db, expense({ isFixed: false, fixedCostId: 1 }));
    expect((await getTransaction(db, id))?.fixedCostId).toBeNull();
  });

  test('고치고 지운다', async () => {
    const db = testDb();
    const id = await addTransaction(db, expense());
    await updateTransaction(db, id, expense({ amount: 12000, memo: '점심' }));
    expect(await getTransaction(db, id)).toMatchObject({ amount: 12000, memo: '점심' });
    await deleteTransaction(db, id);
    expect(await getTransaction(db, id)).toBeUndefined();
  });

  test('최근 지출과 첫 기록일', async () => {
    const db = testDb();
    expect(await firstRecordDate(db)).toBeUndefined();
    await addTransaction(db, expense({ date: '2026-09-20' }));
    await addTransaction(db, expense({ date: '2026-09-24', amount: 4500 }));
    await addTransaction(db, expense({ type: 'income', categoryId: 12, date: '2026-09-25' }));
    expect((await recentExpenses(db)).map(t => t.amount)).toEqual([4500, 9500]);
    expect(await firstRecordDate(db)).toBe('2026-09-20');
  });

  test('필터는 기간·구분·카테고리·태그로 거른다', async () => {
    const db = testDb();
    await addTransaction(db, expense({ categoryId: 1, reasonTagId: 2 }));
    await addTransaction(db, expense({ categoryId: 3 }));
    await addTransaction(db, expense({ date: '2026-08-31' }));
    await addTransaction(db, expense({ type: 'income', categoryId: 12 }));
    const september = { from: '2026-09-01', to: '2026-09-30' };
    expect(await filterTransactions(db, september)).toHaveLength(3);
    expect(await filterTransactions(db, { ...september, type: 'expense' })).toHaveLength(2);
    expect(await filterTransactions(db, { ...september, categoryIds: [3] })).toHaveLength(1);
    expect(await filterTransactions(db, { ...september, reasonTagIds: [2] })).toHaveLength(1);
  });

  test('메모 제안은 최근 메모 셋, 입력하면 그 글자를 포함하는 메모다', async () => {
    const db = testDb();
    await withMemos(db);
    expect(await memoSuggestions(db, '', 'expense')).toEqual(['택시', '편의점 커피', '점심 김밥']);
    expect(await memoSuggestions(db, '점심', 'expense')).toEqual(['점심 김밥', '점심 순대국']);
    // 입력한 그대로인 메모는 다시 제안하지 않는다
    expect(await memoSuggestions(db, '택시', 'expense')).toEqual([]);
    expect(await memoSuggestions(db, '', 'income')).toEqual([]);
  });

  test('같은 메모에 마지막으로 고른 카테고리', async () => {
    const db = testDb();
    await withMemos(db);
    expect(await lastCategoryForMemo(db, '편의점 커피', 'expense')).toBe(2);
    expect(await lastCategoryForMemo(db, '없는 메모', 'expense')).toBeUndefined();
  });
});

describe('목록·예산·설정', () => {
  test('카테고리는 끝에 더하고 숨긴다', async () => {
    const db = testDb();
    await addCategory(db, 'expense', '반려동물');
    const added = (await allCategories(db)).find(c => c.name === '반려동물');
    expect(added).toMatchObject({
      type: 'expense',
      sortOrder: 11,
      hidden: false,
      isDefault: false,
    });
    await setCategoryHidden(db, added?.id ?? 0, true);
    expect((await allCategories(db)).find(c => c.name === '반려동물')?.hidden).toBe(true);
    expect(await categoryNameTaken(db, 'expense', '식비')).toBe(true);
    expect(await categoryNameTaken(db, 'income', '식비')).toBe(false);
  });

  test('예산은 그 달부터 적용하고 같은 달은 덮어쓴다', async () => {
    const db = testDb();
    await setBudget(db, '2026-09', 1200000, [{ categoryId: 1, amount: 300000 }]);
    await setBudget(db, '2026-10', 1000000, []);
    await setBudget(db, '2026-10', 1100000, []);
    expect((await allBudgets(db)).map(b => [b.effectiveFrom, b.total])).toEqual([
      ['2026-09', 1200000],
      ['2026-10', 1100000],
    ]);
  });

  test('설정은 JSON으로 저장한다', async () => {
    const db = testDb();
    expect(await getSetting(db, 'model')).toBeUndefined();
    await setSetting(db, 'model', 'kanana-1.5-2.1b');
    await setSetting(db, 'model', 'qwen3.5-2b');
    expect(await getSetting(db, 'model')).toBe('qwen3.5-2b');
  });
});

describe('백업', () => {
  async function filled() {
    const db = testDb();
    await addFixedCost(db, {
      name: '휴대폰 요금',
      amount: 55000,
      categoryId: 7,
      dayOfMonth: 21,
      paymentMethod: 'card',
    });
    await addTransaction(db, expense({ memo: '점심 순대국', reasonTagId: 2 }));
    await addTransaction(
      db,
      expense({ amount: 55000, categoryId: 7, isFixed: true, fixedCostId: 1, date: '2026-09-21' }),
    );
    // 카드 알림으로 저장한 거래(PRD 4.9)
    await addTransaction(
      db,
      expense({
        memo: '스타벅스',
        merchant: '스타벅스 역삼점',
        suggestedCategoryId: 2,
        suggestionSource: 'llm',
      }),
    );
    await setBudget(db, '2026-09', 1200000, [{ categoryId: 1, amount: 300000 }]);
    await saveRetrospective(db, {
      kind: 'weekly',
      periodStart: '2026-09-21',
      periodEnd: '2026-09-27',
      facts: { kind: 'weekly', period: '9월 21일~27일', groups: [] },
      output: {
        headline: '{total.variable}',
        insights: [
          { about: 'total', text: 'a' },
          { about: 'total', text: 'b' },
        ],
        suggestion: '다음 주에는 확인해 보세요.',
      },
      modelId: 'qwen3.5-2b',
      promptVersion: 'v4',
    });
    return db;
  }

  test('내보낸 파일을 다른 기기에 가져오면 기록과 고정비 연결이 같다', async () => {
    const source = await filled();
    const backup = parseBackup(JSON.stringify(await exportBackup(source)));
    expect(backupSummary(backup)).toEqual({ transactions: 3, fixedCosts: 1, retrospectives: 1 });
    expect(backup.transactions[2]).toMatchObject({
      merchant: '스타벅스 역삼점',
      suggestionSource: 'llm',
    });

    const target = testDb();
    await addTransaction(target, expense({ memo: '사라질 기록' }));
    await importBackup(target, backup);
    const again = await exportBackup(target);
    expect({ ...again, exportedAt: '' }).toEqual({ ...backup, exportedAt: '' });
    expect((await allFixedCosts(target))[0].name).toBe('휴대폰 요금');
  });

  test('다른 파일, 다른 버전, 깨진 기록을 알린다', async () => {
    const backup = await exportBackup(await filled());
    expect(() => parseBackup('not json')).toThrow(new BackupError('JSON 파일이 아니에요'));
    expect(() => parseBackup('{"app":"other"}')).toThrow('spendback 백업 파일이 아니에요');
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 3 }))).toThrow(
      '지원하지 않는 백업 버전이에요',
    );
    const broken = {
      ...backup,
      transactions: backup.transactions.map(tx => ({ ...tx, categoryId: 99 })),
    };
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('백업의 기록이 올바르지 않아요');
    const suggested = {
      ...backup,
      transactions: backup.transactions.map(tx => ({ ...tx, suggestedCategoryId: 99 })),
    };
    expect(() => parseBackup(JSON.stringify(suggested))).toThrow('백업의 기록이 올바르지 않아요');
  });

  test('앱이 저장할 수 없는 0원 총예산은 받지 않는다', async () => {
    const backup = await exportBackup(await filled());
    expect(backup.budgets.length).toBeGreaterThan(0);
    const zero = { ...backup, budgets: backup.budgets.map(b => ({ ...b, total: 0 })) };
    expect(() => parseBackup(JSON.stringify(zero))).toThrow(BackupError);
  });

  test('버전 1 파일은 가맹점과 추천값이 없는 것으로 읽는다', async () => {
    const backup = await exportBackup(await filled());
    const v1 = {
      ...backup,
      version: 1,
      transactions: backup.transactions.map(
        ({ merchant: _m, suggestedCategoryId: _c, suggestionSource: _s, ...tx }) => tx,
      ),
    };
    const read = parseBackup(JSON.stringify(v1));
    expect(read.version).toBe(2);
    expect(read.transactions[2]).toMatchObject({
      merchant: null,
      suggestedCategoryId: null,
      suggestionSource: null,
    });
  });

  test('가져오면 카드 알림 대기열의 추천과 짝을 비워 새 기록으로 다시 정한다', async () => {
    const db = testDb();
    await db.insert(cardInbox).values({
      fingerprint: 'a',
      app: 'card',
      kind: 'cancel',
      title: '',
      text: '',
      postedAt: 0,
      suggestedCategoryId: 12,
      suggestionSource: 'llm',
      suggestedAt: 1,
      pairedTransactionId: 1,
    });
    await importBackup(db, await exportBackup(await filled()));
    expect(await db.select().from(cardInbox)).toEqual([
      expect.objectContaining({
        status: 'pending',
        suggestedCategoryId: null,
        suggestionSource: null,
        suggestedAt: null,
        pairedTransactionId: null,
      }),
    ]);
  });

  test('가져오다 실패하면 기존 기록이 그대로 남는다', async () => {
    const db = await filled();
    const before = await exportBackup(db);
    const backup = { ...before, transactions: [...before.transactions, before.transactions[0]] };
    // 같은 id가 둘이라 넣다가 실패한다
    await expect(importBackup(db, backup)).rejects.toThrow();
    expect({ ...(await exportBackup(db)), exportedAt: '' }).toEqual({ ...before, exportedAt: '' });
  });
});
