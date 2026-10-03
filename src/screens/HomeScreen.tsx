import { Button, Card, Stack, Text } from '@eeennsu/native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { type ComponentRef, useLayoutEffect, useRef } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native-css/components';

import { allBudgets } from '../db/budgets';
import { recentExpenses, transactionsBetween } from '../db/transactions';
import { monthStatus } from '../domain/budget';
import { daysInMonth } from '../domain/date';
import { relativeDate } from '../domain/entry';
import { fixedCostChecklist, paymentDate } from '../domain/fixedCost';
import { formatPercent, formatWon, formatWonFraction } from '../domain/format';
import { useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { Meter } from '../ui/Meter';
import { IconButton } from '../ui/chrome';
import { Row, Section } from '../ui/layout';
import { Prose } from '../ui/prose';

/**
 * 홈(docs/DESIGN.md 4.2). 위에서부터 행동이 필요한 것 → 참고할 것 순서다: 남은 예산과 소비 속도, 기록하지 않은 고정비,
 * 카테고리 예산, 최근 지출. 오른쪽 아래 "기록"이 입력 시트를 연다
 */
export function HomeScreen() {
  const navigation = useNavigation();
  // 고른 탭을 다시 누르면 맨 위로 간다
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useScrollToTop(scroll);
  const today = useToday();
  const month = today.slice(0, 7);
  const lists = useLists();
  const data = useQuery(`home:${today}`, async db => ({
    budgets: await allBudgets(db),
    monthTransactions: await transactionsBetween(
      db,
      `${month}-01`,
      `${month}-${daysInMonth(month)}`,
    ),
    recent: await recentExpenses(db),
  }));

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${Number(month.slice(5))}월`,
      headerRight: () => (
        <IconButton icon='settings' label='설정' onPress={() => navigation.navigate('Settings')} />
      ),
    });
  }, [navigation, month]);

  if (!data || !lists) return <View className='flex-1 bg-canvas' />;

  const status = monthStatus(data.budgets, data.monthTransactions, today);
  const checklist = fixedCostChecklist(lists.fixedCosts, data.monthTransactions, month, today);
  const categoryName = (id: number) => lists.names.categories.get(id) ?? '카테고리';

  return (
    <View className='flex-1 bg-canvas'>
      <ScrollView ref={scroll} className='flex-1' contentContainerClassName='gap-3 px-4 pb-24 pt-1'>
        {status ? (
          <BudgetHero status={status} onPress={() => navigation.navigate('Budget')} />
        ) : (
          <Card className='gap-3'>
            <Text size='sm' tone='muted'>
              예산
            </Text>
            <Text size='lg'>아직 예산이 없어요</Text>
            <Prose size='sm' tone='muted'>
              예산을 정하면 남은 금액과 쓰는 속도를 여기에 보여 줘요
            </Prose>
            <Button
              label='예산 정하기'
              variant='secondary'
              className='self-start'
              onPress={() => navigation.navigate('Budget')}
            />
          </Card>
        )}

        {checklist.total > 0 && (
          <Section title='고정비' aside={`${checklist.total}개 중 ${checklist.recorded}개 기록`}>
            {checklist.overdue.length === 0 ? (
              <Prose size='sm' tone='muted'>
                {checklist.recorded === checklist.total
                  ? '이번 달 고정비를 모두 기록했어요'
                  : '결제일이 오면 여기에서 알려 줘요'}
              </Prose>
            ) : (
              <>
                <Prose size='sm' tone='muted'>
                  결제일이 오늘이거나 지났는데 아직 기록하지 않았어요
                </Prose>
                <View>
                  {checklist.overdue.map(item => {
                    const detail = `${Number(paymentDate(item.dayOfMonth, month).slice(8))}일 결제 · 예상 ${formatWon(item.amount)}`;
                    return (
                      <Row
                        key={item.id}
                        label={`${item.name} 기록, ${detail}`}
                        onPress={() => navigation.navigate('Entry', { fixedCostId: item.id })}
                      >
                        <Stack className='flex-1 gap-1'>
                          <Text>{item.name}</Text>
                          <Text size='sm' tone='muted' className='tabular-nums'>
                            {detail}
                          </Text>
                        </Stack>
                        <Text size='sm' className='text-fg-brand'>
                          기록
                        </Text>
                      </Row>
                    );
                  })}
                </View>
              </>
            )}
          </Section>
        )}

        {status && status.categories.length > 0 && (
          <Section title='카테고리 예산'>
            <View>
              {status.categories.map(item => {
                const name = categoryName(item.categoryId);
                const over = item.spent > item.budget;
                return (
                  <Row key={item.categoryId} column>
                    <Stack direction='row' justify='between' className='gap-3'>
                      <Text>{name}</Text>
                      <Text
                        size='sm'
                        tone={over ? 'danger' : 'muted'}
                        className='flex-1 text-right tabular-nums'
                      >
                        {over
                          ? `${formatWon(item.spent - item.budget)} 초과`
                          : formatWonFraction(item.spent, item.budget)}
                      </Text>
                    </Stack>
                    <Meter
                      label={`${name} 예산 사용률`}
                      valueText={`${formatPercent(item.spent, item.budget)} 사용, ${formatWonFraction(item.spent, item.budget)}`}
                      ratio={item.spent / item.budget}
                      size='sm'
                    />
                  </Row>
                );
              })}
            </View>
          </Section>
        )}

        <Section title='최근 지출'>
          {data.recent.length === 0 ? (
            <Prose size='sm' tone='muted'>
              아직 기록이 없어요. 오른쪽 아래 기록 버튼으로 첫 지출을 남겨 보세요
            </Prose>
          ) : (
            <>
              <View>
                {data.recent.map(tx => {
                  const title = tx.memo || categoryName(tx.categoryId);
                  // 메모가 없으면 제목이 카테고리라 아랫줄에 다시 쓰지 않는다
                  const meta = tx.memo
                    ? `${categoryName(tx.categoryId)} · ${relativeDate(tx.date, today)}`
                    : relativeDate(tx.date, today);
                  return (
                    <Row
                      key={tx.id}
                      label={`${title}, ${meta}, ${formatWon(tx.amount)}`}
                      onPress={() => navigation.navigate('Entry', { transactionId: tx.id })}
                    >
                      <Stack className='flex-1 gap-1'>
                        <RNText numberOfLines={1} className='font-sans text-md text-fg'>
                          {title}
                        </RNText>
                        <Text size='sm' tone='muted'>
                          {meta}
                        </Text>
                      </Stack>
                      <Text className='tabular-nums'>{formatWon(tx.amount)}</Text>
                    </Row>
                  );
                })}
              </View>
              <Button
                label='내역 전체 보기'
                variant='secondary'
                className='mt-1'
                onPress={() => navigation.navigate('Tabs', { screen: 'History' })}
              />
            </>
          )}
        </Section>
      </ScrollView>
      {/*
        기록은 이 앱의 핵심 동작이라 엄지가 닿는 오른쪽 아래에 둔다(docs/DESIGN.md 3.2).
        떠 있는 버튼이라 투명도 눌림을 쓰면 아래 내용이 비친다. 표면색으로 바꾼다(3.5)
      */}
      <Button
        label='기록'
        icon='plus'
        size='lg'
        onPress={() => navigation.navigate('Entry', {})}
        className='absolute bottom-4 right-4 rounded-full shadow-md active:bg-brand-hover active:opacity-100'
      />
    </View>
  );
}

type Status = NonNullable<ReturnType<typeof monthStatus>>;

/** 남은 예산과 소비 속도. 카드 전체가 예산 화면을 여는 버튼이다(DESIGN.md 4.2) */
function BudgetHero({ status, onPress }: { status: Status; onPress: () => void }) {
  const over = status.remaining < 0;
  const elapsed = formatPercent(status.dayOfMonth, status.monthDays);
  const used = `${formatWon(status.spent)} 사용 · ${formatPercent(status.spent, status.total)}`;
  const pace = over
    ? `남은 ${status.remainingDays}일 · 지금부터 쓰는 만큼 초과가 늘어요`
    : `남은 ${status.remainingDays}일 · 하루 ${formatWon(status.dailyAllowance ?? 0)}까지 쓸 수 있어요`;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${over ? '예산' : '남은 예산'} ${over ? `${formatWon(-status.remaining)} 초과` : formatWon(status.remaining)}, ${pace}. 예산 고치기`}
      onPress={onPress}
      className='rounded-xl active:opacity-80'
    >
      <Card className='gap-3'>
        <Text size='sm' tone='muted'>
          {over ? '예산' : '남은 예산'}
        </Text>
        <Text size='2xl' tone={over ? 'danger' : 'default'} className='tabular-nums'>
          {over ? `${formatWon(-status.remaining)} 초과` : formatWon(status.remaining)}
        </Text>
        <Prose className='tabular-nums'>{pace}</Prose>
        <Meter
          label='이번 달 예산 사용률'
          valueText={`${used}, 예산 ${formatWon(status.total)}, 이번 달 ${elapsed} 지남`}
          ratio={status.spent / status.total}
          marker={status.dayOfMonth / status.monthDays}
        />
        <Stack direction='row' justify='between' wrap className='gap-x-3 gap-y-1'>
          <Text size='sm' tone='muted' className='tabular-nums'>
            {used}
          </Text>
          <Text size='sm' tone='muted' className='tabular-nums'>
            {`예산 ${formatWon(status.total)}`}
          </Text>
        </Stack>
        <Prose size='sm' tone='muted' className='tabular-nums'>
          {`세로선은 오늘이에요 · 이번 달 ${elapsed} 지남`}
        </Prose>
      </Card>
    </Pressable>
  );
}
