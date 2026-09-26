import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { Output } from '../retro/check';
import type { KeyedFacts } from '../retro/keys';

/**
 * PRD 7장 데이터 모델. 도메인 타입(src/domain/types.ts)은 여기서 추론한다.
 * 금액은 원 단위 정수, 날짜는 로컬 `YYYY-MM-DD`, 달은 `YYYY-MM`, 시각은 epoch ms다.
 * id는 SQLite 정수 키다. 백업 가져오기는 전체 교체라 기기 사이에 id가 겹칠 일이 없다(PRD 13장).
 * 카테고리·태그·고정비는 지우지 않고 숨긴다. 과거 거래와 집계를 보존한다(PRD 4.2).
 */

const id = () => integer('id').primaryKey({ autoIncrement: true });
const hidden = () => integer('hidden', { mode: 'boolean' }).notNull().default(false);
const createdAt = () =>
  integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now());
const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now());

const TX_TYPES = ['expense', 'income'] as const;
const PAYMENT_METHODS = ['card', 'cash', 'transfer'] as const;

export const categories = sqliteTable('categories', {
  id: id(),
  type: text('type', { enum: TX_TYPES }).notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  hidden: hidden(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
});

export const reasonTags = sqliteTable('reason_tags', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  hidden: hidden(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
});

export const fixedCosts = sqliteTable(
  'fixed_costs',
  {
    id: id(),
    name: text('name').notNull(),
    /** 예상 금액. 입력 폼 기본값으로만 쓴다(PRD 4.4) */
    amount: integer('amount').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    /** 그 달에 없는 날이면 말일로 본다 */
    dayOfMonth: integer('day_of_month').notNull(),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
    sortOrder: integer('sort_order').notNull(),
    hidden: hidden(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('fixed_costs_amount', sql`${t.amount} > 0`),
    check('fixed_costs_day', sql`${t.dayOfMonth} BETWEEN 1 AND 31`),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: id(),
    type: text('type', { enum: TX_TYPES }).notNull(),
    amount: integer('amount').notNull(),
    date: text('date').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    /** 지출만 */
    reasonTagId: integer('reason_tag_id').references(() => reasonTags.id),
    /** 지출만 */
    satisfaction: text('satisfaction', { enum: ['regret', 'neutral', 'satisfied'] }),
    memo: text('memo'),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
    isFixed: integer('is_fixed', { mode: 'boolean' }).notNull().default(false),
    fixedCostId: integer('fixed_cost_id').references(() => fixedCosts.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    // 기간 조회(홈·내역·회고)는 모두 날짜 범위다
    index('transactions_date').on(t.date),
    check('transactions_amount', sql`${t.amount} > 0`),
    check('transactions_fixed_cost', sql`${t.fixedCostId} IS NULL OR ${t.isFixed} = 1`),
  ],
);

/** 한 달의 예산은 effectiveFrom이 그 달 이하인 것 중 가장 늦은 것이다. 지난 달의 예산은 고치지 않는다(PRD 4.3) */
export const budgets = sqliteTable('budgets', {
  effectiveFrom: text('effective_from').primaryKey(),
  total: integer('total').notNull(),
  /** 예산을 정한 카테고리만 */
  categoryBudgets: text('category_budgets', { mode: 'json' })
    .$type<Array<{ categoryId: number; amount: number }>>()
    .notNull(),
});

/**
 * 회고(PRD 4.6). (kind, periodStart)마다 1개이고, 재생성에 성공하면 덮어쓴다. 폴백 상태는 저장하지 않는다.
 * facts는 LLM이 본 키와 값이다. 문장은 이 스냅샷으로 채우므로 나중에 이름을 바꿔도 회고는 그대로다
 */
export const retrospectives = sqliteTable(
  'retrospectives',
  {
    id: id(),
    kind: text('kind', { enum: ['weekly', 'monthly'] }).notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    facts: text('facts', { mode: 'json' }).$type<KeyedFacts>().notNull(),
    output: text('output', { mode: 'json' }).$type<Output>().notNull(),
    modelId: text('model_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('retrospectives_period').on(t.kind, t.periodStart)],
);
