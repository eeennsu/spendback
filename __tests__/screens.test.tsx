import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { registerGlobalCss } from '../jest/css';
import { db } from '../src/db';
import { setBudget } from '../src/db/budgets';
import { addFixedCost } from '../src/db/lists';
import { budgets, fixedCosts, transactions } from '../src/db/schema';
import { type TransactionInput, addTransaction } from '../src/db/transactions';
import { EntrySheet } from '../src/screens/EntrySheet';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useHistoryFilter } from '../src/state/ui';

/**
 * 홈, 입력 시트, 내역(docs/DESIGN.md 4.2~4.4). 앱과 같은 drizzle 드라이버를 Node 내장 SQLite로 잇고(jest/db.ts),
 * 내비게이션은 이동 요청만 받는다. 오늘은 2026-09-24다
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
  // 탭을 다시 누르면 맨 위로 가는 훅. 내비게이터 밖이라 아무 일도 하지 않게 둔다
  useScrollToTop: jest.fn(),
}));

const BRAND = '#206fea';
const BRAND_HOVER = '#1b64da';
/** 글자 빨강은 채움 빨강과 다른 변수다 — 회색 canvas 위에서도 4.5:1(DS 스펙 R26 fg.danger) */
const FG_DANGER = '#c10007';

const expense = (overrides: Partial<TransactionInput>): TransactionInput => ({
  type: 'expense',
  amount: 9500,
  date: '2026-09-24',
  categoryId: 1,
  reasonTagId: null,
  satisfaction: null,
  memo: null,
  paymentMethod: null,
  isFixed: false,
  fixedCostId: null,
  ...overrides,
});

// react-native-css/jest는 테스트마다 등록한 스타일을 비운다. 컴파일 결과는 캐시라 두 번째부터 빠르다
async function mount(ui: ReactElement) {
  await registerGlobalCss();
  await render(ui);
}

beforeAll(async () => {
  // 처음 한 번 Tailwind로 global.css를 컴파일한다. 첫 테스트의 findBy 시간 안에 끝나지 않을 수 있다
  await registerGlobalCss();
  jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00'), advanceTimers: true });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await db.delete(transactions);
  await db.delete(fixedCosts);
  await db.delete(budgets);
});

async function fixedItem() {
  await addFixedCost(db, {
    name: '휴대폰 요금',
    amount: 55000,
    categoryId: 7,
    dayOfMonth: 21,
    paymentMethod: 'card',
  });
  // 9월 1일에 등록했다. 등록 전 결제일은 체크리스트가 보지 않는다(PRD 4.4)
  await db.update(fixedCosts).set({ createdAt: Date.parse('2026-09-01T00:00:00') });
}

describe('홈', () => {
  test('남은 예산, 미기록 고정비, 초과한 카테고리, 최근 지출, 기록 버튼을 보여 준다', async () => {
    await setBudget(db, '2026-09', 1200000, [{ categoryId: 3, amount: 100000 }]);
    await fixedItem();
    await addTransaction(
      db,
      expense({ amount: 118000, categoryId: 3, memo: '야식 치킨', date: '2026-09-20' }),
    );
    await addTransaction(db, expense({ amount: 9500, memo: '점심 순대국' }));
    await mount(<HomeScreen />);

    expect(await screen.findByText('남은 예산')).toBeOnTheScreen();
    expect(screen.getByText('1,072,500원')).toBeOnTheScreen();
    expect(screen.getByText('남은 7일 · 하루 153,214원까지 쓸 수 있어요')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '이번 달 예산 사용률' })).toBeOnTheScreen();
    // 결제일(21일)이 지났는데 기록하지 않은 항목. 같은 이름의 버튼이 여럿이면 구분하지 못한다
    expect(screen.getByRole('button', { name: /^휴대폰 요금 기록/ })).toBeOnTheScreen();
    expect(screen.getByText('18,000원 초과')).toHaveStyle({ color: FG_DANGER });
    expect(screen.getByText('점심 순대국')).toBeOnTheScreen();
    expect(screen.getByText('식비 · 오늘')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '기록' })).toHaveStyle({ backgroundColor: BRAND });
  });

  test('고정비 줄을 누르면 그 항목으로 채운 입력 시트를 연다', async () => {
    await fixedItem();
    await mount(<HomeScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: /^휴대폰 요금 기록/ }));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Entry', {
      fixedCostId: expect.any(Number),
    });
  });

  test('떠 있는 기록 버튼은 누르는 동안 투명해지지 않고 표면색이 진해진다', async () => {
    await mount(<HomeScreen />);

    // 투명도 눌림(DS 기본)은 아래 내용을 비치게 한다(docs/DESIGN.md 3.5)
    await fireEvent(await screen.findByRole('button', { name: '기록' }), 'pressIn');
    expect(screen.getByRole('button', { name: '기록' })).toHaveStyle({
      backgroundColor: BRAND_HOVER,
      opacity: 1,
    });
  });

  test('총예산을 넘으면 금액을 초과액으로 바꾸고 danger로 쓴다', async () => {
    await setBudget(db, '2026-09', 100000, []);
    await addTransaction(db, expense({ amount: 118000 }));
    await mount(<HomeScreen />);

    expect(await screen.findByText('예산')).toBeOnTheScreen();
    expect(screen.getAllByText('18,000원 초과')[0]).toHaveStyle({ color: FG_DANGER });
    expect(screen.getByText('남은 7일 · 지금부터 쓰는 만큼 초과가 늘어요')).toBeOnTheScreen();
    expect(screen.queryByText(/하루 .*원까지/)).toBeNull();
  });

  test('첫 실행에는 예산을 정하라는 안내와 동작이 있다', async () => {
    await mount(<HomeScreen />);

    expect(await screen.findByText('아직 예산이 없어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '예산 정하기' }));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Budget');
    expect(screen.getByText(/아직 기록이 없어요/)).toBeOnTheScreen();
  });
});

