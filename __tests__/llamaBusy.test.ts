import { initLlama } from 'llama.rn';

import { llamaBusy, llamaNarrator } from '../src/retro/llama';

// 올린 모델 수는 모듈 상태라 다른 테스트가 남긴 모델과 섞이지 않게 파일을 나눴다
jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));

const request = {
  messages: [{ role: 'user' as const, content: 'facts' }],
  grammar: 'root ::= "a"',
  seed: 7,
};

test('모델을 올린 동안 llamaBusy가 참이고, 내리면 거짓이다', async () => {
  jest.mocked(initLlama).mockResolvedValue({
    completion: jest.fn(async () => ({ text: 'a' })),
    stopCompletion: jest.fn(),
    release: jest.fn(async () => {}),
  } as never);
  const { generate, release } = llamaNarrator('/models/qwen.gguf');
  expect(llamaBusy()).toBe(false);
  await generate(request, () => {}, new AbortController().signal);
  expect(llamaBusy()).toBe(true);
  await release();
  expect(llamaBusy()).toBe(false);
});
