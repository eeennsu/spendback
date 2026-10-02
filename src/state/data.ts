import { useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { type Db, db } from '../db';
import { toLocalDate } from '../domain/date';

/**
 * 화면이 로컬 DB를 구독하는 방법(docs/DESIGN.md 3.6 "새로 고침"). 쓰기는 mutate로만 하고, mutate가 끝나면 version을
 * 올려 useQuery가 다시 읽는다. 상태 저장소(Zustand)는 이 숫자 같은 UI 상태만 갖고 데이터의 기준은 DB다(PRD 8장)
 */
type DataState = { version: number; bump: () => void };

export const useDataStore = create<DataState>(set => ({
  version: 0,
  bump: () => set(state => ({ version: state.version + 1 })),
}));

/** DB에 쓰고 구독하는 화면을 다시 그린다 */
export async function mutate<T>(write: (db: Db) => Promise<T>): Promise<T> {
  const result = await write(db);
  useDataStore.getState().bump();
  return result;
}

/** 구독하지 않고 한 번 읽는다(눌렀을 때의 조회) */
export const read = <T>(query: (db: Db) => Promise<T>) => query(db);

/**
 * DB를 읽는다. key가 바뀌거나 무언가 쓰이면 다시 읽고, 다시 읽는 동안에는 같은 key의 이전 값을 보인다.
 * 로컬 DB라 읽기는 금방 끝나므로 로딩 표시를 두지 않는다(docs/DESIGN.md 3.6)
 */
export function useQuery<T>(key: string, read: (db: Db) => Promise<T>): T | undefined {
  const version = useDataStore(state => state.version);
  const [result, setResult] = useState<{ key: string; data: T }>();
  const load = useEffectEvent(() => read(db));

  useEffect(() => {
    let alive = true;
    load().then(
      data => alive && setResult({ key, data }),
      error => console.error(error),
    );
    return () => {
      alive = false;
    };
  }, [key, version]);

  return result?.key === key ? result.data : undefined;
}

/** 오늘 날짜. 앱이 앞으로 올 때마다 다시 읽어 자정을 넘겨도 맞는다 */
export function useToday() {
  const [today, setToday] = useState(() => toLocalDate(new Date()));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setToday(toLocalDate(new Date()));
    });
    return () => subscription.remove();
  }, []);
  return today;
}
