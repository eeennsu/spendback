import { fireEvent, render, screen } from '@testing-library/react-native';
import { NativeModules, useColorScheme } from 'react-native';

import App from '../src/App';

/** StatusBar는 다음 틱에 네이티브 모듈로 스타일을 보낸다 */
async function lastBarStyle() {
  await new Promise(resolve => setImmediate(resolve));
  const setStyle = NativeModules.StatusBarManager.setStyle as jest.Mock;
  return setStyle.mock.lastCall?.[0];
}

test('홈 시안으로 시작하고 칩으로 다른 시안을 연다', async () => {
  await render(<App />);

  expect(screen.getByText('9월 남은 예산')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'DS 확인' }));
  expect(screen.getByText('디자인 시스템 확인')).toBeOnTheScreen();
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
