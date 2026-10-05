import { type LlamaContext, initLlama } from 'llama.rn';

import { Files } from '../native/files';
import { INFERENCE } from './models';
import { type Generate, type GenerateRequest, NarratorError } from './narrate';

/**
 * 앞 narrator가 모델을 내리는 중이면 다음 로드는 그 뒤에 한다. 다시 만들기를 바로 누르면 2GB 안팎의 모델 두 벌이
 * 한꺼번에 메모리에 오를 수 있어서다
 */
let releasing: Promise<void> = Promise.resolve();

/** 취소한 생성이 끝나지 않았으면 이 간격으로 다시 멈춘다 */
const STOP_RETRY_MS = 50;

/** 올라가 있는 컨텍스트 수. 회고와 카드 알림 추천이 모델 두 벌을 함께 올리지 않게 본다(PRD 6장 실행 정책) */
let contexts = 0;

/** 어떤 narrator가 모델을 올려 두었는가 */
export const llamaBusy = () => contexts > 0;

/** 내리는 중인 모델이 다 내려가면 끝난다. 올려 둔 채인 모델은 기다리지 않는다 */
export const llamaReleased = () => releasing;

/** 지시문을 가르는 짧은 해시(FNV-1a 32비트). 지시문이 바뀌면 다른 세션 파일이다 */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 지시문 세션 파일. 모델과 지시문마다 하나이고 앱 캐시 폴더에 둔다(PRD 6장 실행 정책) */
const sessionFile = (modelPath: string, system: string) =>
  `${Files.getCacheDir()}/llama-${modelPath.split('/').pop()}-${hash(system)}.session`;

/**
 * 시스템 지시문 끝까지 처리한 상태를 세션 파일로 다시 쓴다(PRD 6장 실행 정책). 파일이 있으면 불러오고, 없으면
 * 지시문까지만 처리해 저장한 뒤 그 상태로 되돌린다. 그러면 생성은 지시문 뒤만 처리한다. Qwen3.5(qwen35)는 하이브리드
 * 구조라 상태를 되돌릴 수 없어 지시문 끝에서 정확히 저장해야 한다. 지시문만 처리하며 뽑은 토큰 하나는 상태에 들지 않고
 * 토큰 목록(tokenSize)에서도 뺀다. 불러온 상태가 프롬프트와 맞지 않으면 llama.rn이 처음부터 처리하므로 결과는 같고
 * 느려질 뿐이다. 실패하면 파일을 지우고 넘어간다
 */
async function primeSystem(
  llama: LlamaContext,
  modelPath: string,
  messages: GenerateRequest['messages'],
  signal: AbortSignal,
) {
  const system = messages.find(m => m.role === 'system')?.content;
  if (!system) return;
  const file = sessionFile(modelPath, system);
  try {
    if (Files.fileSize(file) > 0) {
      await llama.loadSession(file);
      return;
    }
    const { prompt } = await llama.getFormattedChat(messages, null, {
      jinja: true,
      enable_thinking: false,
      reasoning_format: 'none',
    });
    const at = prompt.indexOf(system);
    if (at < 0) return;
    const result = await llama.completion({
      prompt: prompt.slice(0, at + system.length),
      n_predict: 1,
      temperature: 0,
    });
    if (signal.aborted) return;
    const part = `${file}.part`;
    await llama.saveSession(part, { tokenSize: result.tokens_evaluated });
    if (!Files.moveFile(part, file)) return;
    await llama.loadSession(file);
  } catch {
    // deleteFile은 .part도 지운다
    Files.deleteFile(file);
  }
}

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
 * @param options.reuseSystem 지시문 처리 결과를 세션 파일로 다시 쓴다(회고). 컨텍스트마다 첫 생성 때 한 번 한다
 */
export function llamaNarrator(modelPath: string | null, options: { reuseSystem?: boolean } = {}) {
  let context: Promise<LlamaContext> | undefined;
  /** 이 컨텍스트에 지시문 세션을 올렸다 */
  let primed = false;
  /** 진행 중인 completion. 실패해도 release를 막지 않게 오류는 삼킨다 */
  let running: Promise<unknown> = Promise.resolve();

  const load = () => {
    if (!modelPath) throw new NarratorError('no-model');
    if (!context) primed = false;
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
      .then(llama => {
        contexts += 1;
        return llama;
      })
      .catch(() => {
        context = undefined;
        throw new NarratorError('load-failed');
      });
    return context;
  };

  const generate: Generate = async (request, onToken, signal) => {
    const { messages, grammar, seed, temperature } = request;
    const llama = await load();
    // 로드하는 동안 취소됐으면 시작하지 않는다. release가 곧 이 컨텍스트를 내린다
    if (signal.aborted) return '';
    // llama.rn 0.12.9의 completion은 채팅 서식을 만든 뒤 생성을 시작하며 중단 표시를 지운다(rewind). 그 사이에 온
    // 취소가 지워지지 않게, 취소하면 생성이 끝날 때까지 되풀이해 멈춘다
    let finished = false;
    const stop = () => {
      if (finished) return;
      void settle(() => llama.stopCompletion());
      setTimeout(stop, STOP_RETRY_MS);
    };
    signal.addEventListener('abort', stop);
    try {
      if (options.reuseSystem && !primed && modelPath) {
        primed = true;
        // 내리기(release)가 이 처리도 기다리게 running에 둔다
        const priming = primeSystem(llama, modelPath, request.messages, signal);
        running = priming;
        await priming;
        if (signal.aborted) return '';
      }
      const completion = llama.completion(
        {
          messages,
          jinja: true,
          enable_thinking: false,
          reasoning_format: 'none',
          grammar,
          seed,
          n_predict: INFERENCE.maxTokens,
          temperature: temperature ?? INFERENCE.temperature,
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
      finished = true;
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
      contexts -= 1;
    })().catch(() => undefined);
    return releasing;
  };

  return { generate, release };
}
