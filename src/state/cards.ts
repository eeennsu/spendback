import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { syncInbox, suggestPending } from '../cards/inbox';
import { watchedApps } from '../cards/parse';
import type { Category } from '../cards/prompt';
import Cards from '../native/NativeSpendbackCards';
import { hasModel, modelPath } from '../native/files';
import { llamaBusy, llamaNarrator } from '../retro/llama';
import type { Model } from '../retro/models';
import { mutate } from './data';

/**
 * 카드 알림(PRD 4.9). 네이티브 서비스가 적은 대기열을 DB로 옮기고(syncCards), 처음 보는 가맹점의 카테고리를 LLM에
 * 묻는다(suggestCards). 모델은 한 번에 한 벌이다(PRD 6장 실행 정책): 회고가 모델을 쓰고 있으면 묻지 않고, 회고가
 * 시작하면 추천을 멈추고 내린다(stopCardSuggestions). 앱이 백그라운드로 가도 멈춘다.
 */

/** 동기화를 하나씩 한다. 앱이 앞으로 올 때와 새 알림 이벤트가 겹쳐도 같은 원문을 두 번 읽지 않는다 */
let syncing: Promise<void> = Promise.resolve();

export function syncCards() {
  syncing = syncing.then(async () => {
    const queued = await Cards.readInbox();
    if (!queued.length) return;
    await mutate(database => syncInbox(database, queued));
    // DB에 넣은 뒤에 지운다. 넣다가 실패하면 다음 동기화에서 다시 읽는다(같은 알림은 지문으로 한 번만 들어간다)
    await Cards.ackInbox(queued.map(q => q.id));
  });
  syncing = syncing.catch(error => console.error(error));
  return syncing;
}

/** 앱 루트에서 한 번 쓴다. 지켜볼 앱을 정하고, 시작할 때·앞으로 올 때·새 알림이 올 때 동기화한다 */
export function useCardSync(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    Cards.setWatchedApps(watchedApps(__DEV__));
    void syncCards();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void syncCards();
      else void stopCardSuggestions();
    });
    const queued = Cards.onQueued(() => void syncCards());
    return () => {
      appState.remove();
      queued.remove();
    };
  }, [ready]);
}

let batch: { abort: AbortController; release: () => Promise<void> } | null = null;

/**
 * 처음 보는 가맹점의 승인에 LLM 추천을 붙인다. 이미 돌고 있거나, 모델이 없거나, 회고가 모델을 쓰고 있으면 하지 않는다.
 * 다 돌면 모델을 내린다
 */
export async function suggestCards(categories: Category[], model: Model) {
  if (batch || llamaBusy() || !hasModel(model)) return;
  const abort = new AbortController();
  const narrator = llamaNarrator(modelPath(model));
  batch = { abort, release: narrator.release };
  try {
    await mutate(database => suggestPending(database, categories, narrator.generate, abort.signal));
  } finally {
    if (batch?.abort === abort) batch = null;
    await narrator.release();
  }
}

/** 추천을 멈추고 모델을 내린다. 회고가 모델을 올리기 전에 부른다 */
export function stopCardSuggestions() {
  const running = batch;
  batch = null;
  running?.abort.abort();
  return running?.release() ?? Promise.resolve();
}

export const isListenerEnabled = () => Cards.isListenerEnabled();

/** 알림 접근 허용 여부. 시스템 설정에서 돌아오면(앱이 앞으로 오면) 다시 읽는다 */
export function useListenerEnabled() {
  const [enabled, setEnabled] = useState(isListenerEnabled);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setEnabled(isListenerEnabled());
    });
    return () => subscription.remove();
  }, []);
  return enabled;
}
export const openListenerSettings = () => Cards.openListenerSettings();
