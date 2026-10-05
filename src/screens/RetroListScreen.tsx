import { Badge, Chip, Stack, Text } from '@eeennsu/native';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { listRetrospectives } from '../db/retrospectives';
import { expenseDays, firstRecordDate } from '../db/transactions';
import {
  type PeriodKind,
  type PeriodRef,
  isOngoing,
  periodLabel,
  periodsSince,
} from '../domain/periods';
import { MIN_RECORDS, renderOutput } from '../retro/narrate';
import { stopCardSuggestions } from '../state/cards';
import { useQuery, useToday } from '../state/data';
import { Empty, Row } from '../ui/layout';

/** 목록의 한 줄 */
type Item = { period: PeriodRef; label: string; ongoing: boolean; saved: boolean; line: string };

/**
 * 회고 목록(PRD 4.6, docs/DESIGN.md 4.4). 주간/월간 칩, 기간마다 한 줄 상태(저장한 회고의 headline · 아직 만들지
 * 않았어요 · 기록이 부족해요 · 진행 중). 누르면 회고 상세다. 회고 탭으로 오면 홈의 카드 추천을 멈추고 모델을
 * 내린다(PRD 6장). 탭을 옮겨도 홈은 언마운트되지 않고, 입력 시트를 열 때도 blur되므로 홈 쪽에서는 멈추지 않는다
 */
export function RetroListScreen() {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      void stopCardSuggestions();
    }, []),
  );
  const today = useToday();
  const [kind, setKind] = useState<PeriodKind>('weekly');
  // 고른 탭을 다시 누르면 맨 위로 간다
  const list = useRef<FlatList<Item>>(null);
  useScrollToTop(list);
  const data = useQuery(`retros:${kind}:${today}`, async db => ({
    first: await firstRecordDate(db),
    days: await expenseDays(db),
    saved: await listRetrospectives(db, kind),
  }));

  if (!data) return <View className='flex-1 bg-canvas' />;

  const periods = periodsSince(kind, data.first, today).map(period => {
    const variable = data.days.filter(
      d => !d.isFixed && d.date >= period.start && d.date <= period.end,
    ).length;
    const saved = data.saved.find(s => s.periodStart === period.start);
    const ongoing = isOngoing(period, today);
    const line = ongoing
      ? '끝나면 회고를 만들 수 있어요'
      : saved
        ? renderOutput(saved.facts, saved.output).headline
        : variable < MIN_RECORDS
          ? '기록이 부족해요'
          : '아직 만들지 않았어요';
    const item: Item = {
      period,
      label: periodLabel(period, today),
      ongoing,
      saved: saved !== undefined,
      line,
    };
    return item;
  });

  return (
    <FlatList
      ref={list}
      className='flex-1 bg-canvas'
      contentContainerClassName='px-4 pb-6 pt-1'
      data={periods}
      keyExtractor={item => item.period.start}
      ListHeaderComponent={
        <Stack direction='row' className='gap-3 pb-2'>
          <Chip label='주간' selected={kind === 'weekly'} onPress={() => setKind('weekly')} />
          <Chip label='월간' selected={kind === 'monthly'} onPress={() => setKind('monthly')} />
        </Stack>
      }
      ListEmptyComponent={
        <Empty
          title={
            kind === 'weekly'
              ? '한 주가 끝나면 여기에 회고가 생겨요'
              : '한 달이 끝나면 여기에 회고가 생겨요'
          }
          body='지출을 기록해 두면 끝난 기간마다 코드가 지표를 계산하고, 기기 안의 모델이 회고를 엮어요'
        />
      }
      renderItem={({ item }) => (
        <Row
          inset='screen'
          label={`${item.label}, ${item.ongoing ? '진행 중, ' : ''}${item.line}`}
          onPress={() => navigation.navigate('RetroDetail', { kind, start: item.period.start })}
          chevron
        >
          <Stack className='flex-1 gap-1'>
            <Stack direction='row' align='center' className='gap-2'>
              <Text className='tabular-nums'>{item.label}</Text>
              {item.ongoing && (
                // 아직 회고를 만들 수 없는 줄이 목록에서 가장 튀지 않게 회색이다
                <Badge variant='secondary' size='sm'>
                  진행 중
                </Badge>
              )}
            </Stack>
            {/* 저장한 회고는 headline 한 줄을 보이고, 아니면 상태를 흐린 글자로 쓴다 */}
            <RNText
              numberOfLines={1}
              className={
                item.saved ? 'font-sans text-sm text-fg' : 'font-sans text-sm text-fg-muted'
              }
            >
              {item.line}
            </RNText>
          </Stack>
        </Row>
      )}
    />
  );
}
