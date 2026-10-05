import type { Db } from '../src/db';
import migrations from '../src/db/migrations/migrations';
import { nodeDb } from '../src/db/node';

/** 마이그레이션을 적용한 메모리 DB(src/db/node.ts). 마이그레이션 SQL은 babel inline-import로 문자열이 된다 */
export function testDb(): Db {
  return nodeDb(Object.values(migrations.migrations));
}
