import { DatabaseSync } from 'node:sqlite';

import migrations from '../src/db/migrations/migrations';

/**
 * drizzle-kit이 만든 SQL과 손으로 쓴 기본값(0001_seed.sql)이 순서대로 적용되는지 Node 내장 SQLite로 확인한다.
 * 앱은 같은 SQL을 op-sqlite로 적용한다(src/db/index.ts). `--> statement-breakpoint`는 SQL 주석이라 파일째 실행된다.
 */
function migrated() {
  const db = new DatabaseSync(':memory:');
  for (const sql of Object.values(migrations.migrations)) db.exec(sql);
  return db;
}

const names = (db: DatabaseSync, query: string) =>
  db
    .prepare(query)
    .all()
    .map(row => row.name);

test('기본 카테고리와 이유 태그가 PRD 4.2와 같다', () => {
  const db = migrated();
  expect(
    names(db, "SELECT name FROM categories WHERE type = 'expense' ORDER BY sort_order"),
  ).toEqual([
    '식비',
    '카페·간식',
    '배달',
    '교통',
    '쇼핑',
    '생활',
    '주거·통신',
    '문화·여가',
    '의료·건강',
    '경조사·선물',
    '기타',
  ]);
  expect(
    names(db, "SELECT name FROM categories WHERE type = 'income' ORDER BY sort_order"),
  ).toEqual(['급여', '부수입', '기타']);
  expect(names(db, 'SELECT name FROM reason_tags ORDER BY sort_order')).toEqual([
    '필요',
    '충동',
    '보상·스트레스',
    '약속·사교',
    '습관',
    '선물',
  ]);
});

test('고정비 항목에는 고정비 거래만 연결된다(PRD 7장)', () => {
  const db = migrated();
  db.exec(`INSERT INTO fixed_costs (name, amount, category_id, day_of_month, sort_order, created_at, updated_at)
    VALUES ('월세', 500000, 7, 25, 0, 0, 0)`);
  const insert = (isFixed: number) =>
    db.exec(`INSERT INTO transactions (type, amount, date, category_id, is_fixed, fixed_cost_id, created_at, updated_at)
      VALUES ('expense', 500000, '2026-09-25', 7, ${isFixed}, 1, 0, 0)`);
  expect(() => insert(0)).toThrow(/CHECK constraint failed/);
  expect(() => insert(1)).not.toThrow();
});
