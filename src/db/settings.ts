import { eq } from 'drizzle-orm';

import type { Db } from '.';
import { settings } from './schema';

/** 설정 키와 값의 타입(PRD 7장) */
export type Settings = {
  /** 회고에 쓸 모델(src/retro/models.ts MODELS의 id). 없으면 기본 모델이다 */
  model: string;
};

export async function getSetting<K extends keyof Settings>(db: Db, key: K) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as Settings[K]) : undefined;
}

export function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]) {
  const json = JSON.stringify(value);
  return db
    .insert(settings)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: settings.key, set: { value: json } });
}
