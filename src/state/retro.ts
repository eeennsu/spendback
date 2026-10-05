import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { saveRetrospective } from '../db/retrospectives';
import type { Facts } from '../domain/facts';
import type { PeriodRef } from '../domain/periods';
import { hasModel, modelPath } from '../native/files';
import type { Output } from '../retro/check';
import type { KeyedFacts, Names } from '../retro/keys';
import { llamaNarrator } from '../retro/llama';
import { APP_MODELS, DEFAULT_MODEL_ID } from '../retro/models';
import { type NarrateResult, narrate } from '../retro/narrate';
import { PROMPT_VERSION } from '../retro/prompt';
import { stopCardSuggestions } from './cards';
import { mutate } from './data';

export type Generation =
  | { status: 'idle' }
  /** templates는 나온 headline·insight의 틀이다. 회고 상세가 카드의 비교 줄을 정하는 데 쓴다 */
  | { status: 'writing'; sentences: string[]; templates: string[]; retrying: boolean }
  /** 방금 만들어 저장했다. 화면의 DB 읽기가 따라오기 전에도 새 회고를 보인다 */
  | { status: 'saved'; facts: KeyedFacts; output: Output; modelId: string }
  | { status: 'fallback'; reason: 'no-model' | 'load-failed' | 'check-failed' }
  | { status: 'cancelled' };

/**
 * 사용할 모델. 설정이 없거나 레지스트리에서 빠진 모델이면 기본 모델이다(PRD 6장). 그 파일이 없으면 받아 둔 다른 모델을
 * 쓴다(PRD 4.7). 받은 모델이 하나도 없으면 고른 모델이고, 화면은 "모델 없음"으로 본다
 */
export const modelFor = (id: string | undefined) => {
  const chosen =
    APP_MODELS.find(m => m.id === id) ??
    APP_MODELS.find(m => m.id === DEFAULT_MODEL_ID) ??
    APP_MODELS[0];
  if (hasModel(chosen)) return chosen;
  // 고른 모델 파일이 없으면(다른 모델만 받았거나 쓰던 모델을 지웠다) 받아 둔 모델을 기본 모델부터 쓴다
  const byDefault = [...APP_MODELS].sort(
    (a, b) => Number(b.id === DEFAULT_MODEL_ID) - Number(a.id === DEFAULT_MODEL_ID),
  );
  return byDefault.find(hasModel) ?? chosen;
};

/**
 * 회고 문장 생성(PRD 4.6, 6장 실행 정책). 생성할 때만 모델을 올리고, 화면을 나가거나 앱이 백그라운드로 가면 생성을
 * 취소하고 모델을 내린다. 필드가 완성될 때마다 문장이 하나씩 나오고, 사후 검사에 걸리면 지우고 다시 쓴다.
 * 성공하면 저장하고 saved로 바뀐다. 저장 직후 화면이 DB를 다시 읽는 사이에 "아직 회고가 없어요"가 비치지 않게 새 회고를
 * 상태에 들고 있는다. 폴백은 저장하지 않는다
 */
export function useGeneration(period: PeriodRef) {
  const [state, setState] = useState<Generation>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const narrator = useRef<ReturnType<typeof llamaNarrator> | null>(null);

  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    const loaded = narrator.current;
    narrator.current = null;
    void loaded?.release();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && controller.current) {
        stop();
        setState({ status: 'cancelled' });
      }
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, []);

  const start = async ({
    facts,
    names,
    modelId,
  }: {
    facts: Facts;
    names: Names;
    modelId?: string;
  }) => {
    stop();
    const model = modelFor(modelId);
    if (!hasModel(model)) {
      setState({ status: 'fallback', reason: 'no-model' });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    // 카드 알림 추천이 모델을 쓰고 있으면 멈추고 내린다. 다음 로드는 내린 뒤에 한다(llama.ts releasing)
    void stopCardSuggestions();
    narrator.current = llamaNarrator(modelPath(model));
    setState({ status: 'writing', sentences: [], templates: [], retrying: false });

    let result: NarrateResult;
    try {
      result = await narrate({
        facts,
        names,
        generate: narrator.current.generate,
        signal: abort.signal,
        onSentence: sentence =>
          setState(s =>
            s.status === 'writing'
              ? {
                  ...s,
                  sentences: [...s.sentences, sentence.rendered],
                  templates:
                    sentence.field === 'suggestion' ? s.templates : [...s.templates, sentence.text],
                }
              : s,
          ),
        onRetry: () =>
          setState({ status: 'writing', sentences: [], templates: [], retrying: true }),
      });
    } catch {
      result = { status: 'fallback', reason: 'load-failed' };
    }
    if (controller.current !== abort) return;
    stop();

    if (result.status === 'done') {
      const keyed = result.keyed;
      const output = result.output;
      await mutate(db =>
        saveRetrospective(db, {
          kind: period.kind,
          periodStart: period.start,
          periodEnd: period.end,
          facts: keyed,
          output,
          modelId: model.id,
          promptVersion: PROMPT_VERSION,
        }),
      );
      setState({ status: 'saved', facts: keyed, output, modelId: model.id });
    } else if (result.status === 'fallback') {
      setState({ status: 'fallback', reason: result.reason });
    } else if (result.status === 'cancelled') {
      setState({ status: 'cancelled' });
    } else {
      setState({ status: 'idle' });
    }
  };

  const cancel = () => {
    stop();
    setState({ status: 'cancelled' });
  };

  return { state, start, cancel };
}
