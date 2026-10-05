import { render, screen } from '@testing-library/react-native';
import type { EffectCallback } from 'react';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { saveRetrospective } from '../src/db/retrospectives';
import { retrospectives, transactions } from '../src/db/schema';
import { type TransactionInput, addTransaction } from '../src/db/transactions';
import { RetroListScreen } from '../src/screens/RetroListScreen';

/**
 * 회고 목록(PRD 4.6 목록): 맨 위 최근 12개월 변동비 막대, 저장한 회고는 headline, 아직 만들지 않은 끝난 달은 코드가
 * 고른 headline, 기록이 부족한 달, 진행 중인 달. 오늘은 2026-09-24다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useScrollToTop: jest.fn(),
  useFocusEffect: (effect: EffectCallback) => {
    jest.requireActual<typeof import('react')>('react').useEffect(effect);
  },
}));

const expense = (date: string, amount: number): TransactionInput => ({
  type: 'expense',
  amount,
  date,
  categoryId: 1,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: null,
  isFixed: false,
  fixedCostId: null,
});

beforeAll(async () => {
  await registerGlobalCss();
  jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00'), advanceTimers: true });
});

afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  await db.delete(transactions);
  await db.delete(retrospectives);
  // 6월 2건(부족), 7월 30,000원 4건, 8월 46,000원 4건, 9월(진행 중) 1건
  const rows: Array<[string, number]> = [
    ['2026-06-10', 1000],
    ['2026-06-11', 1000],
    ...[0, 1, 2, 3].map((i): [string, number] => [`2026-07-1${i}`, 7500]),
    ...[0, 1, 2, 3].map((i): [string, number] => [`2026-08-1${i}`, 10000 + i * 1000]),
    ['2026-09-02', 5000],
  ];
  for (const [date, amount] of rows) {
    await addTransaction(db, expense(date, amount));
  }
});

test('저장한 회고는 headline을, 아직 만들지 않은 끝난 달은 코드가 고른 headline을 보인다', async () => {
  await saveRetrospective(db, {
    kind: 'monthly',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    facts: { kind: 'monthly', period: '7월', groups: [] },
    output: { headline: '7월은 차분하게 썼어요.', insights: [], suggestion: '' },
    modelId: 'qwen3.5-2b',
    promptVersion: 'v6',
  });
  await render(<RetroListScreen />);

  expect(await screen.findByText('7월은 차분하게 썼어요.')).toBeOnTheScreen();
  // 8월은 모델 없이 폴백과 같은 틀 고르기로 headline을 쓴다. 스크린 리더는 아직 만들지 않은 회고라고 듣는다
  expect(screen.getByText('변동비가 지난달보다 16,000원 늘었어요.')).toBeOnTheScreen();
  expect(screen.getByLabelText(/^8월, 아직 만들지 않았어요, 변동비가/)).toBeOnTheScreen();
  expect(screen.getByText('기록이 부족해요')).toBeOnTheScreen();
  expect(screen.getByText('끝나면 회고를 만들 수 있어요')).toBeOnTheScreen();
  expect(screen.queryByText('아직 만들지 않았어요')).toBeNull();
});

test('맨 위에 최근 12개월 변동비 막대와, 끝난 달의 월평균·가장 많이 쓴 달을 글로 쓴다', async () => {
  await render(<RetroListScreen />);

  expect(await screen.findByText('달마다 쓴 돈')).toBeOnTheScreen();
  // 기록을 시작한 6월부터 끝난 달(6~8월)의 평균. 진행 중인 9월은 빼고, 기록 전 달은 세지 않는다
  expect(screen.getByText('월평균 26,000원 · 가장 많이 쓴 달은 8월, 46,000원')).toBeOnTheScreen();
});
