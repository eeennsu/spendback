import { testDb } from '../jest/db';
import { findRetrospective, saveRetrospective } from '../src/db/retrospectives';
import { retrospectives } from '../src/db/schema';
import type { Output } from '../src/retro/check';
import type { KeyedFacts } from '../src/retro/keys';

const facts: KeyedFacts = {
  kind: 'weekly',
  period: '9월 21일~27일',
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

const retro = (headline: string, kind: 'weekly' | 'monthly' = 'weekly') => ({
  kind,
  periodStart: '2026-09-21',
  periodEnd: '2026-09-27',
  facts,
  output: output(headline),
  modelId: 'qwen3.5-2b',
  promptVersion: 'v1',
});

test('저장한 facts 스냅샷과 출력을 그대로 읽는다', async () => {
  const db = testDb();
  await saveRetrospective(db, retro('{category.3.name} 지출이 늘었어요.'));
  const saved = await findRetrospective(db, 'weekly', '2026-09-21');
  expect(saved).toMatchObject({ facts, output: output('{category.3.name} 지출이 늘었어요.') });
  expect(await findRetrospective(db, 'weekly', '2026-09-14')).toBeUndefined();
});

test('같은 기간은 재생성하면 덮어쓴다', async () => {
  const db = testDb();
  await saveRetrospective(db, retro('처음'));
  await saveRetrospective(db, retro('다시'));
  expect((await findRetrospective(db, 'weekly', '2026-09-21'))?.output.headline).toBe('다시');
  expect(await db.$count(retrospectives)).toBe(1);
});

test('주간과 월간은 따로 저장한다', async () => {
  const db = testDb();
  await saveRetrospective(db, retro('주간'));
  await saveRetrospective(db, retro('월간', 'monthly'));
  expect((await findRetrospective(db, 'monthly', '2026-09-21'))?.output.headline).toBe('월간');
  expect((await findRetrospective(db, 'weekly', '2026-09-21'))?.output.headline).toBe('주간');
});
