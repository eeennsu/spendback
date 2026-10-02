import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { saveRetrospective } from '../db/retrospectives';
import type { Facts } from '../domain/facts';
import type { PeriodRef } from '../domain/periods';
import { hasModel, modelPath } from '../native/files';
import type { Names } from '../retro/keys';
import { llamaNarrator } from '../retro/llama';
import { APP_MODELS, DEFAULT_MODEL_ID } from '../retro/models';
import { type NarrateResult, narrate } from '../retro/narrate';
import { PROMPT_VERSION } from '../retro/prompt';
import { mutate } from './data';

export type Generation =
  | { status: 'idle' }
  | { status: 'writing'; sentences: string[]; retrying: boolean }
  | { status: 'fallback'; reason: 'no-model' | 'load-failed' | 'check-failed' }
  | { status: 'cancelled' };

/** 사용할 모델. 설정이 없거나 레지스트리에서 빠진 모델이면 기본 모델이다(PRD 6장) */
export const modelFor = (id: string | undefined) =>
  APP_MODELS.find(m => m.id === id) ??
  APP_MODELS.find(m => m.id === DEFAULT_MODEL_ID) ??
  APP_MODELS[0];

/**
 * 회고 문장 생성(PRD 4.6, 6장 실행 정책). 생성할 때만 모델을 올리고, 화면을 나가거나 앱이 백그라운드로 가면 생성을
 * 취소하고 모델을 내린다. 필드가 완성될 때마다 문장이 하나씩 나오고, 사후 검사에 걸리면 지우고 다시 쓴다.
 * 성공하면 저장하고 idle로 돌아간다(화면은 저장본을 그린다). 폴백은 저장하지 않는다
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
    narrator.current = llamaNarrator(modelPath(model));
    setState({ status: 'writing', sentences: [], retrying: false });

    let result: NarrateResult;
    try {
      result = await narrate({
        facts,
        names,
        generate: narrator.current.generate,
        signal: abort.signal,
        onSentence: sentence =>
          setState(s =>
            s.status === 'writing' ? { ...s, sentences: [...s.sentences, sentence.rendered] } : s,
          ),
        onRetry: () => setState({ status: 'writing', sentences: [], retrying: true }),
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
      setState({ status: 'idle' });
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
