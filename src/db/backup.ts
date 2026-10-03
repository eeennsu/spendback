import { z } from 'zod';

import type { Db } from '.';
import { OutputSchema } from '../retro/check';
import { allBudgets } from './budgets';
import {
  budgets,
  cardInbox,
  categories,
  fixedCosts,
  reasonTags,
  retrospectives,
  transactions,
} from './schema';

/**
 * JSON 백업(PRD 4.8). 내보내기는 모든 기록을 한 파일로, 가져오기는 파일 전체를 먼저 검증한 뒤 한 트랜잭션으로
 * 전체 교체한다. 도중에 실패하면 기존 데이터가 그대로 남는다. 설정(사용 모델)은 기기에 딸린 값이라 넣지 않는다.
 * 스키마를 바꾸면 BACKUP_VERSION을 올리고 옛 버전을 읽는 변환을 둔다(upgrade).
 * 버전 2는 거래에 카드 알림의 가맹점과 추천값(PRD 4.9)을 더했다. 카드 알림 대기열은 기기에 딸린 값이라 넣지 않는다.
 */
export const BACKUP_VERSION = 2;

const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.number().int().nonnegative();
const type = z.enum(['expense', 'income']);
const paymentMethod = z.enum(['card', 'cash', 'transfer']).nullable();

const CategorySchema = z.object({
  id,
  type,
  name: z.string().min(1),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
  isDefault: z.boolean(),
});

const ReasonTagSchema = z.object({
  id,
  name: z.string().min(1),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
  isDefault: z.boolean(),
});

const FixedCostSchema = z.object({
  id,
  name: z.string().min(1),
  amount: z.number().int().positive(),
  categoryId: id,
  dayOfMonth: z.number().int().min(1).max(31),
  paymentMethod,
  sortOrder: z.number().int(),
  hidden: z.boolean(),
  createdAt: time,
  updatedAt: time,
});

const TransactionSchema = z.object({
  id,
  type,
  amount: z.number().int().positive(),
  date,
  categoryId: id,
  reasonTagId: id.nullable(),
  satisfaction: z.enum(['regret', 'neutral', 'satisfied']).nullable(),
  memo: z.string().nullable(),
  paymentMethod,
  isFixed: z.boolean(),
  fixedCostId: id.nullable(),
  merchant: z.string().nullable(),
  suggestedCategoryId: id.nullable(),
  suggestionSource: z.enum(['exact', 'llm']).nullable(),
  createdAt: time,
  updatedAt: time,
});

const BudgetSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/),
  total: z.number().int().nonnegative(),
  categoryBudgets: z.array(z.object({ categoryId: id, amount: z.number().int().positive() })),
});

const KeyedFactsSchema = z.object({
  kind: z.enum(['weekly', 'monthly']),
  period: z.string(),
  groups: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      facts: z.array(
        z.object({
          key: z.string(),
          value: z.string(),
          kind: z.enum(['noun', 'predicate']),
          note: z.string(),
        }),
      ),
      focus: z.array(z.string()).optional(),
    }),
  ),
});

const RetrospectiveSchema = z.object({
  id,
  kind: z.enum(['weekly', 'monthly']),
  periodStart: date,
  periodEnd: date,
  facts: KeyedFactsSchema,
  output: OutputSchema,
  modelId: z.string(),
  promptVersion: z.string(),
  createdAt: time,
});

export const BackupSchema = z
  .object({
    app: z.literal('spendback'),
    version: z.literal(BACKUP_VERSION),
    exportedAt: z.string(),
    categories: z.array(CategorySchema),
    reasonTags: z.array(ReasonTagSchema),
    fixedCosts: z.array(FixedCostSchema),
    transactions: z.array(TransactionSchema),
    budgets: z.array(BudgetSchema),
    retrospectives: z.array(RetrospectiveSchema),
  })
  .superRefine((backup, ctx) => {
    // 외래 키는 DB도 막지만, 어느 기록이 틀렸는지 알 수 있게 먼저 본다
    const categoryIds = new Set(backup.categories.map(c => c.id));
    const tagIds = new Set(backup.reasonTags.map(t => t.id));
    const fixedIds = new Set(backup.fixedCosts.map(f => f.id));
    const broken = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    backup.transactions.forEach((tx, i) => {
      if (!categoryIds.has(tx.categoryId)) broken(['transactions', i], '없는 카테고리');
      if (tx.suggestedCategoryId !== null && !categoryIds.has(tx.suggestedCategoryId))
        broken(['transactions', i], '없는 추천 카테고리');
      if (tx.reasonTagId !== null && !tagIds.has(tx.reasonTagId))
        broken(['transactions', i], '없는 이유 태그');
      if (tx.fixedCostId !== null && !fixedIds.has(tx.fixedCostId))
        broken(['transactions', i], '없는 고정비 항목');
    });
    backup.fixedCosts.forEach((item, i) => {
      if (!categoryIds.has(item.categoryId)) broken(['fixedCosts', i], '없는 카테고리');
    });
    backup.budgets.forEach((budget, i) => {
      if (budget.categoryBudgets.some(c => !categoryIds.has(c.categoryId)))
        broken(['budgets', i], '없는 카테고리');
    });
  });

