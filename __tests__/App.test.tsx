import { render, screen } from '@testing-library/react-native';

import App from '../src/App';

test('앱 이름을 보여준다', async () => {
  await render(<App />);

  expect(screen.getByText('spendback')).toBeOnTheScreen();
});
