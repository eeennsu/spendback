import { type AsyncRemoteCallback, drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Db } from './index';
import * as schema from './schema';

/**
 * 연결 하나를 쓰는 drizzle sqlite-proxy db를 한 줄로 세운다. drizzle 트랜잭션은 begin, 문장, commit을 따로 보내므로
 * 잠그지 않으면 다른 흐름(입력 시트 저장, 카드 알림 동기화, 백업 가져오기)의 문장이 열린 트랜잭션에 끼어들어 함께
 * 롤백되거나, 겹친 begin이 실패한다. 트랜잭션은 begin부터 commit·rollback까지 잠금을 쥐고, 그 밖의 쿼리는 문장마다
 * 잠금을 기다린다. 트랜잭션 안의 문장은 tx로 보내 잠그지 않는다. 그래서 트랜잭션 안에서 바깥 db를 쓰면 멈춘다
 */
export function serialDb(run: AsyncRemoteCallback): Db {
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>) => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
  const inside = drizzle(run, { schema });
  const db = drizzle((query, params, method) => exclusive(() => run(query, params, method)), {
    schema,
  });
  db.transaction = (transaction, config) =>
    exclusive(() => inside.transaction(transaction, config));
  return db;
}
