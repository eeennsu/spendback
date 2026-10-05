import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { registerGlobalCss } from '../jest/css';
import Files from '../src/native/NativeSpendbackFiles';
import { APP_MODELS } from '../src/retro/models';
import { ModelsScreen } from '../src/screens/ModelsScreen';

/**
 * 모델 관리(PRD 4.7 "다운로드, 삭제"). 받다 만 파일(.part)도 지울 수 있어야 한다. 릴리스 빌드는 adb로도 지울 수
 * 없어 남는 길이 앱 데이터 삭제뿐이다
 */
jest.mock('../src/db', () => {
  const { testDb } = jest.requireActual('../jest/db');
  return { db: testDb(), runMigrations: jest.fn(async () => undefined) };
});

const qwen = APP_MODELS[0];
const disk = new Map<string, number>();

beforeEach(() => {
  disk.clear();
  jest.mocked(Files.fileSize).mockImplementation(path => disk.get(path) ?? -1);
  jest.mocked(Files.deleteFile).mockImplementation(path => {
    disk.delete(`${path}.part`);
    return disk.delete(path);
  });
  jest.spyOn(Alert, 'alert');
});

test('받다 만 파일을 지울 수 있다', async () => {
  disk.set(`/files/models/${qwen.fileName}.part`, Math.round(qwen.sizeBytes * 0.41));
  await registerGlobalCss();
  await render(<ModelsScreen />);
  expect(await screen.findByText('41% 받았어요. 이어받을 수 있어요')).toBeOnTheScreen();

  await fireEvent.press(screen.getAllByRole('button', { name: '지우기' })[0]);
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => buttons.find(b => b.text === '지우기')?.onPress?.());

  expect(Files.deleteFile).toHaveBeenCalledWith(`/files/models/${qwen.fileName}`);
  expect(screen.queryByText('41% 받았어요. 이어받을 수 있어요')).toBeNull();
});
