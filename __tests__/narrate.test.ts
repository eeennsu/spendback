import { sampleFacts, sampleNames } from '../jest/facts';
import { fakeGenerate } from '../src/retro/fake';
import { NarratorError, type Sentence, narrate, renderOutput } from '../src/retro/narrate';

const output = (insight: string) =>
  JSON.stringify({
    headline: '{category.3.name} 지출이 {category.3.change_phrase}.',
    insights: [
      { about: 'category.3', text: insight },
      { about: 'tag.2', text: '{tag.2.name} 태그 지출은 {tag.2.amount}{이었어요/였어요}.' },
    ],
    suggestion: '다음 주에는 배달 전에 꼭 필요한지 생각해 보세요.',
  });

const GOOD = output('{category.3.name}{이/가} 변동비의 {category.3.share}{을/를} 차지했어요.');
/** 문법으로 막을 수 없는 한글 수사 */
const NUMERAL = output('{category.3.name} 지출이 두 배로 늘었어요.');

function run(outputs: Array<string | Error>, facts = sampleFacts, signal?: AbortSignal) {
  const fake = fakeGenerate(outputs);
  const sentences: string[] = [];
  const retries: number[] = [];
  const result = narrate({
    facts,
    names: sampleNames,
    generate: fake.generate,
    signal,
    onSentence: (s: Sentence) => sentences.push(s.rendered),
    onRetry: attempt => {
      retries.push(attempt);
      sentences.length = 0; // 화면처럼 나간 문장을 지운다
    },
  });
  return { result, sentences, retries, calls: fake.calls };
}

test('필드가 완성될 때마다 값을 채운 문장을 순서대로 내보낸다', async () => {
  const { result, sentences, calls } = run([GOOD]);
  expect(await result).toMatchObject({ status: 'done', attempts: 1 });
  expect(sentences).toEqual([
    '배달 지출이 29,000원 늘었어요.',
    '배달이 변동비의 36%를 차지했어요.',
    '충동 태그 지출은 54,000원이었어요.',
    '다음 주에는 배달 전에 꼭 필요한지 생각해 보세요.',
  ]);
  expect(calls[0].grammar).toContain('ins-0');
  expect(calls[0].messages[1].content).toContain('{category.3.name} = 배달');
});

test('사후 검사에 걸리면 생성을 끊고 전체를 다시 만든다', async () => {
  const { result, sentences, retries, calls } = run([NUMERAL, GOOD]);
  expect(await result).toMatchObject({ status: 'done', attempts: 2 });
  expect(retries).toEqual([2]);
  expect(sentences).toHaveLength(4);
  // 시도마다 시드를 바꾼다
  expect(calls.map(c => c.seed)).toEqual([1, 2]);
});

test('재시도 2회까지 실패하면 폴백이다', async () => {
  const { result, calls } = run([NUMERAL]);
  expect(await result).toEqual({ status: 'fallback', reason: 'check-failed' });
  expect(calls).toHaveLength(3);
});

test('끊긴 출력은 다시 만든다', async () => {
  const { result } = run([GOOD.slice(0, -20), GOOD]);
  expect(await result).toMatchObject({ status: 'done', attempts: 2 });
});

test('모델 문제는 원인대로 폴백한다', async () => {
  const noModel = run([new NarratorError('no-model')]);
  expect(await noModel.result).toEqual({ status: 'fallback', reason: 'no-model' });
  expect(noModel.calls).toHaveLength(1);
  expect(await run([new NarratorError('load-failed')]).result).toEqual({
    status: 'fallback',
    reason: 'load-failed',
  });
});

test('생성 중 취소할 수 있다', async () => {
  const controller = new AbortController();
  const { result, sentences } = run([GOOD], sampleFacts, controller.signal);
  await Promise.resolve();
  controller.abort();
  expect(await result).toEqual({ status: 'cancelled' });
  expect(sentences.length).toBeLessThan(4);
});

test('변동비 지출이 3건 미만이면 LLM을 부르지 않는다', async () => {
  const { result, calls } = run([GOOD], { ...sampleFacts, variableCount: 2 });
  expect(await result).toEqual({ status: 'insufficient' });
  expect(calls).toHaveLength(0);
});

test('저장한 회고는 facts 스냅샷으로 채운다', async () => {
  const done = await run([GOOD]).result;
  if (done.status !== 'done') throw new Error(done.status);
  expect(renderOutput(done.keyed, done.output).insights[0]).toBe(
    '배달이 변동비의 36%를 차지했어요.',
  );
});
