import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';

import { registerGlobalCss } from '../jest/css';
import { syncInbox } from '../src/cards/inbox';
import { DEV_APP } from '../src/cards/parse';
import { db } from '../src/db';
import { cardInbox, transactions } from '../src/db/schema';
import { type TransactionInput, addTransaction } from '../src/db/transactions';
import Cards from '../src/native/NativeSpendbackCards';
import Files from '../src/native/NativeSpendbackFiles';
import { DEFAULT_MODEL_ID, MODELS } from '../src/retro/models';
import { CardsScreen } from '../src/screens/CardsScreen';
import { EntrySheet } from '../src/screens/EntrySheet';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useDataStore } from '../src/state/data';

/**
 * 카드 알림(PRD 4.9, docs/DESIGN.md 4.2·4.3·4.4): 홈의 대기 목록, 채운 입력 시트, 카드 알림 화면. 오늘은 2026-09-24다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  dispatch: jest.fn(),
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  usePreventRemove: jest.fn(),
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
}));

const POSTED = new Date('2026-09-24T09:00:00').getTime();
/** adb로 흉내 낸 개발용 형식(src/cards/parse.ts) */
const notify = (text: string) =>
  syncInbox(db, [{ app: DEV_APP, title: '테스트카드', text, postedAt: POSTED }], POSTED);

const expense = (overrides: Partial<TransactionInput>): TransactionInput => ({
  type: 'expense',
  amount: 4500,
  date: '2026-09-20',
  categoryId: 2,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: 'card',
  isFixed: false,
  fixedCostId: null,
  ...overrides,
});

async function mount(ui: ReactElement) {
  await registerGlobalCss();
  await render(ui);
}

/** Alert.alert의 버튼 중 하나를 누른다 */
function answerAlert(text: string) {
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons) => {
    (buttons as AlertButton[]).find(b => b.text === text)?.onPress?.();
  });
}

const entry = (params: { inboxId?: number } = {}) => (
  <EntrySheet route={{ key: 'entry', name: 'Entry', params } as never} />
);

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
  await db.delete(cardInbox);
  await db.delete(transactions);
});

describe('홈의 카드 알림', () => {
  test('가맹점, 금액, 추천을 보이고 누르면 그 알림으로 입력 시트를 연다', async () => {
    await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    await notify('승인 4,500원 09/24 08:50 스타벅스 역삼점');
    await mount(<HomeScreen />);

    const section = (await screen.findByText('카드 알림')).parent!.parent!;
    expect(within(section).getByText('1건')).toBeOnTheScreen();
    const row = within(section).getByRole('button', { name: /^스타벅스 역삼점/ });
    expect(within(row).getByText('카페·간식 추천 · 오늘')).toBeOnTheScreen();
    expect(within(row).getByText('4,500원')).toBeOnTheScreen();

    await fireEvent.press(row);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Entry', { inboxId: expect.any(Number) });
  });

  test('모델이 없으면 처음 보는 가맹점은 카테고리 고르기다', async () => {
    await notify('승인 20,000원 09/24 19:00 교촌치킨');
    await mount(<HomeScreen />);
    expect(await screen.findByText('카테고리 고르기 · 오늘')).toBeOnTheScreen();
  });

  test('모델이 있으면 처음 보는 가맹점은 추천 준비 중이다', async () => {
    const model = MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
    jest.mocked(Files.fileSize).mockReturnValue(model.sizeBytes);
    await notify('승인 20,000원 09/24 19:00 교촌치킨');
    await mount(<HomeScreen />);
    expect(await screen.findByText('추천 준비 중 · 오늘')).toBeOnTheScreen();
  });

  test('같은 날 같은 금액을 직접 적었으면 이미 기록했을 수 있다고 알린다', async () => {
    await addTransaction(db, expense({ date: '2026-09-24', memo: '커피' }));
    await notify('승인 4,500원 09/24 08:50 스타벅스 역삼점');
    await mount(<HomeScreen />);

    expect(await screen.findByText(/이미 기록했을 수 있어요/)).toBeOnTheScreen();
  });

  test('취소가 저장한 거래와 짝이 맞으면 지울지 묻고, 지우면 거래가 사라진다', async () => {
    await addTransaction(db, expense({ merchant: '스타벅스 역삼점', memo: '커피' }));
    await notify('취소 4,500원 09/24 09:00 스타벅스 역삼점');
    await mount(<HomeScreen />);

    const row = await screen.findByRole('button', { name: /^결제 취소 · 스타벅스 역삼점/ });
    expect(within(row).getByText('9월 20일 기록을 지울까요?')).toBeOnTheScreen();
    answerAlert('지우기');
    await fireEvent.press(row);
    expect(await db.select().from(transactions)).toEqual([]);
  });

  test('읽지 못한 알림은 원문과 함께 보이고 넘길 수 있다', async () => {
    await notify('이번 달 결제 예정 금액을 확인하세요');
    await mount(<HomeScreen />);

    const row = await screen.findByRole('button', { name: /^읽지 못한 알림/ });
    expect(within(row).getByText('이번 달 결제 예정 금액을 확인하세요')).toBeOnTheScreen();
    answerAlert('넘기기');
    await fireEvent.press(row);
    expect(await db.select().from(cardInbox)).toMatchObject([{ status: 'dismissed' }]);
  });
});

