import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { EffectCallback } from 'react';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { addFixedCost } from '../src/db/lists';
import { saveRetrospective } from '../src/db/retrospectives';
import { fixedCosts, retrospectives, transactions } from '../src/db/schema';
import { type TransactionInput, addTransaction } from '../src/db/transactions';
import Files from '../src/native/NativeSpendbackFiles';
import { keyFacts } from '../src/retro/keys';
import { llamaNarrator } from '../src/retro/llama';
import { APP_MODELS } from '../src/retro/models';
import { narrate } from '../src/retro/narrate';
import { RetroDetailScreen } from '../src/screens/RetroDetailScreen';

/**
 * 회고 상세의 상태(PRD 9장 컴포넌트, 4.6): 진행 중, 기록 부족, 모델 없음 폴백(코드가 고른 틀 문장), 생성 중과 취소,
 * 저장본과 카드의 비교 줄, 월간 고정비 미기록 알림. 모델은 가짜 narrator로 바꾼다(PRD 6장 인터페이스).
 * 오늘은 2026-09-24 목요일이다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  // 테스트 화면은 늘 포커스를 받은 것으로 본다
  useFocusEffect: (effect: EffectCallback) => {
    jest.requireActual<typeof import('react')>('react').useEffect(effect);
  },
}));

jest.mock('../src/retro/llama', () => ({ llamaNarrator: jest.fn() }));

// 완료 흐름만 결과를 정해 준다. 나머지 테스트는 실제 narrate가 가짜 narrator를 부른다
jest.mock('../src/retro/narrate', () => {
  const actual = jest.requireActual('../src/retro/narrate');
  return { ...actual, narrate: jest.fn(actual.narrate) };
});

/** 끝나지 않는 생성. 취소하면 그때까지의 출력(없음)으로 끝난다 */
function pendingNarrator() {
  const generate = jest.fn(
    (_request: unknown, _onToken: unknown, signal: AbortSignal) =>
      new Promise<string>(resolve => signal.addEventListener('abort', () => resolve(''))),
  );
  const release = jest.fn(async () => {});
  jest.mocked(llamaNarrator).mockReturnValue({ generate, release });
  return { generate, release };
}

const QWEN = APP_MODELS[0];
const withModel = () =>
  jest
    .mocked(Files.fileSize)
    .mockImplementation(path => (path.endsWith(QWEN.fileName) ? QWEN.sizeBytes : -1));

const FG_BRAND = '#1b64da';

const expense = (overrides: Partial<TransactionInput>): TransactionInput => ({
  type: 'expense',
  amount: 9500,
  date: '2026-09-15',
  categoryId: 1,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: null,
  isFixed: false,
  fixedCostId: null,
  ...overrides,
});

/** 9월 3주(9.14~9.20)에 변동비 기록을 count건 넣는다 */
async function week(count: number) {
  for (let i = 0; i < count; i++) {
    await addTransaction(db, expense({ amount: 10000 + i * 1000, date: `2026-09-${15 + i}` }));
  }
}

async function mount(kind: 'weekly' | 'monthly', start: string) {
  await registerGlobalCss();
  await render(<RetroDetailScreen route={{ params: { kind, start } }} />);
}

/** 9월 3주 저장본. 값은 facts 스냅샷 하나로 채운다 */
const saveWeek = (key: string, value: string, headline: string) =>
  saveRetrospective(db, {
    kind: 'weekly',
    periodStart: '2026-09-14',
    periodEnd: '2026-09-20',
    facts: {
      kind: 'weekly',
      period: '9월 3주',
      groups: [
        {
          id: key.split('.').slice(0, -1).join('.'),
          title: '',
          facts: [{ key, value, kind: 'predicate', note: '' }],
        },
      ],
    },
    output: {
      headline,
      insights: [],
      suggestion: '다음 주에는 지출 전에 꼭 필요한지 생각해 보세요.',
    },
    modelId: QWEN.id,
    promptVersion: 'v5',
  });

/** 헤더의 "다시 만들기"를 누른다. 헤더는 navigation.setOptions로 붙어 화면 밖에 그려진다 */
async function pressRegenerate() {
  const options = mockNavigation.setOptions.mock.calls.at(-1)?.[0];
  const action = options?.headerRight?.();
  expect(action?.props.label).toBe('다시 만들기');
  await act(async () => action.props.onPress());
}

beforeAll(async () => {
  await registerGlobalCss();
  jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00'), advanceTimers: true });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(Files.fileSize).mockReturnValue(-1);
  await db.delete(transactions);
  await db.delete(fixedCosts);
  await db.delete(retrospectives);
});

test('진행 중인 주는 지표만 보이고 회고를 만들지 않는다', async () => {
  await addTransaction(db, expense({ date: '2026-09-22' }));
  await mount('weekly', '2026-09-21');

  expect(await screen.findByText('이번 주가 끝나면 회고를 만들어요')).toBeOnTheScreen();
  expect(screen.getByText('총지출')).toBeOnTheScreen();
  expect(llamaNarrator).not.toHaveBeenCalled();
});

