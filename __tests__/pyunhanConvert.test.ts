import { testDb } from '../jest/db';
import { importPyunhan, readRows } from '../scripts/pyunhan/convert';
import type { Db } from '../src/db';
import { exportBackup, importBackup, parseBackup } from '../src/db/backup';
import { allCategories, allFixedCosts } from '../src/db/lists';
import { transactions } from '../src/db/schema';

/** 편한가계부 엑셀 내보내기의 첫 줄 */
const HEADER = [
  '날짜',
  '자산',
  '분류',
  '소분류',
  '내용',
  'KRW',
  '수입/지출',
  '메모',
  '금액',
  '화폐',
  '자산',
];

/** 엑셀 날짜 일련번호. 시간대 없는 기기 시각이다 */
const serial = (local: string) => Date.parse(`${local}Z`) / 86400000 + 25569;

function line(
  local: string,
  category: string,
  content: string,
  amount: number,
  { asset = '카드', kind = '지출', sub = '', memo = '' } = {},
) {
  return [
    serial(local),
    asset,
    category,
    sub,
    content,
    amount,
    kind,
    memo,
    `${amount}.0`,
    'KRW',
    amount,
  ];
}

describe('readRows', () => {
  test('엑셀 시각을 그 날짜와 한국 시각으로 읽는다', () => {
    const [row] = readRows([HEADER, line('2026-09-15T23:30:00', '식비', '보리향', 9000)]);
    expect(row.date).toBe('2026-09-15');
    expect(row.at).toBe(Date.parse('2026-09-15T23:30:00+09:00'));
  });

  test('내용은 메모가 되고, 비었으면 null이다', () => {
    const rows = readRows([
      HEADER,
      line('2026-09-15T12:00:00', '식비', ' 보리향 ', 9000),
      line('2026-09-15T12:00:00', '식비', '', 9000),
    ]);
    expect(rows.map(r => r.memo)).toEqual(['보리향', null]);
  });

  test('편한가계부의 메모 칸은 내용 뒤에 붙인다', () => {
    const rows = readRows([
      HEADER,
      line('2026-09-15T12:00:00', '식비', '빵', 4000, { memo: '두 개' }),
      line('2026-09-15T12:00:00', '식비', '', 4000, { memo: '두 개' }),
    ]);
    expect(rows.map(r => r.memo)).toEqual(['빵 · 두 개', '두 개']);
  });

  test('지출, 수입, 이체를 구분한다', () => {
    const rows = readRows([
      HEADER,
      line('2026-09-15T12:00:00', '식비', '', 1000),
      line('2026-09-15T12:00:00', '주식', '', 1000, { kind: '수입' }),
      line('2026-09-15T12:00:00', '', '', 1000, { kind: '이체출금' }),
    ]);
    expect(rows.map(r => r.type)).toEqual(['expense', 'income', 'transfer']);
  });

  test('모르는 수입/지출 값이면 줄 번호와 함께 멈춘다', () => {
    expect(() =>
      readRows([HEADER, line('2026-09-15T12:00:00', '식비', '', 1000, { kind: '환불' })]),
    ).toThrow('2번째 줄');
  });

  test('첫 줄이 편한가계부 형식이 아니면 멈춘다', () => {
    expect(() =>
      readRows([
        ['날짜', '금액'],
        [serial('2026-09-15T12:00:00'), 1000],
      ]),
    ).toThrow('편한가계부');
  });

  test('소분류가 있으면 옮기지 않고 멈춘다', () => {
    expect(() =>
      readRows([HEADER, line('2026-09-15T12:00:00', '식비', '', 1000, { sub: '점심' })]),
    ).toThrow('소분류');
  });

  test('지출·수입에 분류가 없으면 멈춘다', () => {
    expect(() => readRows([HEADER, line('2026-09-15T12:00:00', '', '', 1000)])).toThrow('2번째 줄');
  });

  test('빈 줄은 건너뛰고 줄 번호는 엑셀 그대로 센다', () => {
    expect(() =>
      readRows([HEADER, [], line('2026-09-15T12:00:00', '식비', '', 1000, { kind: '환불' })]),
    ).toThrow('3번째 줄');
  });

  test('금액이 0원 이하이면 멈춘다', () => {
    expect(() => readRows([HEADER, line('2026-09-15T12:00:00', '식비', '', 0)])).toThrow(
      '2번째 줄',
    );
  });
});

