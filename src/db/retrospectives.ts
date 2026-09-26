import { and, eq } from 'drizzle-orm';

import type { Db } from '.';
import { retrospectives } from './schema';

type Retrospective = typeof retrospectives.$inferInsert;
type Kind = Retrospective['kind'];

/** 한 기간에 회고는 1개다. 재생성에 성공하면 덮어쓴다(PRD 4.6) */
export function saveRetrospective(db: Db, retro: Omit<Retrospective, 'id' | 'createdAt'>) {
  const createdAt = Date.now();
  return db
    .insert(retrospectives)
    .values({ ...retro, createdAt })
    .onConflictDoUpdate({
      target: [retrospectives.kind, retrospectives.periodStart],
      set: { ...retro, createdAt },
    });
}

/** 저장본이 있으면 보여주고, 없으면 회고 상세를 처음 열 때 생성한다(PRD 4.6) */
export function findRetrospective(db: Db, kind: Kind, periodStart: string) {
  return db
    .select()
    .from(retrospectives)
    .where(and(eq(retrospectives.kind, kind), eq(retrospectives.periodStart, periodStart)))
    .get();
}
