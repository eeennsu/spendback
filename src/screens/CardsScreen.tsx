import { Button, Card, Stack, Text } from '@eeennsu/native';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { suggestionAccuracy } from '../cards/inbox';
import { cardAppName, watchedApps } from '../cards/parse';
import { isListenerEnabled, openListenerSettings } from '../state/cards';
import { useQuery } from '../state/data';
import { ScreenScroll } from '../ui/layout';
import { Prose } from '../ui/prose';

/**
 * 카드 알림(PRD 4.9, docs/DESIGN.md 4.4). 무엇을 읽는지 설명하고 시스템의 알림 접근 화면으로 보낸다. 돌아오면 허용
 * 여부를 다시 읽는다. 아래에 지원하는 카드와 추천을 고치지 않고 저장한 비율을 보인다
 */
export function CardsScreen() {
  const [enabled, setEnabled] = useState(isListenerEnabled);
  const accuracy = useQuery('cards:accuracy', suggestionAccuracy);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setEnabled(isListenerEnabled());
    });
    return () => subscription.remove();
  }, []);

  const apps = watchedApps(__DEV__);

  return (
    <ScreenScroll>
      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          {enabled ? '알림 접근이 켜져 있어요' : '알림 접근이 꺼져 있어요'}
        </Text>
        <Prose>
          카드 앱의 결제 알림을 읽어 홈에 모아 둬요. 확인하고 저장해야 기록이 돼요. 처음 보는
          가맹점은 기기 안 모델이 전에 적은 비슷한 가맹점을 보고 카테고리를 추천해요.
        </Prose>
        <Prose size='sm' tone='muted'>
          아래 카드 앱의 알림만 열고 다른 앱의 알림은 읽지 않아요. 알림 내용은 기기 밖으로 나가지
          않아요.
        </Prose>
        <Button
          label={enabled ? '알림 접근 설정 열기' : '알림 접근 허용하기'}
          variant={enabled ? 'secondary' : 'primary'}
          className='self-start'
          onPress={openListenerSettings}
        />
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
            아직 없어요. 카드사의 알림 형식을 더하면 여기에 보여요.
          </Prose>
        )}
      </Card>

      <Card className='gap-3'>
        <Text heading='2' size='lg'>
          추천 그대로 저장
        </Text>
        {accuracy && accuracy.exact.total + accuracy.llm.total > 0 ? (
          <Stack className='gap-1'>
            <Text className='tabular-nums'>
              {`전에 적은 가맹점 · ${accuracy.exact.total}건 중 ${accuracy.exact.accepted}건`}
            </Text>
            <Text className='tabular-nums'>
              {`기기 안 모델 · ${accuracy.llm.total}건 중 ${accuracy.llm.accepted}건`}
            </Text>
          </Stack>
        ) : (
          <Prose size='sm' tone='muted'>
            카드 알림으로 저장한 기록이 생기면, 추천을 고치지 않고 저장한 비율을 보여 줘요.
          </Prose>
        )}
      </Card>
    </ScreenScroll>
  );
}
