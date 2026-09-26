import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { DatabaseSync } from 'node:sqlite';

import type { Db } from '../src/db';
import migrations from '../src/db/migrations/migrations';
import * as schema from '../src/db/schema';

/**
 * 마이그레이션을 적용한 메모리 DB. 앱과 같은 drizzle sqlite-proxy 드라이버를 op-sqlite 대신 Node 내장 SQLite
 * (Node 22.13 이상)로 잇는다. `--> statement-breakpoint`는 SQL 주석이라 마이그레이션 파일째 실행된다
 */
export function testDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of Object.values(migrations.migrations)) sqlite.exec(sql);
  return drizzle(
    async (query, params, method) => {
      const statement = sqlite.prepare(query);
      if (method === 'run') {
        statement.run(...params);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      // setReturnArrays로 행이 값 배열이 된다. 타입은 이를 따라가지 않는다
      const rows = statement.all(...params) as unknown as unknown[][];
      return { rows: method === 'get' ? rows[0] : rows };
    },
    { schema },
  );
}