export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(db: Db, now = new Date()): Promise<Backup> {
  return {
    app: 'spendback',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    categories: await db.select().from(categories),
    reasonTags: await db.select().from(reasonTags),
    fixedCosts: await db.select().from(fixedCosts),
    transactions: await db.select().from(transactions),
    budgets: await allBudgets(db),
    retrospectives: await db.select().from(retrospectives),
  };
}

/** 가져오기 전에 사용자에게 보여 줄 오류. 스키마 메시지를 그대로 보이지 않는다 */
export class BackupError extends Error {}

/** 버전 1 파일의 거래에는 가맹점과 추천값이 없다. 없는 것(null)으로 채워 버전 2로 읽는다 */
function upgrade(raw: Record<string, unknown>) {
  if (raw.version !== 1) return raw;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
  return {
    ...raw,
    version: BACKUP_VERSION,
    transactions: transactions.map((tx: object) => ({
      merchant: null,
      suggestedCategoryId: null,
      suggestionSource: null,
      ...tx,
    })),
  };
}

/** 파일 내용을 읽어 검증한다. 다른 앱의 파일, 다른 버전, 깨진 기록을 구분해 알린다 */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('JSON 파일이 아니에요');
  }
  const head = raw as { app?: unknown; version?: unknown } | null;
  if (head?.app !== 'spendback') throw new BackupError('spendback 백업 파일이 아니에요');
  if (head.version !== 1 && head.version !== BACKUP_VERSION)
    throw new BackupError('지원하지 않는 백업 버전이에요');
  const parsed = BackupSchema.safeParse(upgrade(raw as Record<string, unknown>));
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.slice(0, 2).join(' ');
    throw new BackupError(`백업의 기록이 올바르지 않아요(${where})`);
  }
  return parsed.data;
}

/** SQLite 한 문장의 변수 수 상한을 넘지 않게 나눠 넣는다 */
async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 200) await insert(rows.slice(i, i + 200));
}

/** 전체 교체. 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다 */
export async function importBackup(db: Db, backup: Backup) {
  await db.transaction(async tx => {
    // 카드 알림 대기열은 백업 밖이라 남는다. 추천과 짝은 지금 기록의 카테고리·거래를 가리키므로 비워, 새 기록으로
    // 다시 정한다(PRD 4.9)
    await tx.update(cardInbox).set({
      suggestedCategoryId: null,
      suggestionSource: null,
      suggestedAt: null,
      pairedTransactionId: null,
    });
    // 다른 표가 가리키는 표를 나중에 지우고 먼저 넣는다
    await tx.delete(transactions);
    await tx.delete(retrospectives);
    await tx.delete(fixedCosts);
    await tx.delete(budgets);
    await tx.delete(reasonTags);
    await tx.delete(categories);
    await insertAll(backup.categories, rows => tx.insert(categories).values(rows));
    await insertAll(backup.reasonTags, rows => tx.insert(reasonTags).values(rows));
    await insertAll(backup.fixedCosts, rows => tx.insert(fixedCosts).values(rows));
    await insertAll(backup.transactions, rows => tx.insert(transactions).values(rows));
    await insertAll(backup.budgets, rows => tx.insert(budgets).values(rows));
    await insertAll(backup.retrospectives, rows => tx.insert(retrospectives).values(rows));
  });
}

/** 백업에 든 기록 수. 가져오기 확인 대화상자에 보인다 */
export const backupSummary = (backup: Backup) => ({
  transactions: backup.transactions.length,
  fixedCosts: backup.fixedCosts.length,
  retrospectives: backup.retrospectives.length,
});
