import { Button, Card, Stack, Text } from '@eeennsu/native';
import { useState } from 'react';
import { Alert } from 'react-native';
import { View } from 'react-native-css/components';

import {
  type Backup,
  BackupError,
  backupSummary,
  exportBackup,
  importBackup,
  parseBackup,
} from '../db/backup';
import { Files } from '../native/files';
import { mutate, read, useToday } from '../state/data';
import { ScreenScroll } from '../ui/layout';
import { Prose } from '../ui/prose';

/** 가져오기 직전의 데이터 한 벌(PRD 4.8). 잘못 가져왔을 때 한 번 되돌린다 */
const beforeImportPath = () => `${Files.getFilesDir()}/backup/before-import.json`;

/**
 * 백업(PRD 4.8). 내보내기는 JSON 파일을 Android 공유 시트로 보내고, 가져오기는 파일을 골라 전체를 검증한 뒤 한
 * 트랜잭션으로 전체 교체한다. 교체 직전의 데이터는 앱 안에 한 벌 남겨 한 번 되돌릴 수 있다
 */
export function BackupScreen() {
  const today = useToday();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(() => Files.fileSize(beforeImportPath()) > 0);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    try {
      setMessage(await task());
    } catch (error) {
      setMessage(
        error instanceof BackupError ? error.message : '파일을 다루지 못했어요. 다시 시도해 주세요',
      );
    } finally {
      setBusy(false);
    }
  };

  const share = () =>
    run(async () => {
      const backup = await read(db => exportBackup(db));
      const path = `${Files.getCacheDir()}/backup/spendback-${today}.json`;
      await Files.writeTextFile(path, JSON.stringify(backup));
      await Files.shareFile(path, 'application/json', '백업 파일 보내기');
      const { transactions } = backupSummary(backup);
      return `기록 ${transactions}건을 파일로 만들었어요`;
    });

  /** 지금 데이터를 한 벌 남기고 교체한다 */
  const replace = async (backup: Backup) => {
    const current = await read(db => exportBackup(db));
    await Files.writeTextFile(beforeImportPath(), JSON.stringify(current));
    await mutate(db => importBackup(db, backup));
    setCanUndo(true);
  };

  const confirm = (title: string, body: string, action: () => Promise<string>) =>
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', style: 'destructive', onPress: () => void run(action) },
    ]);

  const pick = () =>
    run(async () => {
      const text = await Files.pickTextFile();
      if (text === null) return '';
      const backup = parseBackup(text);
      const { transactions, fixedCosts, retrospectives } = backupSummary(backup);
      confirm(
        '지금 기록을 이 파일로 바꿀까요?',
        `기록 ${transactions}건, 고정비 ${fixedCosts}개, 회고 ${retrospectives}개로 모두 바뀌어요. 지금 데이터는 한 벌 남겨 한 번 되돌릴 수 있어요.`,
        async () => {
          await replace(backup);
          return `기록 ${transactions}건을 가져왔어요`;
        },
      );
      return '';
    });

  const undo = () =>
    confirm(
      '가져오기 전으로 되돌릴까요?',
      '지금 기록이 가져오기 직전의 기록으로 바뀌어요.',
      async () => {
        const backup = parseBackup(await Files.readTextFile(beforeImportPath()));
        await mutate(db => importBackup(db, backup));
        Files.deleteFile(beforeImportPath());
        setCanUndo(false);
        return '가져오기 전으로 되돌렸어요';
      },
    );

  return (
    <ScreenScroll>
      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          내보내기
        </Text>
        <Prose size='sm' tone='muted'>
          거래, 카테고리, 이유 태그, 예산, 고정비 항목, 회고를 JSON 파일 하나로 만들어 공유 시트로
          보내요. 사용 중인 모델 설정과 모델 파일은 넣지 않아요
        </Prose>
        <Button
          label='파일로 보내기'
          variant='secondary'
          disabled={busy}
          onPress={share}
          className='self-start'
        />
      </Card>
      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          가져오기
        </Text>
        <Prose size='sm' tone='muted'>
          백업 파일을 골라 지금 기록을 모두 바꿔요. 합치지 않아요. 파일 전체를 먼저 확인하고, 중간에
          실패하면 지금 기록이 그대로 남아요
        </Prose>
        <Stack direction='row' wrap className='gap-3'>
          <Button label='파일 고르기' variant='danger' disabled={busy} onPress={pick} />
          {canUndo && (
            <Button
              label='가져오기 전으로 되돌리기'
              variant='secondary'
              disabled={busy}
              onPress={undo}
            />
          )}
        </Stack>
      </Card>
      {/* 결과 줄. live region을 늘 두고 안쪽만 바꿔야 처음 결과도 스크린 리더가 읽는다(5차 검증 021) */}
      <View accessibilityLiveRegion='polite' collapsable={false}>
        {message !== '' && (
          <Card>
            <Prose>{message}</Prose>
          </Card>
        )}
      </View>
    </ScreenScroll>
  );
}