test('변동비 기록이 모자라면 회고를 만들지 않는다', async () => {
  await week(2);
  await mount('weekly', '2026-09-14');

  expect(await screen.findByText('기록이 부족해요')).toBeOnTheScreen();
  expect(llamaNarrator).not.toHaveBeenCalled();
});

test('모델이 없으면 코드가 고른 틀 문장과 폴백 안내, 모델 관리로 가는 버튼을 보인다', async () => {
  await week(4);
  await mount('weekly', '2026-09-14');

  expect(await screen.findByText('모델이 없어 앱이 고른 사실만 보여 줘요')).toBeOnTheScreen();
  // headline은 가장 눈에 띄는 묶음의 틀, insight는 다른 묶음의 틀이다. 제안은 없다(PRD 4.6 폴백)
  expect(screen.getByText('가장 큰 지출은 식비에 쓴 13,000원이었어요.')).toBeOnTheScreen();
  expect(screen.getByText('식비에 쓴 46,000원이 변동비의 100%를 차지했어요.')).toBeOnTheScreen();
  expect(screen.getByText('지출이 없는 날이 2일 있었어요.')).toBeOnTheScreen();
  expect(screen.queryByText(/^다음 주에는/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '모델 관리로 이동' }));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Models');
  expect(llamaNarrator).not.toHaveBeenCalled();
});

test('끝난 주를 처음 열면 만들기 시작하고, 취소하면 모델을 내린다', async () => {
  withModel();
  const narrator = pendingNarrator();
  await week(4);
  await mount('weekly', '2026-09-14');

  expect(await screen.findByText('쓰는 중')).toBeOnTheScreen();
  expect(llamaNarrator).toHaveBeenCalledWith(expect.stringContaining(QWEN.fileName));
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));

  expect(await screen.findByText('만들기를 취소했어요')).toBeOnTheScreen();
  expect(narrator.release).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '회고 만들기' })).toBeOnTheScreen();
});

test('저장본이 있으면 다시 만들지 않고, 코드가 채운 이름과 숫자만 강조한다', async () => {
  withModel();
  await week(4);
  await saveRetrospective(db, {
    kind: 'weekly',
    periodStart: '2026-09-14',
    periodEnd: '2026-09-20',
    facts: {
      kind: 'weekly',
      period: '9월 3주',
      groups: [
        {
          id: 'category.3',
          title: '배달',
          facts: [
            { key: 'category.3.name', value: '배달', kind: 'noun', note: '' },
            {
              key: 'category.3.change_phrase',
              value: '29,000원 늘었어요',
              kind: 'predicate',
              note: '',
            },
          ],
        },
      ],
    },
    output: {
      headline: '{category.3.name} 지출이 지난주보다 {category.3.change_phrase}.',
      insights: [],
      suggestion: '다음 주에는 {category.3.name} 지출 전에 꼭 필요한지 생각해 보세요.',
    },
    modelId: QWEN.id,
    promptVersion: 'v5',
  });
  await mount('weekly', '2026-09-14');

  expect(await screen.findByText('배달 지출이 지난주보다 29,000원 늘었어요.')).toBeOnTheScreen();
  expect(screen.getAllByText('배달')[0]).toHaveStyle({ color: FG_BRAND });
  expect(screen.getByText('29,000원')).toHaveStyle({ color: FG_BRAND });
  // 서술어("늘었어요")는 강조하지 않는다
  expect(screen.queryByText('29,000원 늘었어요')).toBeNull();
  // 회고 문장이 변동비 증감을 말하지 않으면 카드의 비교 줄이 있다
  expect(screen.getByText('지난주와 비교할 기록이 없어요')).toBeOnTheScreen();
  expect(llamaNarrator).not.toHaveBeenCalled();
});

test('회고 문장이 변동비 증감을 말하면 카드의 비교 줄을 뺀다', async () => {
  withModel();
  // 직전 주(9.7~9.13)가 첫 기록일 뒤라 증감을 비교한다
  await addTransaction(db, expense({ date: '2026-09-01' }));
  await addTransaction(db, expense({ amount: 20000, date: '2026-09-08' }));
  await week(4);
  await saveRetrospective(db, {
    kind: 'weekly',
    periodStart: '2026-09-14',
    periodEnd: '2026-09-20',
    facts: {
      kind: 'weekly',
      period: '9월 3주',
      groups: [
        {
          id: 'total',
          title: '총지출',
          facts: [
            {
              key: 'total.change_phrase',
              value: '26,000원 늘었어요',
              kind: 'predicate',
              note: '',
            },
          ],
        },
      ],
    },
    output: {
      headline: '변동비가 지난주보다 {total.change_phrase}.',
      insights: [],
      suggestion: '다음 주에는 지출 전에 꼭 필요한지 생각해 보세요.',
    },
    modelId: QWEN.id,
    promptVersion: 'v5',
  });
  await mount('weekly', '2026-09-14');

  expect(await screen.findByText('변동비가 지난주보다 26,000원 늘었어요.')).toBeOnTheScreen();
  expect(screen.queryByText('변동비가 지난주보다 26,000원 늘었어요')).toBeNull();
});

