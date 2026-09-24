import { fireEvent, render, screen } from '@testing-library/react-native';

import App from '../src/App';

test('홈 시안으로 시작하고 칩으로 다른 시안을 연다', async () => {
  await render(<App />);

  expect(screen.getByText('9월 남은 예산')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'DS 확인' }));
  expect(screen.getByText('디자인 시스템 확인')).toBeOnTheScreen();
});