let db: Db;
beforeEach(() => {
  db = testDb();
});

const rows = (...lines: ReturnType<typeof line>[]) => readRows([HEADER, ...lines]);
const visible = async (type: 'expense' | 'income') =>
  (await allCategories(db)).filter(c => c.type === type && !c.hidden).map(c => c.name);
const allTransactions = () => db.select().from(transactions).orderBy(transactions.createdAt);

describe('importPyunhan 카테고리', () => {
  test('분류를 이름 그대로 만들고 많이 쓴 것부터 둔다. 지출 기본은 숨기고 수입 기본은 남긴다', async () => {
    await importPyunhan(
      db,
      rows(
        line('2026-09-01T12:00:00', '🫂 친구', '', 1000),
        line('2026-09-02T12:00:00', '🍜 회사 식비', '', 1000),
        line('2026-09-03T12:00:00', '🍜 회사 식비', '', 1000),
        line('2026-09-04T12:00:00', '🏦 주식', '', 1000, { kind: '수입' }),
      ),
      {},
    );
    expect(await visible('expense')).toEqual(['🍜 회사 식비', '🫂 친구']);
    expect(await visible('income')).toEqual(['🏦 주식', '급여', '부수입', '기타']);
    const hidden = (await allCategories(db)).filter(c => c.hidden);
    expect(hidden).toHaveLength(11);
    expect(hidden.every(c => c.type === 'expense' && c.isDefault)).toBe(true);
  });

  test('같은 이름의 기본 카테고리는 새로 만들지 않고 다시 쓴다', async () => {
    await importPyunhan(db, rows(line('2026-09-01T12:00:00', '기타', '', 1000)), {});
    const others = (await allCategories(db)).filter(c => c.type === 'expense' && c.name === '기타');
    expect(others).toHaveLength(1);
    expect(others[0].hidden).toBe(false);
    expect(await visible('expense')).toEqual(['기타']);
  });
});

describe('importPyunhan 거래', () => {
  test('날짜, 금액, 메모, 결제 수단을 옮기고 기록 시각으로 순서를 지킨다', async () => {
    await importPyunhan(
      db,
      rows(
        line('2026-09-02T08:00:00', '교통비', '', 1500, { asset: '은행' }),
        line('2026-09-01T12:30:00', '회사 식비', '보리향', 9000),
        line('2026-09-03T12:00:00', '회사 식비', '밥', 7000, { asset: '지갑' }),
      ),
      { payment: { 카드: 'card', 은행: 'transfer' } },
    );
    const txs = await allTransactions();
    expect(txs.map(t => [t.date, t.amount, t.memo, t.paymentMethod])).toEqual([
      ['2026-09-01', 9000, '보리향', 'card'],
      ['2026-09-02', 1500, null, 'transfer'],
      ['2026-09-03', 7000, '밥', null],
    ]);
    expect(txs[0].createdAt).toBe(Date.parse('2026-09-01T12:30:00+09:00'));
    expect(txs[0]).toMatchObject({
      type: 'expense',
      isFixed: false,
      fixedCostId: null,
      reasonTagId: null,
      satisfaction: null,
      merchant: null,
      suggestedCategoryId: null,
      suggestionSource: null,
    });
  });

  test('이체는 옮기지 않고 건수를 돌려준다', async () => {
    const result = await importPyunhan(
      db,
      rows(
        line('2026-09-01T12:00:00', '식비', '', 1000),
        line('2026-09-01T12:00:00', '', '', 50000, { kind: '이체출금' }),
      ),
      {},
    );
    expect(result).toEqual({ transactions: 1, skippedTransfers: 1 });
    expect(await allTransactions()).toHaveLength(1);
  });
});

