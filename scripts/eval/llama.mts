import {
  type ChatWrapper,
  type Llama,
  LlamaChatSession,
  type LlamaContext,
  resolveChatWrapper,
} from 'node-llama-cpp';
import { join } from 'node:path';

import { INFERENCE, type Model } from '../../src/retro/models';
import type { Generate } from '../../src/retro/narrate';
import { modelsDir } from './args';

/** 앱 설정(INFERENCE)에 하네스만 바꿔 보는 존재 벌점을 더한 것. 0이면 끈다 */
export type Inference = typeof INFERENCE & { presencePenalty: number };

/**
 * node-llama-cpp 구현. 앱의 llama.rn 구현과 같은 설정을 쓴다(src/retro/models.ts INFERENCE). 요청이 온도를 주면
 * 그 온도를 쓴다(카드 알림의 카테고리 추천은 0)
 */
function llamaGenerate(
  llama: Llama,
  context: LlamaContext,
  chatWrapper: ChatWrapper,
  inference: Inference,
): Generate {
  return async ({ messages, grammar, seed, temperature }, onToken, signal) => {
    const sequence = context.getSequence();
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        chatWrapper,
        systemPrompt: messages[0].content,
      });
      return await session.prompt(messages[1].content, {
        grammar: await llama.createGrammar({ grammar }),
        seed,
        temperature: temperature ?? inference.temperature,
        topK: inference.topK,
        topP: inference.topP,
        minP: inference.minP,
        maxTokens: inference.maxTokens,
        repeatPenalty:
          inference.repeatPenalty === 1 && inference.presencePenalty === 0
            ? false
            : {
                penalty: inference.repeatPenalty,
                lastTokens: inference.repeatLastTokens,
                presencePenalty: inference.presencePenalty,
              },
        onTextChunk: onToken,
        signal,
        stopOnAbortSignal: true,
      });
    } finally {
      await sequence.dispose();
    }
  };
}

/** 모델을 올려 Generate와 토큰 세기를 준다. 다 쓰면 dispose한다 */
export async function openModel(llama: Llama, model: Model, inference: Inference, dir?: string) {
  const loaded = await llama.loadModel({ modelPath: join(modelsDir(dir), model.fileName) });
  const context = await loaded.createContext({ contextSize: INFERENCE.contextSize });
  // 추론 모드를 끈다(PRD 6장). Qwen 래퍼는 빈 think 블록을 프롬프트에 넣는다. budgets로 끄면 문법이 고른 첫 토큰이
  // think 구간에 들어가 사라진다
  const chatWrapper = resolveChatWrapper(loaded, {
    customWrapperSettings: { qwen: { thoughts: 'discourage' } },
  });
  return {
    generate: llamaGenerate(llama, context, chatWrapper, inference),
    countTokens: (text: string) => loaded.tokenize(text).length,
    dispose: async () => {
      await context.dispose();
      await loaded.dispose();
    },
  };
}
