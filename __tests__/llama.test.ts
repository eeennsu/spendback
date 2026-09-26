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

test('취소하면 생성을 멈추고, release하면 모델을 내린다', async () => {
  const context = fakeContext([]);
  jest.mocked(initLlama).mockResolvedValue(context as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  const controller = new AbortController();
  const running = generate(request, () => {}, controller.signal);
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  await running;
  expect(context.stopCompletion).toHaveBeenCalled();

  await release();
  expect(context.release).toHaveBeenCalled();
});
