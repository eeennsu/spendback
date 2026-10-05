import { testDb } from '../jest/db';
import { findRetrospective, saveRetrospective } from '../src/db/retrospectives';
import { retrospectives } from '../src/db/schema';
import type { Output } from '../src/retro/check';
import type { KeyedFacts } from '../src/retro/keys';

const facts: KeyedFacts = {
  kind: 'monthly',
  period: '9월',
  groups: [
    {
      id: 'category.3',
      title: '카테고리',
      facts: [{ key: 'category.3.name', value: '배달', kind: 'noun', note: '' }],
    },
  ],
};

const output = (headline: string): Output => ({
  headline,
  insights: [
    { about: 'category.3', text: '{category.3.name} 하나' },
    { about: 'category.3', text: '{category.3.name} 둘' },
  ],
  suggestion: '제안',
});

const retro = (headline: string) => ({
  kind: 'monthly' as const,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  facts,
  output: output(headline),
  modelId: 'qwen3.5-2b',
  promptVersion: 'v1',
});

test('저장한 facts 스냅샷과 출력을 그대로 읽는다', async () => {
  const db = testDb();
  await saveRetrospective(db, retro('{category.3.name} 지출이 늘었어요.'));
  const saved = await findRetrospective(db, 'monthly', '2026-09-01');
  expect(saved).toMatchObject({ facts, output: output('{category.3.name} 지출이 늘었어요.') });
  expect(await findRetrospective(db, 'monthly', '2026-08-01')).toBeUndefined();
});

test('같은 기간은 재생성하면 덮어쓴다', async () => {
  const db = testDb();
  await saveRetrospective(db, retro('처음'));
  await saveRetrospective(db, retro('다시'));
  expect((await findRetrospective(db, 'monthly', '2026-09-01'))?.output.headline).toBe('다시');
  expect(await db.$count(retrospectives)).toBe(1);
});