describe('카드 알림에서 연 입력 시트', () => {
  const save = () => screen.getByRole('button', { name: '저장' });

  test('알림 값으로 채우고 추천 카테고리를 고른 채 열고, 저장하면 가맹점과 추천을 남긴다', async () => {
    await addTransaction(db, expense({ merchant: '스타벅스 역삼점' }));
    await notify('승인 4,500원 09/23 08:50 스타벅스 역삼점');
    const [item] = await db.select().from(cardInbox);
    await mount(entry({ inboxId: item.id }));

    expect(await screen.findByText('카드 결제 기록')).toBeOnTheScreen();
    expect(screen.getByLabelText('금액').props.value).toBe('4,500');
    expect(
      screen.getByRole('button', { name: '카페·간식' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: '어제' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByText('전에 이 가맹점을 카페·간식에 적었어요')).toBeOnTheScreen();
    // 메모와 결제수단은 선택 항목 안에 있어 접힌 줄이 값을 보인다
    expect(screen.getByText('스타벅스 역삼점 · 카드')).toBeOnTheScreen();

    await fireEvent.press(save());
    const rows = await db.select().from(transactions);
    expect(rows[1]).toMatchObject({
      amount: 4500,
      date: '2026-09-23',
      categoryId: 2,
      memo: '스타벅스 역삼점',
      paymentMethod: 'card',
      merchant: '스타벅스 역삼점',
      suggestedCategoryId: 2,
      suggestionSource: 'exact',
    });
    expect(await db.select().from(cardInbox)).toMatchObject([{ status: 'done' }]);
  });

  test('기기 안 모델의 추천이면 확인해 달라고 쓴다', async () => {
    await notify('승인 20,000원 09/24 19:00 교촌치킨');
    await db
      .update(cardInbox)
      .set({ suggestedCategoryId: 3, suggestionSource: 'llm', suggestedAt: 1 });
    const [item] = await db.select().from(cardInbox);
    await mount(entry({ inboxId: item.id }));

    expect(
      await screen.findByText('배달은 기기 안 모델의 추천이에요. 맞는지 확인해 주세요'),
    ).toBeOnTheScreen();
  });

  test('시트를 연 뒤에 추천이 오면 아직 고르지 않은 카테고리에 추천을 고른다', async () => {
    await notify('승인 20,000원 09/24 19:00 교촌치킨');
    const [item] = await db.select().from(cardInbox);
    await mount(entry({ inboxId: item.id }));
    const delivery = () => screen.getByRole('button', { name: '배달' });
    expect(
      (await screen.findByRole('button', { name: '배달' })).props.accessibilityState,
    ).toMatchObject({
      selected: false,
    });

    await db
      .update(cardInbox)
      .set({ suggestedCategoryId: 3, suggestionSource: 'llm', suggestedAt: 1 });
    await act(() => useDataStore.getState().bump());
    expect(await screen.findByText(/기기 안 모델의 추천이에요/)).toBeOnTheScreen();
    expect(delivery().props.accessibilityState).toMatchObject({ selected: true });
  });

  test('기록 안 함을 누르면 거래 없이 항목을 치운다', async () => {
    await notify('승인 20,000원 09/24 19:00 교촌치킨');
    const [item] = await db.select().from(cardInbox);
    await mount(entry({ inboxId: item.id }));

    await fireEvent.press(await screen.findByRole('button', { name: '기록 안 함' }));
    expect(await db.select().from(transactions)).toEqual([]);
    expect(await db.select().from(cardInbox)).toMatchObject([{ status: 'dismissed' }]);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});

describe('카드 알림 화면', () => {
  test('알림 접근이 꺼져 있으면 허용 버튼이 시스템 설정을 연다', async () => {
    await mount(<CardsScreen />);

    expect(await screen.findByText('알림 접근이 꺼져 있어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '알림 접근 허용하기' }));
    expect(Cards.openListenerSettings).toHaveBeenCalled();
  });

  test('추천을 고치지 않고 저장한 비율을 보인다', async () => {
    await addTransaction(
      db,
      expense({ merchant: 'a', suggestedCategoryId: 2, suggestionSource: 'exact' }),
    );
    await addTransaction(
      db,
      expense({ merchant: 'b', suggestedCategoryId: 2, suggestionSource: 'llm' }),
    );
    await addTransaction(
      db,
      expense({ merchant: 'c', categoryId: 1, suggestedCategoryId: 3, suggestionSource: 'llm' }),
    );
    await mount(<CardsScreen />);

    expect(await screen.findByText('전에 적은 가맹점 · 1건 중 1건')).toBeOnTheScreen();
    expect(screen.getByText('기기 안 모델 · 2건 중 1건')).toBeOnTheScreen();
  });
});
