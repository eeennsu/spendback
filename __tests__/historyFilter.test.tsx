import { render, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { categories, reasonTags } from '../src/db/schema';
import { HistoryFilterSheet } from '../src/screens/HistoryFilterSheet';

/**
 * 내역 필터(PRD 4.5). 숨김은 삭제를 대신하고 지난 기록을 보존하므로(PRD 4.2) 숨긴 카테고리·태그의 지난 기록도
 * 걸러 볼 수 있어야 한다. 숨긴 것은 보이는 것 뒤에 "· 숨김"을 붙여 둔다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
}));

test('숨긴 카테고리와 이유 태그도 칩으로 고를 수 있다', async () => {
  await db.update(categories).set({ hidden: true }).where(eq(categories.name, '배달'));
  const [tag] = await db.select().from(reasonTags);
  await db.update(reasonTags).set({ hidden: true }).where(eq(reasonTags.id, tag.id));
  await registerGlobalCss();
  await render(<HistoryFilterSheet />);

  expect(await screen.findByRole('button', { name: '배달 · 숨김' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${tag.name} · 숨김` })).toBeOnTheScreen();
});
