import { render, screen } from '@testing-library/react-native';

import App from '../src/App';

test('디자인 시스템 확인 화면을 띄운다', async () => {
  await render(<App />);

  expect(screen.getByText('디자인 시스템 확인')).toBeOnTheScreen();
});