const entry = (params: { transactionId?: number; fixedCostId?: number } = {}) => (
  // StaticScreenProps의 route는 화면 이름과 키를 갖지만 시트는 params만 읽는다
  <EntrySheet route={{ key: 'entry', name: 'Entry', params } as never} />
);

describe('입력 시트', () => {
  const save = () => screen.getByRole('button', { name: '저장' });
  const chipIn = (label: string, name: string) =>
    within(screen.getByText(label).parent!.parent!).getByRole('button', { name });

  test('금액과 카테고리가 있어야 저장할 수 있고, 안 되는 이유를 live region에 쓴다', async () => {
    await mount(entry());

    expect(await screen.findByText('지출 기록')).toBeOnTheScreen();
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('금액을 입력해 주세요')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('금액'), '12900');
    expect(screen.getByLabelText('금액').props.value).toBe('12,900');
    expect(screen.getByText('카테고리를 골라 주세요')).toBeOnTheScreen();

    await fireEvent.press(chipIn('카테고리', '식비'));
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
    // 저장할 수 있으면 어느 날짜로 저장하는지 쓴다. 키보드에 날짜 칩이 가려져도 보인다(DESIGN.md 4.3)
    expect(screen.getByText('오늘 날짜로 저장해요')).toBeOnTheScreen();

    // 이유 글자를 감싼 조상 중 live region을 찾는다. 평탄화되면 기기에서 사라진다(collapsable)
    await fireEvent.changeText(screen.getByLabelText('금액'), '');
    let node: { props: Record<string, unknown>; parent: unknown } | null =
      screen.getByText('금액을 입력해 주세요');
    while (node && node.props.accessibilityLiveRegion === undefined) {
      node = node.parent as typeof node;
    }
    expect(node?.props.accessibilityLiveRegion).toBe('polite');
    expect(node?.props.collapsable).toBe(false);
    // placeholder는 두지 않는다. 라벨이 칸의 뜻을 말한다(docs/DESIGN.md 4.3)
    expect(screen.getByLabelText('금액').props.placeholder).toBeUndefined();
  });

  test('금액 → 카테고리 → 저장, 세 번에 기록한다', async () => {
    await mount(entry());

    await fireEvent.changeText(await screen.findByLabelText('금액'), '9500');
    await fireEvent.press(chipIn('카테고리', '식비'));
    await fireEvent.press(save());

    const rows = await db.select().from(transactions);
    expect(rows).toMatchObject([
      { type: 'expense', amount: 9500, categoryId: 1, date: '2026-09-24', paymentMethod: null },
    ]);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('선택 항목은 접혀 있다가 펼치면 보이고, 결제수단은 미리 고르지 않는다', async () => {
    await mount(entry());

    await screen.findByText('지출 기록');
    expect(screen.queryByText('만족도')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /선택 항목 더 보기/ }));
    expect(screen.getByText('만족도')).toBeOnTheScreen();
    for (const method of ['카드', '현금', '계좌이체']) {
      expect(screen.getByRole('button', { name: method }).props.accessibilityState).toMatchObject({
        selected: false,
      });
    }
  });

  test('수입으로 바꾸면 수입 카테고리만 남고 지출 전용 항목이 사라진다', async () => {
    await mount(entry());

    await fireEvent.press(await screen.findByRole('button', { name: /선택 항목 더 보기/ }));
    await fireEvent.press(screen.getByRole('button', { name: '수입' }));

    expect(screen.getByText('수입 기록')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '급여' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '배달' })).toBeNull();
    expect(screen.queryByText('만족도')).toBeNull();
  });

  test('선택 칩은 다시 누르면 선택이 풀린다', async () => {
    await mount(entry());

    await fireEvent.press(await screen.findByRole('button', { name: /선택 항목 더 보기/ }));
    const regret = () => screen.getByRole('button', { name: '후회' });
    await fireEvent.press(regret());
    expect(regret().props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(regret());
    expect(regret().props.accessibilityState).toMatchObject({ selected: false });
  });

  test('고정비를 켜면 연결할 항목 칩이 나오고, 줄 전체가 스위치다', async () => {
    await fixedItem();
    await mount(entry());

    await fireEvent.press(await screen.findByRole('button', { name: /선택 항목 더 보기/ }));
    expect(screen.queryByText('연결할 고정비 항목')).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: '고정비' }));
    expect(screen.getByRole('switch', { name: '고정비' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('연결할 고정비 항목')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '휴대폰 요금' })).toBeOnTheScreen();
  });

  test('홈 고정비 줄에서 열면 항목으로 채워 연다(PRD 4.4)', async () => {
    await fixedItem();
    const [item] = await db.select().from(fixedCosts);
    await mount(entry({ fixedCostId: item.id }));

    expect(await screen.findByText('휴대폰 요금 기록')).toBeOnTheScreen();
    expect(screen.getByLabelText('금액').props.value).toBe('55,000');
    expect(chipIn('날짜', '9월 21일').props.accessibilityState).toMatchObject({ selected: true });
    // 선택 항목에 값이 있으면 접힌 줄이 항목 이름 대신 값을 보인다(DESIGN.md 4.3)
    expect(screen.getByText('휴대폰 요금 · 카드 · 고정비 연결')).toBeOnTheScreen();

    await fireEvent.press(save());
    expect(await db.select().from(transactions)).toMatchObject([
      { amount: 55000, categoryId: 7, date: '2026-09-21', isFixed: true, fixedCostId: item.id },
    ]);
  });

  test('수정 모드는 기존 값으로 열고 지울 수 있다', async () => {
    const id = await addTransaction(
      db,
      expense({ amount: 4500, categoryId: 2, memo: '편의점 커피' }),
    );
    await mount(entry({ transactionId: id }));

    expect(await screen.findByText('지출 수정')).toBeOnTheScreen();
    expect(screen.getByLabelText('금액').props.value).toBe('4,500');
    // 삭제는 선택 항목을 펼치지 않아도 있다
    expect(screen.getByRole('button', { name: '삭제' })).toBeOnTheScreen();
  });
});

