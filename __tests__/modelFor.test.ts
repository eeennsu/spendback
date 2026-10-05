import Files from '../src/native/NativeSpendbackFiles';
import { APP_MODELS, type Model } from '../src/retro/models';
import { modelFor } from '../src/state/retro';

/**
 * 쓸 모델(PRD 4.7). 설정이 가리키는 모델 파일이 없으면 받아 둔 다른 모델을 쓴다. Kanana만 받고 "이 모델 쓰기"를
 * 누르지 않았거나 쓰던 모델을 지웠을 때 회고와 카드 추천이 "모델 없음"으로 돌지 않게 한다
 */
jest.mock('../src/state/cards', () => ({ stopCardSuggestions: jest.fn() }));

const qwen = APP_MODELS.find(m => m.id === 'qwen3.5-2b')!;
const kanana = APP_MODELS.find(m => m.id === 'kanana-1.5-2.1b')!;

/** 이 모델들만 받아 둔 것으로 한다 */
const downloaded = (...models: Model[]) =>
  jest.mocked(Files.fileSize).mockImplementation(path => {
    const model = models.find(m => path.endsWith(m.fileName));
    return model ? model.sizeBytes : -1;
  });

test('설정이 없으면 받아 둔 모델을 쓴다', () => {
  downloaded(kanana);
  expect(modelFor(undefined).id).toBe(kanana.id);
});

test('설정이 가리키는 모델을 지웠으면 남은 모델을 쓴다', () => {
  downloaded(kanana);
  expect(modelFor(qwen.id).id).toBe(kanana.id);
});

test('설정이 가리키는 모델이 있으면 그것을 쓴다', () => {
  downloaded(qwen, kanana);
  expect(modelFor(kanana.id).id).toBe(kanana.id);
  expect(modelFor(undefined).id).toBe(qwen.id);
});

test('받은 모델이 없으면 설정 모델(없으면 기본 모델)이다', () => {
  downloaded();
  expect(modelFor(kanana.id).id).toBe(kanana.id);
  expect(modelFor(undefined).id).toBe(qwen.id);
});
