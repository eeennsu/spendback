import { type LlamaContext, initLlama } from 'llama.rn';

import { INFERENCE } from './models';
import { type Generate, NarratorError } from './narrate';

/**
 * 앞 narrator가 모델을 내리는 중이면 다음 로드는 그 뒤에 한다. 다시 만들기를 바로 누르면 2GB 안팎의 모델 두 벌이
 * 한꺼번에 메모리에 오를 수 있어서다
 */
let releasing: Promise<void> = Promise.resolve();

/**
 * 실패해도 넘어간다. llama.rn 0.12.9의 stopCompletion은 타입은 Promise지만 JSI 동기 호출이라 undefined를 돌려준다
 * (기기에서 `.catch`가 TypeError를 냈다)
 */
const settle = (task: () => unknown) =>
  Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      () => undefined,
    );

/**
 * llama.rn 구현(PRD 6장). 첫 생성 때 모델을 올리고, 회고 상세를 나가거나 앱이 백그라운드로 가면 release한다.
 * 추론 모드는 끈다. llama.rn 0.12.9의 ignore_eos·logit_bias는 SIGSEGV를 내므로 쓰지 않는다(PRD 6장, 10장).
 * 생성 중인 컨텍스트를 release하면 네이티브 생성 스레드가 해제된 컨텍스트를 읽어 앱이 죽는다(에뮬레이터에서 프롬프트
 * 처리 중 취소로 확인). release는 생성을 멈추고 끝나기를 기다린 뒤에 한다.
 *
 * @param modelPath 받은 모델 파일. 없으면 null이고 생성은 "모델 없음" 폴백이다
 */
export function llamaNarrator(modelPath: string | null) {
  let context: Promise<LlamaContext> | undefined;
  /** 진행 중인 completion. 실패해도 release를 막지 않게 오류는 삼킨다 */
  let running: Promise<unknown> = Promise.resolve();

  const load = () => {
    if (!modelPath) throw new NarratorError('no-model');
    context ??= releasing
      .then(() =>
        initLlama({
          model: modelPath,
          n_ctx: INFERENCE.contextSize,
          n_threads: INFERENCE.threads,
          n_gpu_layers: 0,
          use_mlock: false,
        }),
      )
      .catch(() => {
        context = undefined;
        throw new NarratorError('load-failed');
      });
    return context;
  };

  const generate: Generate = async ({ messages, grammar, seed }, onToken, signal) => {
    const llama = await load();
    // 로드하는 동안 취소됐으면 시작하지 않는다. release가 곧 이 컨텍스트를 내린다
    if (signal.aborted) return '';
    const stop = () => void llama.stopCompletion();
    signal.addEventListener('abort', stop);
    try {
      const completion = llama.completion(
        {
          messages,
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'none',
          grammar,
          seed,
          n_predict: INFERENCE.maxTokens,
          temperature: INFERENCE.temperature,
          top_k: INFERENCE.topK,
          top_p: INFERENCE.topP,
          min_p: INFERENCE.minP,
          penalty_repeat: INFERENCE.repeatPenalty,
          penalty_last_n: INFERENCE.repeatLastTokens,
        },
        data => onToken(data.token),
      );
      running = completion.catch(() => undefined);
      const result = await completion;
      return result.text;
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };

  const release = () => {
    const loaded = context;
    context = undefined;
    if (!loaded) return releasing;
    const previous = releasing;
    releasing = (async () => {
      await previous;
      const llama = await loaded.catch(() => undefined);
      if (!llama) return;
      await settle(() => llama.stopCompletion());
      await running;
      await settle(() => llama.release());
    })().catch(() => undefined);
    return releasing;
  };

  return { generate, release };
}
