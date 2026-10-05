import { NavigationContext } from '@react-navigation/native';
import { render } from '@testing-library/react-native';
import { initLlama } from 'llama.rn';
import type { ReactElement } from 'react';
import { AppState } from 'react-native';

import { registerGlobalCss } from '../jest/css';
import { syncInbox } from '../src/cards/inbox';
import { DEV_APP } from '../src/cards/parse';
import { db } from '../src/db';
import { allCategories } from '../src/db/lists';
import { cardInbox } from '../src/db/schema';
import Files from '../src/native/NativeSpendbackFiles';
import { llamaBusy, llamaNarrator } from '../src/retro/llama';
import { APP_MODELS } from '../src/retro/models';
import { CardInboxSection } from '../src/screens/CardInboxSection';
import { RetroListScreen } from '../src/screens/RetroListScreen';
import { stopCardSuggestions } from '../src/state/cards';

/**
 * 카드 알림 추천의 실행 시점과 모델 수명(PRD 4.9 "처음 보는 가맹점의 추천은 홈이 보이는 동안 한꺼번에 돌리고",
 * 6장 "다 돌았거나, 회고 탭으로 가거나, 앱이 백그라운드로 가면 해제한다. 모델은 한 번에 한 벌만"). 홈의 대기 목록을
 * React Navigation의 진짜 useFocusEffect로 그리고, 포커스는 화면의 navigation 객체로 흉내 낸다. llama.rn은 생성과
 * 해제에 시간이 걸리는 가짜다. 2026-10-05 릴리스 검수의 탐침에서 옮겼다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

// 회고 목록의 "탭을 다시 누르면 맨 위로"는 탭 내비게이터가 있어야 한다. 이 테스트와 상관없다
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useScrollToTop: jest.fn(),
}));

const QWEN = APP_MODELS[0];
const POSTED = new Date('2026-09-24T09:00:00').getTime();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('기다린 조건이 오지 않았다');
    await sleep(2);
  }
}

/** 토큰을 tokens개 내는 동안 tokenMs씩 걸리고, 해제에 releaseMs가 걸리는 컨텍스트 */
function fakeContext({ answer = '', tokens = 1, tokenMs = 2, releaseMs = 0 }) {
  const state = { interrupted: false, produced: 0 };
  return {
    state,
    completion: jest.fn(async (_params: unknown, callback?: (data: { token: string }) => void) => {
      state.interrupted = false;
      let text = '';
      for (let i = 0; i < tokens && !state.interrupted; i++) {
        await sleep(tokenMs);
        const token = i === tokens - 1 ? answer : '';
        text += token;
        state.produced += 1;
        callback?.({ token });
      }
      return { text, interrupted: state.interrupted };
    }),
    stopCompletion: jest.fn(() => {
      state.interrupted = true;
    }),
    release: jest.fn(() => sleep(releaseMs)),
  };
}
type Ctx = ReturnType<typeof fakeContext>;

/** initLlama가 부를 때마다 make()로 새 컨텍스트를 내준다 */
function serve(make: () => Ctx) {
  const made: Ctx[] = [];
  jest.mocked(initLlama).mockImplementation(async () => {
    await sleep(5);
    const ctx = make();
    made.push(ctx);
    return ctx as never;
  });
  return made;
}

/** 늘 포커스를 받은 화면의 navigation 객체 */
const focusedNavigation = () => ({
  navigate: jest.fn(),
  isFocused: () => true,
  addListener: () => () => {},
});

async function mount(ui: ReactElement) {
  await registerGlobalCss();
  return render(
    <NavigationContext.Provider value={focusedNavigation() as never}>
      {ui}
    </NavigationContext.Provider>,
  );
}
const mountHome = () => mount(<CardInboxSection today='2026-09-24' />);

const notify = (text: string) =>
  syncInbox(db, [{ app: DEV_APP, title: '테스트카드', text, postedAt: POSTED }], POSTED);

/** 홈이 AppState에 건 리스너에 앱 상태 바뀜을 알린다 */
function setAppState(state: 'active' | 'background') {
  AppState.currentState = state;
  for (const [type, listener] of jest.mocked(AppState.addEventListener).mock.calls) {
    if (type === 'change') listener(state);
  }
}

let food = '';
let foodId = 0;

beforeAll(async () => {
  const [first] = (await allCategories(db)).filter(c => c.type === 'expense' && !c.hidden);
  food = first.name;
  foodId = first.id;
});

