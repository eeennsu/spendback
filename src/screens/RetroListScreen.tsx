import { Badge, Stack, Text } from '@eeennsu/native';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { useCallback, useRef } from 'react';
import { FlatList } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { allBudgets } from '../db/budgets';
import { listRetrospectives } from '../db/retrospectives';
import { firstRecordDate, transactionsBetween } from '../db/transactions';
import { computeFacts } from '../domain/facts';
import { formatWon } from '../domain/format';
import { monthlyVariable } from '../domain/monthly';
import {
  type PeriodKind,
  type PeriodRef,
  isOngoing,
  periodLabel,
  periodsSince,
  previousStart,
} from '../domain/periods';
import { isVariableExpense } from '../domain/types';
import { followTarget } from '../retro/follow';
import { pickFrames } from '../retro/frames';
import { factValues, keyFacts } from '../retro/keys';
import { MIN_RECORDS, renderOutput } from '../retro/narrate';
import { render } from '../retro/render';
import { stopCardSuggestions } from '../state/cards';
import { useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { MonthlyBars } from '../ui/charts';
import { Empty, Row, Section } from '../ui/layout';

/** 목록의 한 줄. picked는 아직 만들지 않은 달에 코드가 고른 headline이다 */
type Item = {
  period: PeriodRef;
  label: string;
  ongoing: boolean;
  saved: boolean;
  picked: boolean;
  line: string;
};

/** 맨 위 막대의 달 수 */
const MONTHS = 12;

/**
 * 회고 목록(PRD 4.6 목록, docs/DESIGN.md 4.4). 맨 위에 최근 12개월 변동비 막대, 그 아래 달마다 한 줄 상태(저장한
 * 회고의 headline · 아직 만들지 않은 달은 코드가 고른 headline · 기록이 부족해요 · 진행 중). 코드가 고르는 headline은
 * 폴백과 같은 틀 고르기라 모델 없이 바로 나온다. 누르면 회고 상세다. 회고 탭으로 오면 홈의 카드 추천을 멈추고 모델을
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
  const kind: PeriodKind = 'monthly';
  // 고른 탭을 다시 누르면 맨 위로 간다
  const list = useRef<FlatList<Item>>(null);
  useScrollToTop(list);
  const lists = useLists();
  const data = useQuery(`retros:${kind}:${today}`, async db => {
    const first = await firstRecordDate(db);
    return {
      first,
      transactions: first ? await transactionsBetween(db, first, today) : [],
      budgets: await allBudgets(db),
      saved: await listRetrospectives(db, kind),
    };
  });

  if (!data || !lists) return <View className='flex-1 bg-canvas' />;

  const savedOf = (start: string) => data.saved.find(s => s.periodStart === start);
  /** 아직 만들지 않은 달의 headline. 회고 상세의 폴백과 같은 facts와 틀 고르기다 */
  const pickedHeadline = (period: PeriodRef) => {
    const facts = computeFacts({
      period,
      transactions: data.transactions,
      firstRecordDate: data.first,
      budgets: data.budgets,
      categories: lists.categories,
      follow: followTarget(savedOf(previousStart(kind, period.start))),
    });
    const keyed = keyFacts(facts, lists.names);
    const picked = pickFrames(keyed);
    return picked && render(picked.headline, factValues(keyed));
  };

  const periods = periodsSince(kind, data.first, today).map(period => {
    const variable = data.transactions.filter(
      tx => isVariableExpense(tx) && tx.date >= period.start && tx.date <= period.end,
    ).length;
    const saved = savedOf(period.start);
    const ongoing = isOngoing(period, today);
    const picked =
      !ongoing && !saved && variable >= MIN_RECORDS ? pickedHeadline(period) : undefined;
    const line = ongoing
      ? '끝나면 회고를 만들 수 있어요'
      : saved
        ? renderOutput(saved.facts, saved.output).headline
        : variable < MIN_RECORDS
          ? '기록이 부족해요'
          : (picked ?? '아직 만들지 않았어요');
    const item: Item = {
      period,
      label: periodLabel(period, today),
      ongoing,
      saved: saved !== undefined,
      picked: picked !== undefined,
      line,
    };
    return item;
  });

  // 막대: 진행 중인 달까지 12개월. 평균과 가장 많이 쓴 달은 기록을 시작한 뒤의 끝난 달로 낸다
  const months = monthlyVariable(data.transactions, today, MONTHS);
  const thisMonth = today.slice(0, 7);
  const ended = months.filter(
    m => m.month !== thisMonth && data.first !== undefined && m.month >= data.first.slice(0, 7),
  );
  const top = ended.reduce<(typeof ended)[number] | undefined>(
    (best, m) => (!best || m.amount > best.amount ? m : best),
    undefined,
  );
  const average = ended.length
    ? Math.floor(ended.reduce((sum, m) => sum + m.amount, 0) / ended.length)
    : 0;
  const monthName = (month: string) =>
    periodLabel({ kind, start: `${month}-01`, end: `${month}-01` }, today);
  const summary = top
    ? `월평균 ${formatWon(average)} · 가장 많이 쓴 달은 ${monthName(top.month)}, ${formatWon(top.amount)}`
    : '이번 달이 끝나면 달마다 견줘 볼 수 있어요';

  return (
    <FlatList
      ref={list}
      className='flex-1 bg-canvas'
      contentContainerClassName='px-4 pb-6 pt-1'
      data={periods}
      keyExtractor={item => item.period.start}
      ListHeaderComponent={
        periods.length > 0 ? (
          <View className='pb-2'>
            <Section title='달마다 쓴 돈'>
              <MonthlyBars months={months} ongoing={thisMonth} summary={summary} />
            </Section>
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <Empty
          title='한 달이 끝나면 여기에 회고가 생겨요'
          body='지출을 기록해 두면 끝난 기간마다 코드가 지표를 계산하고, 기기 안의 모델이 회고를 엮어요'
        />
      }
      renderItem={({ item }) => (
        <Row
          inset='screen'
          // 코드가 고른 headline은 아직 만들지 않은 회고라고 함께 읽는다
          label={`${item.label}, ${item.ongoing ? '진행 중, ' : ''}${item.picked ? '아직 만들지 않았어요, ' : ''}${item.line}`}
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
            {/* 저장한 회고의 headline은 본문 글자, 코드가 고른 headline과 상태는 흐린 글자다 */}
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
