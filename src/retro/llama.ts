import { type LlamaContext, initLlama } from 'llama.rn';

import { INFERENCE } from './models';
import { type Generate, NarratorError } from './narrate';

/**
 * llama.rn 구현(PRD 6장). 첫 생성 때 모델을 올리고, 회고 상세를 나가거나 앱이 백그라운드로 가면 release한다.
 * 추론 모드는 끈다. llama.rn 0.12.9의 ignore_eos·logit_bias는 SIGSEGV를 내므로 쓰지 않는다(PRD 6장, 10장).
 *
 * @param modelPath 받은 모델 파일. 없으면 null이고 생성은 "모델 없음" 폴백이다
 */
export function llamaNarrator(modelPath: string | null) {
  let context: Promise<LlamaContext> | undefined;

  const load = () => {
    if (!modelPath) throw new NarratorError('no-model');
    context ??= initLlama({
      model: modelPath,
      n_ctx: INFERENCE.contextSize,
      n_threads: INFERENCE.threads,
      n_gpu_layers: 0,
      use_mlock: false,
    }).catch(() => {
      context = undefined;
      throw new NarratorError('load-failed');
    });
    return context;
  };

  const generate: Generate = async ({ messages, grammar, seed }, onToken, signal) => {
    const llama = await load();
    const stop = () => void llama.stopCompletion();
    signal.addEventListener('abort', stop);
    try {
      const result = await llama.completion(
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
      return result.text;
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };

  const release = async () => {
    const loaded = context;
    context = undefined;
    if (loaded) await (await loaded).release();
  };

  return { generate, release };
}
