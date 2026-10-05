import { render, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { categories, reasonTags } from '../src/db/schema';
import { HistoryFilterSheet } from '../src/screens/HistoryFilterSheet';
import {
  EMPTY_FILTER,
  filterRange,
  isFiltered,
  rangeLabel,
  useHistoryFilter,
} from '../src/state/ui';

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

describe('기간', () => {
  const today = '2026-10-05';

  test('한 달 보기는 비어 있으면 이번 달이고, 올해가 아닌 달은 해를 붙인다', () => {
    expect(filterRange(EMPTY_FILTER, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeLabel(EMPTY_FILTER, today)).toBe('10월');
    const december = { ...EMPTY_FILTER, month: '2025-12' };
    expect(filterRange(december, today)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(rangeLabel(december, today)).toBe('2025년 12월');
  });

  test('달을 옮기는 것은 필터가 아니다. 조건이나 직접 고른 기간만 필터다', () => {
    expect(isFiltered({ ...EMPTY_FILTER, month: '2026-08' })).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, period: 'custom', from: today, to: today })).toBe(true);
    expect(isFiltered({ ...EMPTY_FILTER, type: 'income' })).toBe(true);
  });

  test('초기화(clear)는 조건만 지우고 보던 달을 지킨다. 이번 달로 옮기면 달을 비운다', () => {
    const store = useHistoryFilter.getState();
    store.showMonth('2026-08', today);
    useHistoryFilter.getState().apply({ ...useHistoryFilter.getState().filter, type: 'income' });
    useHistoryFilter.getState().clear();
    expect(useHistoryFilter.getState().filter).toEqual({ ...EMPTY_FILTER, month: '2026-08' });
    useHistoryFilter.getState().showMonth('2026-10', today);
    expect(useHistoryFilter.getState().filter.month).toBeUndefined();
  });
});
