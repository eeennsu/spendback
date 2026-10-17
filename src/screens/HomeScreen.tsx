import { Button, Card, Stack, Text } from '@eeennsu/native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { type ComponentRef, useLayoutEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native-css/components';

import { allBudgets } from '../db/budgets';
import { recentExpenses, transactionsBetween, untaggedExpenses } from '../db/transactions';
import { monthStatus } from '../domain/budget';
import { daysInMonth } from '../domain/date';
import { TAGGING_FROM, leadingEmoji, relativeDate } from '../domain/entry';
import { fixedCostChecklist, installmentRound, paymentDate } from '../domain/fixedCost';
import { formatPercent, formatWon, formatWonFraction } from '../domain/format';
import { useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { useHistoryFilter } from '../state/ui';
import { Meter } from '../ui/Meter';
import { IconButton } from '../ui/chrome';
import { MoneyRow, Row, Section } from '../ui/layout';
import { Prose } from '../ui/prose';
import { CardInboxSection } from './CardInboxSection';

/**
 * 홈(docs/DESIGN.md 4.2). 위에서부터 행동이 필요한 것 → 참고할 것 순서다: 남은 예산과 소비 속도, 이번 달 지출 합계,
 * 기록하지 않은 고정비, 카드 알림, 이유·만족도 고르기, 카테고리 예산, 최근 지출. 오른쪽 아래 "기록"이 입력 시트를 연다
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
    untagged: (await untaggedExpenses(db, TAGGING_FROM)).length,
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
  // 최근 지출의 이모지 칸. 내역과 같이 하나라도 이모지 카테고리면 모든 줄에 둔다
  const glyphs = data.recent.some(
    tx => leadingEmoji(categoryName(tx.categoryId)).emoji !== undefined,
  );

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

        {data.monthTransactions.length > 0 && (
          <MonthTotal
            rows={data.monthTransactions}
            onPress={() => {
              // 내역이 다른 달이나 조건을 보고 있으면 이 카드의 합계와 다르다
              useHistoryFilter.getState().reset();
              navigation.navigate('Tabs', { screen: 'History' });
            }}
          />
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
                    const day = `${Number(paymentDate(item.dayOfMonth, month).slice(8))}일 결제`;
                    // 할부는 금액이 정해져 있어 "예상" 대신 회차를 쓴다(PRD 4.4)
                    const round = installmentRound(item, month);
                    const detail =
                      round === undefined
                        ? `${day} · 예상 ${formatWon(item.amount)}`
                        : `${day} · ${formatWon(item.amount)} · 할부 ${round}/${item.installmentMonths}회차`;
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

        <CardInboxSection today={today} />

        {data.untagged > 0 && (
          // 줄 하나라 카드 위아래 여백을 줄여 숫자 카드보다 가볍게 둔다
          <Card className='py-3'>
            <Row
              chevron
              label={`이유·만족도 고르기, 이유나 만족도가 빈 지출 ${data.untagged}건`}
              onPress={() => navigation.navigate('Tagging')}
            >
              <Stack className='flex-1 gap-1'>
                <Text>이유·만족도 고르기</Text>
                <Prose size='sm' tone='muted' className='tabular-nums'>
                  {`이유나 만족도가 빈 지출 ${data.untagged}건 · 회고에 쓰여요`}
                </Prose>
              </Stack>
            </Row>
          </Card>
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
                  const name = leadingEmoji(categoryName(tx.categoryId));
                  const title = tx.memo || name.rest;
                  // 메모가 없거나 카테고리 이름과 같으면 아랫줄에 카테고리를 다시 쓰지 않는다
                  const meta =
                    title === name.rest
                      ? relativeDate(tx.date, today)
                      : `${name.rest} · ${relativeDate(tx.date, today)}`;
                  return (
                    <MoneyRow
                      key={tx.id}
                      label={`${title}, ${meta}, ${formatWon(tx.amount)}`}
                      onPress={() => navigation.navigate('Entry', { transactionId: tx.id })}
                      glyphs={glyphs}
                      emoji={name.emoji}
                      title={title}
                      amount={formatWon(tx.amount)}
                      meta={meta}
                    />
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

type MonthRow = { type: 'expense' | 'income'; amount: number; isFixed: boolean };

/**
 * 이번 달 지출 합계(DESIGN.md 4.2). 내역 위의 합계와 같은 값이라 고정비를 넣는다. 위 예산의 사용액은 변동비만이라
 * 변동비와 고정비로 나눠 적어 두 숫자가 이어지게 한다. 카드 전체가 이번 달 내역을 여는 버튼이다
 */
function MonthTotal({ rows, onPress }: { rows: MonthRow[]; onPress: () => void }) {
  const sum = (pick: (row: MonthRow) => boolean) =>
    rows.filter(pick).reduce((n, row) => n + row.amount, 0);
  const expense = sum(r => r.type === 'expense');
  const fixed = sum(r => r.type === 'expense' && r.isFixed);
  const income = sum(r => r.type === 'income');
  const detail = [
    ...(fixed > 0 ? [`변동비 ${formatWon(expense - fixed)}`, `고정비 ${formatWon(fixed)}`] : []),
    ...(income > 0 ? [`수입 ${formatWon(income)}`] : []),
  ];
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${[`이번 달 지출 ${formatWon(expense)}`, ...detail].join(', ')}. 내역 보기`}
      onPress={onPress}
      className='rounded-xl active:opacity-80'
    >
      <Card className='gap-1'>
        <Text size='sm' tone='muted'>
          이번 달 지출
        </Text>
        <Text size='xl' className='tabular-nums'>
          {formatWon(expense)}
        </Text>
        {detail.length > 0 && (
          <Text size='sm' tone='muted' className='tabular-nums'>
            {detail.join(' · ')}
          </Text>
        )}
      </Card>
    </Pressable>
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
