import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { registerGlobalCss } from '../jest/css';
import { testDb } from '../jest/db';
import { db } from '../src/db';
import { type Backup, exportBackup, importBackup, parseBackup } from '../src/db/backup';
import { addTransaction } from '../src/db/transactions';
import Files from '../src/native/NativeSpendbackFiles';
import { BackupScreen } from '../src/screens/BackupScreen';
import { stopCardSuggestions } from '../src/state/cards';

/**
 * 백업 화면의 교체 직전 한 벌과 되돌리기(PRD 4.8 "교체 직전의 데이터는 한 벌 보관해 한 번 되돌릴 수 있다", "도중에
 * 실패하면 기존 데이터가 그대로 남는다"). Files 네이티브 모듈을 메모리 파일 시스템으로 바꾼다. 2026-10-05 릴리스
 * 검수의 탐침에서 옮겼다
 */
jest.mock('../src/db', () => {
  const { testDb: make } = jest.requireActual('../jest/db');
  return { db: make(), runMigrations: jest.fn(async () => undefined) };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

// 홈에서 시작한 카드 추천이 돌고 있으면 옛 카테고리 id를 새 기록의 대기열에 적는다. 바꾸기 전에 멈춰야 한다
jest.mock('../src/state/cards', () => ({
  ...jest.requireActual('../src/state/cards'),
  stopCardSuggestions: jest.fn(async () => {}),
}));

const SNAPSHOT = '/files/backup/before-import.json';
const disk = new Map<string, string>();
let picked: string | null = null;
const files = jest.mocked(Files);

beforeEach(() => {
  jest.clearAllMocks();
  disk.clear();
  files.fileSize.mockImplementation(path => disk.get(path)?.length ?? -1);
  files.writeTextFile.mockImplementation(async (path, content) => {
    disk.set(path, content);
  });
  files.readTextFile.mockImplementation(async path => {
    const content = disk.get(path);
    if (content === undefined) throw new Error('ENOENT');
    return content;
  });
  files.deleteFile.mockImplementation(path => disk.delete(path));
  files.moveFile.mockImplementation((from, to) => {
    const content = disk.get(from);
    if (content === undefined) return false;
    disk.set(to, content);
    disk.delete(from);
    return true;
  });
  files.pickTextFile.mockImplementation(async () => picked);
});

/** 마지막 대화상자의 버튼을 누른다 */
async function press(label: string) {
  const calls = jest.mocked(Alert.alert).mock.calls;
  const buttons = (calls.at(-1)?.[2] ?? []) as AlertButton[];
  const button = buttons.find(b => b.text === label);
  if (!button) throw new Error(`대화상자에 ${label} 버튼이 없다`);
  await act(async () => {
    button.onPress?.();
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

async function tap(label: string) {
  await act(async () => {
    await fireEvent.press(screen.getByText(label));
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

const memos = async () => (await exportBackup(db)).transactions.map(t => t.memo);

/** 기록마다 메모가 다른 백업 파일 */
async function fileWith(list: string[]): Promise<string> {
  const other = testDb();
  for (const memo of list) {
    await addTransaction(other, {
      type: 'expense',
      amount: 9500,
      date: '2026-09-15',
      categoryId: 1,
      reasonTagId: null,
      satisfaction: null,
      memo,
      paymentMethod: null,
      isFixed: false,
      fixedCostId: null,
    });
  }
  return JSON.stringify(await exportBackup(other));
}

/** 파일을 골라 바꾼다 */
async function importFile(text: string) {
  picked = text;
  await tap('파일 고르기');
  await press('바꾸기');
}

beforeEach(async () => {
  jest.spyOn(Alert, 'alert');
  await importBackup(db, parseBackup(await fileWith(['원래 기록'])));
  await registerGlobalCss();
  await render(<BackupScreen />);
});

test('바꾸면 교체 직전 데이터를 한 벌 남기고 한 번 되돌릴 수 있다', async () => {
  await importFile(await fileWith(['잘못 고른 파일']));
  expect(await memos()).toEqual(['잘못 고른 파일']);

  await tap('가져오기 전으로 되돌리기');
  await press('바꾸기');
  expect(await memos()).toEqual(['원래 기록']);
  expect(disk.has(SNAPSHOT)).toBe(false);
});

test('한 벌을 쓰지 못하면 가져오지 않는다', async () => {
  files.writeTextFile.mockRejectedValueOnce(new Error('ENOSPC'));
  await importFile(await fileWith(['새것']));
  expect(await memos()).toEqual(['원래 기록']);
  expect(screen.getByText('파일을 다루지 못했어요. 다시 시도해 주세요')).toBeOnTheScreen();
});

test('넣다가 실패한 가져오기는 앞서 남긴 한 벌을 덮어쓰지 않는다', async () => {
  await importFile(await fileWith(['잘못 고른 파일 A']));

  // 검증은 통과하지만 DB에 넣다가 실패한다(같은 거래 id 둘)
  const broken = JSON.parse(await fileWith(['B1', 'B2'])) as Backup;
  broken.transactions[1].id = broken.transactions[0].id;
  await importFile(JSON.stringify(broken));
  expect(await memos()).toEqual(['잘못 고른 파일 A']);

  await tap('가져오기 전으로 되돌리기');
  await press('바꾸기');
  expect(await memos()).toEqual(['원래 기록']);
});

test('가져오기와 되돌리기는 바꾸기 전에 카드 추천을 멈춘다', async () => {
  await importFile(await fileWith(['새것']));
  expect(stopCardSuggestions).toHaveBeenCalledTimes(1);
  await tap('가져오기 전으로 되돌리기');
  await press('바꾸기');
  expect(stopCardSuggestions).toHaveBeenCalledTimes(2);
});

test('너무 큰 파일을 고르면 백업이 아니라고 알리고 아무것도 바꾸지 않는다', async () => {
  files.pickTextFile.mockRejectedValueOnce(
    Object.assign(new Error('파일이 너무 커요'), { code: 'too-large' }),
  );
  await tap('파일 고르기');
  expect(screen.getByText('백업 파일이 아니에요. 파일이 너무 커요')).toBeOnTheScreen();
  expect(await memos()).toEqual(['원래 기록']);
});
