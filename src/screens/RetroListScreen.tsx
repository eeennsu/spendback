import { Badge, Chip, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { FlatList } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { listRetrospectives } from '../db/retrospectives';
import { expenseDays, firstRecordDate } from '../db/transactions';
import { type PeriodKind, isOngoing, periodLabel, periodsSince } from '../domain/periods';
import { MIN_RECORDS } from '../retro/narrate';
import { renderOutput } from '../retro/narrate';
import { useQuery, useToday } from '../state/data';
import { Empty, Row } from '../ui/layout';

/**
 * 회고 목록(PRD 4.6, docs/DESIGN.md 4.4). 주간/월간 칩, 기간마다 한 줄 상태(저장한 회고의 headline · 아직 만들지
 * 않았어요 · 기록이 부족해요 · 진행 중). 누르면 회고 상세다
 */
export function RetroListScreen() {
  const navigation = useNavigation();
  const today = useToday();
  const [kind, setKind] = useState<PeriodKind>('weekly');
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
    return { period, label: periodLabel(period, today), ongoing, saved: saved !== undefined, line };
  });

  return (
    <FlatList
      className='flex-1 bg-canvas'
      contentContainerClassName='gap-1 px-4 pb-6 pt-1'
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
        >
          <Stack className='flex-1 gap-1'>
            <Stack direction='row' align='center' className='gap-2'>
              <Text className='tabular-nums'>{item.label}</Text>
              {item.ongoing && (
                <Badge variant='primary' size='sm'>
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