describe('내역', () => {
  beforeEach(() => useHistoryFilter.getState().reset());

  test('이번 달이 비었으면 필터 결과가 아니라 달의 빈 상태와 지난 달 보기를 보인다', async () => {
    await addTransaction(db, expense({ memo: '점심 순대국', date: '2026-08-20' }));
    await mount(<HistoryScreen />);

    expect(await screen.findByText('9월에는 아직 기록이 없어요')).toBeOnTheScreen();
    expect(screen.queryByText('조건에 맞는 기록이 없어요')).toBeNull();
    expect(screen.getByRole('button', { name: '기록하기' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '지난 달 보기' }));
    expect(await screen.findByText('8월 지출 9,500원')).toBeOnTheScreen();
    expect(screen.getByText('점심 순대국')).toBeOnTheScreen();
  });

  test('필터 결과가 비면 필터 초기화를 보인다', async () => {
    await addTransaction(db, expense({ memo: '점심 순대국' }));
    useHistoryFilter
      .getState()
      .apply({ period: 'thisMonth', type: 'income', categoryIds: [], reasonTagIds: [] });
    await mount(<HistoryScreen />);

    expect(await screen.findByText('조건에 맞는 기록이 없어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '필터 초기화' }));
    expect(await screen.findByText('점심 순대국')).toBeOnTheScreen();
  });
});
