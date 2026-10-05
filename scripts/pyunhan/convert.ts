import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Db } from '../../src/db';
import { allCategories, allFixedCosts } from '../../src/db/lists';
import { categories, fixedCosts, transactions } from '../../src/db/schema';
import type { Cell } from './xlsx';

/**
 * 편한가계부 엑셀 내보내기를 spendback 기록으로 옮긴다(PRD 4.8). 마이그레이션만 한 빈 DB에 넣은 뒤 백업으로 내보내
 * 앱의 가져오기로 넣는다. 분류는 이름 그대로 카테고리가 되고 쓰지 않은 지출 기본 카테고리는 숨긴다. 내용은 메모가
 * 된다. 가맹점은 카드 알림의 원문 자리라 비운다. 이체는 spendback에 없어 옮기지 않는다
 */

/** 편한가계부 엑셀의 첫 줄. 뒤의 금액·화폐·자산 칸은 원래 통화의 값이라 쓰지 않는다 */
const HEADER = ['날짜', '자산', '분류', '소분류', '내용', 'KRW', '수입/지출', '메모'];
/** 편한가계부는 기기 시각(한국)으로 적는다. 엑셀 일련번호에는 시간대가 없다 */
const KST = 9 * 60 * 60 * 1000;

export type PyunhanRow = {
  /** 엑셀 줄 번호. 오류에 쓴다 */
  line: number;
  type: 'expense' | 'income' | 'transfer';
  date: string;
  /** 적은 시각(epoch ms). 거래의 createdAt이 된다 */
  at: number;
  asset: string;
  category: string;
  memo: string | null;
  amount: number;
};

const text = (cell: Cell | undefined) =>
  cell === null || cell === undefined ? '' : String(cell).trim();

function typeOf(kind: string) {
  if (kind === '지출') return 'expense';
  if (kind === '수입') return 'income';
  if (kind.startsWith('이체')) return 'transfer';
  return null;
}

export function readRows(table: Cell[][]): PyunhanRow[] {
  const [header = [], ...body] = table;
  if (HEADER.some((name, i) => text(header[i]) !== name)) {
    throw new Error('편한가계부 엑셀 내보내기 형식이 아니에요(첫 줄이 다름)');
  }
  return body.flatMap((cells, i) => {
    if (cells.every(cell => text(cell) === '')) return [];
    const line = i + 2;
    const fail = (why: string) => new Error(`${line}번째 줄: ${why}`);
    const [serial, asset, category, sub, content, krw, kind, memo] = cells;
    if (typeof serial !== 'number') throw fail('날짜를 읽을 수 없어요');
    const type = typeOf(text(kind));
    if (!type) throw fail(`모르는 수입/지출 값이에요(${text(kind)})`);
    if (text(sub))
      throw fail(`소분류(${text(sub)})는 옮기지 않아요. 분류로 합친 뒤 다시 내보내 주세요`);
    if (type !== 'transfer' && !text(category)) throw fail('분류가 비어 있어요');
    const amount = Math.round(Number(krw));
    if (!(amount > 0)) throw fail(`금액이 올바르지 않아요(${text(krw)})`);
    const wall = Math.round((serial - 25569) * 86400000);
    return [
      {
        line,
        type,
        date: new Date(wall).toISOString().slice(0, 10),
        at: wall - KST,
        asset: text(asset),
        category: text(category),
        memo: [text(content), text(memo)].filter(Boolean).join(' · ') || null,
        amount,
      },
    ];
  });
}

const Method = z.enum(['card', 'cash', 'transfer']);

/** 사람마다 다른 규칙. 저장소에 넣지 않는 로컬 JSON으로 둔다(scripts/import-pyunhan.mts) */
const RulesSchema = z.object({
  /** 자산 이름 → 결제 수단. 없는 자산은 결제 수단을 비운다 */
  payment: z.record(z.string(), Method).default({}),
  /** 고정비로 표시할 지출. 위에서부터 처음 맞는 규칙을 쓴다 */
  fixed: z
    .array(
      z.object({
        category: z.string().min(1),
        /** 이 내용인 지출만 */
        memo: z.string().optional(),
        /** 이 내용들은 뺀다 */
        except: z.array(z.string()).default([]),
        /** 이 날까지(포함) */
        until: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        /** 고정비 항목으로 등록하고 맞는 지출을 잇는다 */
        item: z
          .object({
            name: z.string().min(1),
            amount: z.number().int().positive(),
            dayOfMonth: z.number().int().min(1).max(31),
            paymentMethod: Method.nullable().default(null),
          })
          .optional(),
      }),
    )
    .default([]),
});

