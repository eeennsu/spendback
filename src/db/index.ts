import { type DB, open } from '@op-engineering/op-sqlite';
import type { OPSQLiteDatabase } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import migrations from './migrations/migrations';
import * as schema from './schema';

let connection: DB | undefined;

// 불러올 때가 아니라 처음 쿼리할 때 연다. 네이티브 모듈이 없는 Jest에서도 이 파일을 불러올 수 있다
function sqlite() {
  if (!connection) {
    connection = open({ name: 'spendback.db' });
    // SQLite는 연결마다 외래 키 검사를 켜야 한다
    connection.executeSync('PRAGMA foreign_keys = ON');
  }
  return connection;
}

/**
 * drizzle-orm의 op-sqlite 드라이버는 op-sqlite 옛 API(executeAsync, rows._array)를 불러 op-sqlite 18에서
 * 동작하지 않는다(drizzle-orm 0.45.3, 1.0.0-rc.4 모두). 범용 드라이버 sqlite-proxy로 잇는다.
 * proxy는 run 말고는 행을 값 배열로 받는다. get은 첫 행 하나다.
 */
export const db = drizzle(
  async (query, params, method) => {
    if (method === 'run') {
      await sqlite().execute(query, params);
      return { rows: [] };
    }
    const { rawRows } = await sqlite().executeRaw(query, params);
    return { rows: method === 'get' ? rawRows[0] : rawRows };
  },
  { schema },
);

/**
 * 앱을 열 때 한 번 부른다. op-sqlite 마이그레이터는 드라이버와 상관없이 db.dialect.migrate(마이그레이션, db.session)만
 * 부르므로 proxy db에도 쓸 수 있다. 타입만 op-sqlite db를 요구한다.
 */
export function runMigrations() {
  return migrate(db as unknown as OPSQLiteDatabase<typeof schema>, migrations);
}
