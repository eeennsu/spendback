import { Badge, Button, Card, Stack, Text } from '@eeennsu/native';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView } from 'react-native-css/components';

import { getSetting, setSetting } from '../db/settings';
import { formatPercent } from '../domain/format';
import { Files, hasModel, modelPath, partialBytes } from '../native/files';
import { APP_MODELS, type Model } from '../retro/models';
import { mutate, useQuery } from '../state/data';
import { useDownloads } from '../state/downloads';
import { modelFor } from '../state/retro';
import { Meter } from '../ui/Meter';

/** 1GB 아래는 MB로 쓴다(받기 시작할 때 "0.0GB"가 되지 않게) */
const gigabytes = (bytes: number) =>
  bytes < 1024 ** 3 ? `${Math.round(bytes / 1024 ** 2)}MB` : `${(bytes / 1024 ** 3).toFixed(1)}GB`;

const FAILURES = {
  'no-space': '저장 공간이 모자라요. 공간을 비운 뒤 다시 받아 주세요',
  'hash-mismatch': '받은 파일이 손상됐어요. 처음부터 다시 받아요',
  'network': '연결이 끊겼어요. 다시 받으면 받은 곳부터 이어받아요',
  'cancelled': '받기를 멈췄어요. 다시 받으면 받은 곳부터 이어받아요',
} as const;

/**
 * 모델 관리(PRD 4.7, docs/DESIGN.md 4.4). 레지스트리 모델마다 이름·크기·라이선스, 받기·삭제·사용 선택.
 * Hugging Face에서 커밋을 고정한 주소로 받아 SHA-256으로 확인한다. 받는 중에는 진행률과 Wi-Fi 권장 문구를 보인다
 */
export function ModelsScreen() {
  const selected = useQuery('model-setting', db => getSetting(db, 'model'));
  const downloads = useDownloads(state => state.downloads);
  const { start, cancel } = useDownloads();
  // 파일 상태는 네이티브에서 바로 읽는다. 받기·삭제가 끝나면 다시 그린다
  const [, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1);
  const current = modelFor(selected);

  const remove = (model: Model) =>
    Alert.alert(
      '모델 파일을 지울까요?',
      `${model.name} 파일 ${gigabytes(model.sizeBytes)}를 비워요. 다시 쓰려면 다시 받아야 해요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: () => {
            Files.deleteFile(modelPath(model));
            refresh();
          },
        },
      ],
    );

  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-3 px-4 pb-8 pt-1'>
      <Text size='sm' tone='muted'>
        회고 문장을 쓰는 모델이에요. 기기 안에서만 돌고, 받을 때 말고는 인터넷을 쓰지 않아요. 큰
        파일이라 Wi-Fi에서 받기를 권해요
      </Text>
      {APP_MODELS.map(model => {
        const ready = hasModel(model);
        const download = downloads[model.id];
        const partial = ready ? 0 : partialBytes(model);
        const inUse = ready && current.id === model.id;
        return (
          <Card key={model.id} className='gap-3'>
            <Stack direction='row' align='center' justify='between' className='gap-3'>
              <Text heading='2' size='lg' className='flex-1'>
                {model.name}
              </Text>
              {inUse && (
                <Badge variant='primary' size='sm'>
                  사용 중
                </Badge>
              )}
            </Stack>
            <Text size='sm' tone='muted' className='tabular-nums'>
              {`${gigabytes(model.sizeBytes)} · ${model.license}`}
            </Text>
            {download?.status === 'downloading' ? (
              <>
                <Meter
                  label={`${model.name} 받는 중`}
                  valueText={formatPercent(download.received, download.total)}
                  ratio={download.received / download.total}
                />
                <Stack direction='row' align='center' justify='between' className='gap-3'>
                  <Text size='sm' tone='muted' className='tabular-nums'>
                    {`${formatPercent(download.received, download.total)} · ${gigabytes(download.received)} / ${gigabytes(download.total)}`}
                  </Text>
                  <Button
                    label='멈추기'
                    variant='secondary'
                    size='sm'
                    onPress={() => cancel(model)}
                  />
                </Stack>
              </>
            ) : ready ? (
              <Stack direction='row' wrap className='gap-3'>
                {!inUse && (
                  <Button
                    label='이 모델 쓰기'
                    variant='secondary'
                    onPress={() => void mutate(db => setSetting(db, 'model', model.id))}
                  />
                )}
                <Button label='지우기' variant='ghost' onPress={() => remove(model)} />
              </Stack>
            ) : (
              <>
                {download?.status === 'failed' && (
                  // 사용자가 멈춘 것은 오류가 아니라 흐린 글자로 쓴다
                  <Text size='sm' tone={download.failure === 'cancelled' ? 'muted' : 'danger'}>
                    {FAILURES[download.failure]}
                  </Text>
                )}
                {partial > 0 && download?.status !== 'failed' && (
                  <Text size='sm' tone='muted' className='tabular-nums'>
                    {`${formatPercent(partial, model.sizeBytes)} 받았어요. 이어받을 수 있어요`}
                  </Text>
                )}
                <Button
                  label={partial > 0 || download?.status === 'failed' ? '다시 받기' : '받기'}
                  variant='secondary'
                  className='self-start'
                  onPress={() => void start(model).then(refresh)}
                />
              </>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