export type Rules = z.input<typeof RulesSchema>;

/** 이체를 뺀 행을 마이그레이션만 한 빈 DB에 넣는다 */
export async function importPyunhan(db: Db, rows: PyunhanRow[], input: Rules) {
  const rules = RulesSchema.parse(input);
  const moved = rows
    .flatMap(row => (row.type === 'transfer' ? [] : [{ ...row, type: row.type }]))
    .sort((a, b) => a.at - b.at);

  // 많이 쓴 분류부터 앞에 둔다. 같은 이름의 기본 카테고리는 다시 쓰고, 남은 기본은 뒤로 보낸다
  const existing = await allCategories(db);
  for (const type of ['expense', 'income'] as const) {
    const counts = new Map<string, number>();
    for (const row of moved) {
      if (row.type === type) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    const names = [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    for (const [sortOrder, name] of names.entries()) {
      const same = existing.find(c => c.type === type && c.name === name);
      if (same) {
        await db
          .update(categories)
          .set({ sortOrder, hidden: false })
          .where(eq(categories.id, same.id));
      } else {
        await db.insert(categories).values({ type, name, sortOrder });
      }
    }
    const rest = existing.filter(c => c.type === type && !names.includes(c.name));
    for (const [i, category] of rest.entries()) {
      await db
        .update(categories)
        .set({ sortOrder: names.length + i, hidden: type === 'expense' })
        .where(eq(categories.id, category.id));
    }
  }
  const categoryIds = new Map((await allCategories(db)).map(c => [`${c.type}:${c.name}`, c.id]));
  const categoryId = (type: string, name: string) => {
    const id = categoryIds.get(`${type}:${name}`);
    if (id === undefined) throw new Error(`없는 분류예요: ${name}`);
    return id;
  };

  const ruleOf = moved.map(row =>
    rules.fixed.findIndex(
      rule =>
        row.type === 'expense' &&
        row.category === rule.category &&
        (rule.memo === undefined || row.memo === rule.memo) &&
        !(row.memo !== null && rule.except.includes(row.memo)) &&
        (rule.until === undefined || row.date <= rule.until),
    ),
  );

  // 고정비 항목의 등록 시각은 처음 이은 지출이다. 체크리스트가 등록 전 결제일을 미기록으로 잡지 않는다(PRD 4.4)
  const itemRules: number[] = [];
  for (const [index, rule] of rules.fixed.entries()) {
    const id = categoryId('expense', rule.category);
    if (!rule.item) continue;
    const linked = moved.filter((_, j) => ruleOf[j] === index);
    const createdAt = linked.length ? Math.min(...linked.map(row => row.at)) : Date.now();
    await db.insert(fixedCosts).values({
      ...rule.item,
      categoryId: id,
      sortOrder: itemRules.length,
      createdAt,
      updatedAt: createdAt,
    });
    itemRules.push(index);
  }
  const items = await allFixedCosts(db);
  const itemOf = new Map(itemRules.map((rule, i) => [rule, items[i].id]));

  const values = moved.map((row, j) => ({
    type: row.type,
    amount: row.amount,
    date: row.date,
    categoryId: categoryId(row.type, row.category),
    memo: row.memo,
    paymentMethod: rules.payment[row.asset] ?? null,
    isFixed: ruleOf[j] >= 0,
    fixedCostId: itemOf.get(ruleOf[j]) ?? null,
    createdAt: row.at,
    updatedAt: row.at,
  }));
  // SQLite 한 문장의 변수 수 상한을 넘지 않게 나눠 넣는다
  for (let i = 0; i < values.length; i += 200) {
    await db.insert(transactions).values(values.slice(i, i + 200));
  }
  return { transactions: moved.length, skippedTransfers: rows.length - moved.length };
}
