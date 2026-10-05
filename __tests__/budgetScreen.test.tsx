import { fireEvent, render, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { allBudgets, setBudget } from '../src/db/budgets';
import { budgets, categories } from '../src/db/schema';
import { BudgetScreen } from '../src/screens/BudgetScreen';

/**
 * 예산 화면(PRD 4.3, docs/DESIGN.md 4.4). 숨긴 카테고리에 예산이 남아 있으면 칸을 '숨김'과 함께 보여 비울 수 있게
 * 한다. 칸이 없으면 그 예산은 홈 게이지·합 경고·회고에 계속 쓰이는데 고칠 길이 없다. 오늘은 2026-09-24다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

let delivery = 0;

beforeAll(async () => {
  jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00'), advanceTimers: true });
  const [row] = await db.select().from(categories).where(eq(categories.name, '배달'));
  delivery = row.id;
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  await db.delete(budgets);
  await db.update(categories).set({ hidden: false });
});

async function mount() {
  await registerGlobalCss();
  await render(<BudgetScreen />);
}

test('숨긴 카테고리에 예산이 있으면 숨김 표시와 함께 칸을 보이고, 비워 저장하면 지운다', async () => {
  await setBudget(db, '2026-09', 500000, [{ categoryId: delivery, amount: 100000 }]);
  await db.update(categories).set({ hidden: true }).where(eq(categories.id, delivery));
  await mount();

  const field = await screen.findByLabelText('배달');
  expect(field.props.value).toBe('100,000');
  expect(screen.getByText('숨김')).toBeOnTheScreen();

  await fireEvent.changeText(field, '');
  await fireEvent.press(screen.getByRole('button', { name: '저장' }));
  const [saved] = await allBudgets(db);
  expect(saved.categoryBudgets).toEqual([]);
});

test('예산이 없는 숨긴 카테고리는 칸을 보이지 않는다', async () => {
  await setBudget(db, '2026-09', 500000, []);
  await db.update(categories).set({ hidden: true }).where(eq(categories.id, delivery));
  await mount();

  expect(await screen.findByLabelText('식비')).toBeOnTheScreen();
  expect(screen.queryByLabelText('배달')).toBeNull();
});