describe('importPyunhan 고정비', () => {
  test('규칙의 분류와 날짜에 맞는 지출만 고정비로 표시한다', async () => {
    await importPyunhan(
      db,
      rows(
        line('2025-12-11T09:00:00', '월세', '월세와 관리비', 450000),
        line('2026-01-13T09:00:00', '월세', '월세와 관리비', 450000),
        line('2026-01-17T09:00:00', '월세', '정산', 410000),
        line('2026-01-18T09:00:00', '개인 용돈', '빵', 3000),
      ),
      { fixed: [{ category: '월세', until: '2026-01-13' }] },
    );
    expect((await allTransactions()).map(t => [t.memo, t.isFixed])).toEqual([
      ['월세와 관리비', true],
      ['월세와 관리비', true],
      ['정산', false],
      ['빵', false],
    ]);
    expect(await allFixedCosts(db)).toEqual([]);
  });

  test('내용으로 고르고 뺄 내용을 거른다', async () => {
    await importPyunhan(
      db,
      rows(
        line('2026-09-01T09:00:00', '통신비', '', 72900),
        line('2026-09-15T09:00:00', '통신비', '유심', 8800),
        line('2026-09-20T09:00:00', '개인 용돈', '헬스장', 30000),
        line('2026-09-21T09:00:00', '개인 용돈', '빵', 3000),
      ),
      {
        fixed: [
          { category: '통신비', except: ['유심'] },
          { category: '개인 용돈', memo: '헬스장' },
        ],
      },
    );
    expect((await allTransactions()).map(t => [t.memo, t.isFixed])).toEqual([
      [null, true],
      ['유심', false],
      ['헬스장', true],
      ['빵', false],
    ]);
  });

  test('고정비 항목을 등록하고 맞는 지출을 잇는다. 등록 시각은 처음 이은 지출이다', async () => {
    await importPyunhan(
      db,
      rows(
        line('2026-08-01T09:00:00', '통신비', '', 72900),
        line('2026-09-01T09:00:00', '통신비', '', 72900),
      ),
      {
        fixed: [
          {
            category: '통신비',
            item: { name: '통신비', amount: 24500, dayOfMonth: 1, paymentMethod: 'card' },
          },
        ],
      },
    );
    const [item] = await allFixedCosts(db);
    const category = (await allCategories(db)).find(c => c.name === '통신비');
    expect(item).toMatchObject({
      name: '통신비',
      amount: 24500,
      dayOfMonth: 1,
      paymentMethod: 'card',
      categoryId: category?.id,
      hidden: false,
      createdAt: Date.parse('2026-08-01T09:00:00+09:00'),
    });
    expect((await allTransactions()).map(t => t.fixedCostId)).toEqual([item.id, item.id]);
  });

  test('규칙의 분류가 엑셀에 없으면 멈춘다', async () => {
    await expect(
      importPyunhan(db, rows(line('2026-09-01T09:00:00', '식비', '', 1000)), {
        fixed: [{ category: '통신비' }],
      }),
    ).rejects.toThrow('통신비');
  });
});

test('옮긴 결과는 앱의 백업 가져오기를 그대로 통과한다', async () => {
  await importPyunhan(
    db,
    rows(
      line('2026-09-01T09:00:00', '📱 통신비', '', 72900),
      line('2026-09-02T12:00:00', '🍜 회사 식비', '보리향', 9000),
      line('2026-09-03T12:00:00', '🏦 주식', '', 120000, { kind: '수입' }),
    ),
    {
      payment: { 카드: 'card' },
      fixed: [
        {
          category: '📱 통신비',
          item: { name: '통신비', amount: 24500, dayOfMonth: 1, paymentMethod: 'card' },
        },
      ],
    },
  );
  const backup = parseBackup(JSON.stringify(await exportBackup(db)));
  const phone = testDb();
  await importBackup(phone, backup);
  expect(await phone.select().from(transactions)).toHaveLength(3);
  expect(await allFixedCosts(phone)).toHaveLength(1);
});