test('다시 만드는 동안 첫 문장이 오기 전에는 카드의 비교 줄을 직전 판단대로 둔다', async () => {
  withModel();
  pendingNarrator();
  await addTransaction(db, expense({ date: '2026-09-01' }));
  await addTransaction(db, expense({ amount: 20000, date: '2026-09-08' }));
  await week(4);
  await saveWeek(
    'total.change_phrase',
    '26,000원 늘었어요',
    '변동비가 지난주보다 {total.change_phrase}.',
  );
  await mount('weekly', '2026-09-14');
  expect(await screen.findByText('변동비가 지난주보다 26,000원 늘었어요.')).toBeOnTheScreen();

  await pressRegenerate();
  expect(await screen.findByText('쓰는 중')).toBeOnTheScreen();
  // 문장이 아직 없어도 줄이 다시 나오지 않아 카드가 튀지 않는다(6차 031)
  expect(screen.queryByText('변동비가 지난주보다 26,000원 늘었어요')).toBeNull();
});

test('저장본이 있는 기간에서 다시 만들기가 실패하면 저장본을 그대로 보인다', async () => {
  await week(4);
  await saveWeek(
    'category.3.change_phrase',
    '29,000원 늘었어요',
    '배달 지출이 지난주보다 {category.3.change_phrase}.',
  );
  await mount('weekly', '2026-09-14');
  expect(await screen.findByText('배달 지출이 지난주보다 29,000원 늘었어요.')).toBeOnTheScreen();

  // 모델이 없어 폴백으로 끝난다. 덮어쓰기는 성공했을 때만이다(PRD 4.6)
  await pressRegenerate();
  expect(await screen.findByText('다시 만들지 못해 저장한 회고를 보여 줘요')).toBeOnTheScreen();
  expect(screen.getByText('배달 지출이 지난주보다 29,000원 늘었어요.')).toBeOnTheScreen();
  expect(screen.queryByText('모델이 없어 앱이 고른 사실만 보여 줘요')).toBeNull();
  // 다시 만들기는 헤더에만 있고, 카드에는 모델 관리만 둔다(6차 032)
  expect(screen.getByRole('button', { name: '모델 관리로 이동' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '다시 만들기' })).toBeNull();
});

test('월간은 기록하지 않은 고정비를 먼저 알리고, "그대로 만들기"를 누르면 만든다', async () => {
  await addFixedCost(db, {
    name: '휴대폰 요금',
    amount: 55000,
    categoryId: 7,
    dayOfMonth: 21,
    paymentMethod: 'card',
  });
  await db.update(fixedCosts).set({ createdAt: Date.parse('2026-07-01T00:00:00') });
  for (let i = 0; i < 4; i++) {
    await addTransaction(db, expense({ date: `2026-08-${10 + i}` }));
  }
  await mount('monthly', '2026-08-01');

  expect(await screen.findByText('기록하지 않은 고정비가 있어요')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /^휴대폰 요금 기록/ })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '그대로 만들기' }));

  // 모델이 없어 폴백까지 간다
  expect(await screen.findByText('모델이 없어 앱이 고른 사실만 보여 줘요')).toBeOnTheScreen();
});

test('다 만들면 저장하고, 늘 있는 상태 줄(live region)이 쓴 모델을 알린다', async () => {
  withModel();
  pendingNarrator();
  jest.mocked(narrate).mockImplementationOnce(async ({ facts, names }) => ({
    status: 'done',
    keyed: keyFacts(facts, names),
    output: {
      headline: '변동비는 {total.variable}였어요.',
      insights: [],
      suggestion: '다음 주에는 지출 전에 꼭 필요한지 생각해 보세요.',
    },
    attempts: 1,
  }));
  await week(4);
  await mount('weekly', '2026-09-14');

  const status = await screen.findByText('Qwen3.5-2B가 기기 안에서 엮은 회고예요');
  // 상태가 바뀌어도 같은 live region 안에서 글자만 바뀌어야 스크린 리더가 읽는다(DESIGN.md 3.7)
  let node: { props: Record<string, unknown>; parent: unknown } | null = status;
  while (node && node.props.accessibilityLiveRegion === undefined) {
    node = node.parent as typeof node;
  }
  expect(node?.props.accessibilityLiveRegion).toBe('polite');
  expect(node?.props.collapsable).toBe(false);
  expect(screen.getByText('변동비는 46,000원였어요.')).toBeOnTheScreen();
  expect(screen.queryByText('아직 회고가 없어요')).toBeNull();
  expect(await db.select().from(retrospectives)).toHaveLength(1);
});
