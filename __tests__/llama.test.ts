import { initLlama } from 'llama.rn';

import { llamaNarrator } from '../src/retro/llama';
import { INFERENCE } from '../src/retro/models';
import { NarratorError } from '../src/retro/narrate';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));

const request = {
  messages: [{ role: 'user' as const, content: 'facts' }],
  grammar: 'root ::= "a"',
  seed: 7,
};

function fakeContext(tokens: string[]) {
  return {
    completion: jest.fn(async (_params: unknown, callback: (data: { token: string }) => void) => {
      tokens.forEach(token => callback({ token }));
      return { text: tokens.join('') };
    }),
    stopCompletion: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
  };
}

beforeEach(() => jest.mocked(initLlama).mockReset());

test('모델이 없으면 no-model을 던진다', async () => {
  const { generate } = llamaNarrator(null);
  await expect(generate(request, () => {}, new AbortController().signal)).rejects.toEqual(
    new NarratorError('no-model'),
  );
});

test('로드에 실패하면 load-failed이고, 다음 시도에서 다시 로드한다', async () => {
  jest.mocked(initLlama).mockRejectedValueOnce(new Error('bad gguf'));
  const { generate } = llamaNarrator('/models/qwen.gguf');
  const error = await generate(request, () => {}, new AbortController().signal).catch(e => e);
  expect(error).toBeInstanceOf(NarratorError);
  expect(error.reason).toBe('load-failed');

  jest.mocked(initLlama).mockResolvedValueOnce(fakeContext(['{}']) as never);
  await expect(generate(request, () => {}, new AbortController().signal)).resolves.toBe('{}');
  expect(initLlama).toHaveBeenCalledTimes(2);
});

test('한 번 올린 모델로 토큰을 흘리고, 설정은 하네스와 같다', async () => {
  const context = fakeContext(['{"head', 'line"']);
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate } = llamaNarrator('/models/qwen.gguf');
  const tokens: string[] = [];
  expect(await generate(request, t => tokens.push(t), new AbortController().signal)).toBe(
    '{"headline"',
  );
  await generate(request, () => {}, new AbortController().signal);

  expect(tokens).toEqual(['{"head', 'line"']);
  expect(initLlama).toHaveBeenCalledTimes(1);
  expect(jest.mocked(initLlama).mock.calls[0][0]).toMatchObject({
    n_ctx: INFERENCE.contextSize,
    n_threads: INFERENCE.threads,
  });
  expect(context.completion.mock.calls[0][0]).toMatchObject({
    grammar: request.grammar,
    seed: 7,
    enable_thinking: false,
    temperature: INFERENCE.temperature,
    penalty_repeat: INFERENCE.repeatPenalty,
  });
  expect(context.completion.mock.calls[0][0]).not.toHaveProperty('ignore_eos');
});

test('요청이 온도를 주면 그 온도로 생성한다(카드 알림의 카테고리 추천)', async () => {
  const context = fakeContext(['배달']);
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate } = llamaNarrator('/models/qwen.gguf');
  await generate({ ...request, temperature: 0 }, () => {}, new AbortController().signal);
  expect(context.completion.mock.calls[0][0]).toMatchObject({ temperature: 0 });
});

/** stopCompletion을 받아야 끝나는 생성 */
function hangingContext() {
  let finish = () => {};
  return {
    completion: jest.fn(
      () =>
        new Promise<{ text: string }>(resolve => {
          finish = () => resolve({ text: '' });
        }),
    ),
    stopCompletion: jest.fn(async () => {
      setTimeout(() => finish(), 0);
    }),
    release: jest.fn(async () => {}),
  };
}

test('취소하면 생성을 멈추고, release하면 모델을 내린다', async () => {
  const context = hangingContext();
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  const controller = new AbortController();
  const running = generate(request, () => {}, controller.signal);
  // 모델이 올라가 생성이 시작된 뒤에 취소한다
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(context.completion).toHaveBeenCalled();
  controller.abort();
  await running;
  expect(context.stopCompletion).toHaveBeenCalled();

  await release();
  expect(context.release).toHaveBeenCalled();
});

test('생성 중에 release하면 생성이 멈춘 뒤에 모델을 내린다', async () => {
  const order: string[] = [];
  let finish = () => {};
  const context = {
    completion: jest.fn(
      () =>
        new Promise<{ text: string }>(resolve => {
          finish = () => {
            order.push('completion 끝');
            resolve({ text: '' });
          };
        }),
    ),
    stopCompletion: jest.fn(async () => {
      order.push('stop');
      // 네이티브는 멈춤 요청을 받고 조금 뒤에 completion을 끝낸다
      setTimeout(() => finish(), 0);
    }),
    release: jest.fn(async () => {
      order.push('release');
    }),
  };
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  const running = generate(request, () => {}, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(context.completion).toHaveBeenCalled();

  await release();
  await running;
  expect(order).toEqual(['stop', 'completion 끝', 'release']);
});

test('로드 중에 취소하면 생성을 시작하지 않는다', async () => {
  const context = fakeContext(['{}']);
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  const controller = new AbortController();
  const running = generate(request, () => {}, controller.signal);
  controller.abort();
  await release();
  expect(await running).toBe('');
  expect(context.completion).not.toHaveBeenCalled();
  expect(context.release).toHaveBeenCalled();
});

test('앞 모델을 내리는 동안 다음 모델은 기다렸다가 올린다', async () => {
  const order: string[] = [];
  let done = () => {};
  const first = {
    ...fakeContext([]),
    release: jest.fn(
      () =>
        new Promise<void>(resolve => {
          done = () => {
            order.push('앞 모델 내림');
            resolve();
          };
        }),
    ),
  };
  jest.mocked(initLlama).mockResolvedValueOnce(first as never);
  const a = llamaNarrator('/models/qwen.gguf');
  await a.generate(request, () => {}, new AbortController().signal);
  const releasing = a.release();

  jest.mocked(initLlama).mockImplementationOnce(async () => {
    order.push('다음 모델 올림');
    return fakeContext(['{}']) as never;
  });
  const b = llamaNarrator('/models/qwen.gguf');
  const next = b.generate(request, () => {}, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  done();
  await releasing;
  await next;
  expect(order).toEqual(['앞 모델 내림', '다음 모델 올림']);
});

test('stopCompletion이 Promise를 돌려주지 않아도(llama.rn JSI) 모델을 내린다', async () => {
  const context = { ...fakeContext([]), stopCompletion: jest.fn(() => undefined) };
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  await generate(request, () => {}, new AbortController().signal);
  await release();
  expect(context.stopCompletion).toHaveBeenCalled();
  expect(context.release).toHaveBeenCalled();
});
