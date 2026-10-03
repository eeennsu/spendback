import { Button, Card, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';

import { suggestionAccuracy } from '../cards/inbox';
import { cardAppName, watchedApps } from '../cards/parse';
import { getSetting } from '../db/settings';
import { hasModel } from '../native/files';
import { openListenerSettings, useListenerEnabled } from '../state/cards';
import { useQuery } from '../state/data';
import { modelFor } from '../state/retro';
import { ScreenScroll } from '../ui/layout';
import { Prose } from '../ui/prose';

/**
 * 카드 알림(PRD 4.9, docs/DESIGN.md 4.4). 무엇을 읽는지 설명하고 시스템의 알림 접근 화면으로 보낸다. 돌아오면 허용
 * 여부를 다시 읽는다. 아래에 지원하는 카드와 추천을 고치지 않고 저장한 비율을 보인다
 */
export function CardsScreen() {
  const navigation = useNavigation();
  const enabled = useListenerEnabled();
  const data = useQuery('cards', async db => ({
    accuracy: await suggestionAccuracy(db),
    modelId: await getSetting(db, 'model'),
  }));

  const apps = watchedApps(__DEV__);
  const modelReady = data ? hasModel(modelFor(data.modelId)) : true;
  const sources = data
    ? [
        { label: '전에 적은 가맹점', ...data.accuracy.exact },
        { label: '기기 안 모델', ...data.accuracy.llm },
      ].filter(s => s.total > 0)
    : [];

  return (
    <ScreenScroll>
      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          {enabled ? '알림 접근이 켜져 있어요' : '알림 접근이 꺼져 있어요'}
        </Text>
        <Prose>
          카드 앱의 결제 알림을 읽어 홈에 모아 둬요. 확인하고 저장해야 기록이 돼요. 처음 보는
          가맹점은 기기 안 모델이 전에 적은 비슷한 가맹점을 보고 카테고리를 추천해요
        </Prose>
        <Prose size='sm' tone='muted'>
          아래 카드 앱의 알림만 열고 다른 앱의 알림은 읽지 않아요. 알림 내용은 기기 밖으로 나가지
          않아요
        </Prose>
        <Button
          label={enabled ? '알림 접근 설정 열기' : '알림 접근 허용하기'}
          variant={enabled ? 'secondary' : 'primary'}
          className='self-start'
          onPress={openListenerSettings}
        />
        {/* 모델이 없으면 추천이 오지 않는다. 홈의 "카테고리 고르기"가 왜 그런지 여기서 말한다(7차 039) */}
        {!modelReady && (
          <>
            <Prose size='sm' tone='muted'>
              모델이 없어 처음 보는 가맹점은 추천 없이 보여요
            </Prose>
            <Button
              label='모델 관리로 이동'
              variant='secondary'
              className='self-start'
              onPress={() => navigation.navigate('Models')}
            />
          </>
        )}
      </Card>

      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          지원하는 카드
        </Text>
        {apps.length > 0 ? (
          <Stack className='gap-1'>
            {apps.map(app => (
              <Text key={app}>{cardAppName(app)}</Text>
            ))}
          </Stack>
        ) : (
          <Prose size='sm' tone='muted'>
            아직 없어요. 카드사의 알림 형식을 더하면 여기에 보여요
          </Prose>
        )}
      </Card>

      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          추천 정확도
        </Text>
        {sources.length > 0 ? (
          <Stack className='gap-1'>
            {sources.map(s => (
              <Text key={s.label} className='tabular-nums'>
                {`${s.label} · ${s.total}건 중 ${s.accepted}건 그대로 저장`}
              </Text>
            ))}
          </Stack>
        ) : (
          <Prose size='sm' tone='muted'>
            카드 알림으로 저장한 기록이 생기면, 추천을 고치지 않고 저장한 비율을 보여 줘요
          </Prose>
        )}
      </Card>
    </ScreenScroll>
  );
}