beforeEach(async () => {
  // 추천은 화면 밖에서 비동기로 끝나 act 밖의 갱신 경고가 난다
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(initLlama).mockReset();
  jest.mocked(AppState.addEventListener).mockClear();
  AppState.currentState = 'active';
  jest
    .mocked(Files.fileSize)
    .mockImplementation(path => (path.endsWith(QWEN.fileName) ? QWEN.sizeBytes : -1));
  await db.delete(cardInbox);
  await notify('승인 20,000원 09/24 19:00 교촌치킨');
});

afterEach(async () => {
  await stopCardSuggestions();
  await until(() => !llamaBusy());
  jest.mocked(console.error).mockRestore();
});

test('홈이 보이면 처음 보는 가맹점을 묻고, 다 돌면 모델을 내린다', async () => {
  const made = serve(() => fakeContext({ answer: food }));
  const { unmount } = await mountHome();
  await until(() => made[0]?.release.mock.calls.length === 1 && !llamaBusy());
  const [row] = await db.select().from(cardInbox);
  expect(row.suggestedCategoryId).toBe(foodId);
  expect(initLlama).toHaveBeenCalledTimes(1);
  await unmount();
});

test('추천이 도는 중에 회고 탭으로 가면 멈추고 모델을 내린다', async () => {
  // 끝까지 돌면 5초 걸린다
  const made = serve(() => fakeContext({ answer: food, tokens: 1000, tokenMs: 5 }));
  const home = await mountHome();
  await until(() => made[0]?.state.produced >= 2);
  // bottom-tabs는 홈을 언마운트하지 않는다. 회고 탭의 목록 화면이 포커스를 받는다
  const retro = await mount(<RetroListScreen />);
  await until(() => made[0].release.mock.calls.length === 1, 500);
  expect(made[0].stopCompletion).toHaveBeenCalled();
  await retro.unmount();
  await home.unmount();
});

test('앱이 백그라운드로 가 추천을 멈추면, 백그라운드에 있는 동안 모델을 다시 올리지 않는다', async () => {
  const made = serve(() => fakeContext({ answer: food, tokens: 200, tokenMs: 5 }));
  const { unmount } = await mountHome();
  await until(() => made[0]?.state.produced >= 2);
  // useCardSync가 하는 일: 백그라운드면 stopCardSuggestions
  setAppState('background');
  await stopCardSuggestions();
  await sleep(300);
  expect(initLlama).toHaveBeenCalledTimes(1);
  await unmount();
});

test('백그라운드로 멈춘 추천은 앱이 앞으로 돌아오면 홈이 보이는 동안 다시 돈다', async () => {
  // 처음 배치는 길게 돌다 멈추고, 다시 돌 때는 곧 끝난다
  const made = serve(() =>
    made.length === 0
      ? fakeContext({ answer: food, tokens: 1000, tokenMs: 5, releaseMs: 150 })
      : fakeContext({ answer: food }),
  );
  const { unmount } = await mountHome();
  await until(() => made[0]?.state.produced >= 2);
  setAppState('background');
  await stopCardSuggestions();
  await until(() => !llamaBusy());
  setAppState('active');
  await until(() => made.length === 2 && made[1].release.mock.calls.length === 1);
  const [row] = await db.select().from(cardInbox);
  expect(row.suggestedAt).not.toBeNull();
  await unmount();
});

test('회고 모델을 내리는 중에 홈이 보이면, 내린 뒤에 추천을 돌린다', async () => {
  const made = serve(() => fakeContext({ answer: food, releaseMs: 150 }));
  // 회고 상세에서 생성이 끝나 모델을 내리는 중이다(src/state/retro.ts)
  const retro = llamaNarrator(`/files/models/${QWEN.fileName}`);
  await retro.generate(
    { messages: [{ role: 'user', content: 'facts' }], grammar: 'root ::= "a"', seed: 1 },
    () => {},
    new AbortController().signal,
  );
  void retro.release();
  expect(llamaBusy()).toBe(true);
  const { unmount } = await mountHome();
  await until(() => made.length === 2 && made[1].release.mock.calls.length === 1);
  const [row] = await db.select().from(cardInbox);
  expect(row.suggestedCategoryId).toBe(foodId);
  await unmount();
});

test('모델 로드에 실패하면 홈이 보이는 동안 로드를 되풀이하지 않는다', async () => {
  jest.mocked(initLlama).mockImplementation(async () => {
    await sleep(5);
    throw new Error('failed to load model');
  });
  const { unmount } = await mountHome();
  await sleep(500);
  expect(initLlama).toHaveBeenCalledTimes(1);
  await unmount();
});
