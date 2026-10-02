import { render, screen } from '@testing-library/react-native';
import { NativeModules, useColorScheme } from 'react-native';

import App from '../src/App';

/**
 * 앱 루트. 마이그레이션 뒤 홈 탭으로 시작하고, 상태 바 아이콘은 색 구성표를 따른다(docs/DESIGN.md 3.5).
 * DB는 Node 내장 SQLite로 잇는다(jest/db.ts)
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

/** StatusBar는 다음 틱에 네이티브 모듈로 스타일을 보낸다 */
async function lastBarStyle() {
  await new Promise(resolve => setImmediate(resolve));
  const setStyle = NativeModules.StatusBarManager.setStyle as jest.Mock;
  return setStyle.mock.lastCall?.[0];
}

test('홈 탭으로 시작하고 탭 바에 홈·내역·회고가 있다', async () => {
  await render(<App />);

  expect(await screen.findByText('아직 예산이 없어요')).toBeOnTheScreen();
  for (const tab of ['홈', '내역', '회고']) {
    expect(screen.getByRole('tab', { name: tab })).toBeOnTheScreen();
  }
  expect(screen.getByRole('tab', { name: '홈' }).props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByRole('button', { name: '설정' })).toBeOnTheScreen();
});

test('상태 바 아이콘은 색 구성표를 따른다 — 라이트 canvas 위에 흰 아이콘이 놓이지 않는다', async () => {
  await render(<App />);
  expect(await lastBarStyle()).toBe('dark-content');

  // RN jest 프리셋은 useColorScheme을 늘 'light'로 모킹한다
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await render(<App />);
  expect(await lastBarStyle()).toBe('light-content');
  jest.mocked(useColorScheme).mockReturnValue('light');
});
