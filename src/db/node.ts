import { DatabaseSync } from 'node:sqlite';

import type { Db } from './index';
import { serialDb } from './serial';

/**
 * 마이그레이션 SQL을 적용한 메모리 DB. 테스트(jest/db.ts)와 PC 스크립트(scripts/import-pyunhan.mts)가 쓰고 앱은
 * 쓰지 않는다. 앱과 같은 drizzle sqlite-proxy 드라이버를 op-sqlite 대신 Node 내장 SQLite(Node 22.13 이상)로 잇고,
 * 앱처럼 쿼리를 한 줄로 세운다(serial.ts). `--> statement-breakpoint`는 SQL 주석이라 마이그레이션 파일째 실행된다
 */
export function nodeDb(migrations: string[]): Db {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of migrations) sqlite.exec(sql);
  return serialDb(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    if (method === 'run') {
      statement.run(...params);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    // setReturnArrays로 행이 값 배열이 된다. 타입은 이를 따라가지 않는다
    const rows = statement.all(...params) as unknown as unknown[][];
    return { rows: method === 'get' ? rows[0] : rows };
  });
}
