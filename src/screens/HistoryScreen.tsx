import { Badge, Button, Chip, Stack, Text } from '@eeennsu/native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { type TransactionRow, filterTransactions, firstRecordDate } from '../db/transactions';
import { addMonths } from '../domain/date';
import {
  categoryShares,
  groupByDate,
  leadingEmoji,
  sectionAmount,
  sectionTitle,
} from '../domain/entry';
import { formatDate, formatPercent, formatWon } from '../domain/format';
import { useQuery, useToday } from '../state/data';
import { paymentLabel, useLists } from '../state/lists';
import {
  filterRange,
  isFiltered,
  monthLabel,
  previousMonth,
  rangeLabel,
  useHistoryFilter,
  viewedMonth,
} from '../state/ui';
import { Donut, Swatch } from '../ui/charts';
import { HeaderAction, IconButton } from '../ui/chrome';
import { Empty, Row, Section } from '../ui/layout';
import { Prose } from '../ui/prose';

type Entry = {
  key: string;
  section: { date: string; expense: number; income: number };
  tx: TransactionRow | undefined;
};

/**
 * 내역(PRD 4.5, docs/DESIGN.md 4.4). 헤더 가운데에 달 옮기기(‹ 10월 ›), 위에 기간 합계, 적용 중인 조건, 목록/카테고리 보기.
 * 목록은 날짜별 묶음이고 줄을 누르면 수정 시트다. 카테고리 보기는 도넛과 표이고 줄을 누르면 그 카테고리의 목록이다
 */
export function HistoryScreen() {
  const navigation = useNavigation();
  const today = useToday();
  const lists = useLists();
  const { filter, apply, clear, showMonth, view, setView } = useHistoryFilter();
  // 고른 탭을 다시 누르면 맨 위로 간다
  const list = useRef<FlatList<Entry>>(null);
  useScrollToTop(list);
  const data = useQuery(
    `history:${JSON.stringify(filter)}:${today}`,
    async db => ({
      rows: await filterTransactions(db, {
        ...filterRange(filter, today),
        type: filter.type,
        categoryIds: filter.categoryIds,
        reasonTagIds: filter.reasonTagIds,
      }),
      first: await firstRecordDate(db),
    }),
    // 달을 옮기는 동안 앞 달의 목록을 둬 화면이 비었다가 다시 그려지지 않는다
    { keepPrevious: true },
  );

  const month = viewedMonth(filter, today);
  const label = rangeLabel(filter, today);
  const first = data?.first;
  // 달이나 조건이 바뀌면 새 목록을 맨 위에서 연다. 달 줄은 헤더라 깊이 내려간 채 옮길 수 있다
  const toTop = () => list.current?.scrollToOffset({ offset: 0, animated: false });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () =>
        filter.period === 'custom' ? (
          <Text heading='2' size='md' className='tabular-nums'>
            {label}
          </Text>
        ) : (
          <MonthNav
            month={month}
            today={today}
            first={first}
            onChange={next => {
              showMonth(next, today);
              list.current?.scrollToOffset({ offset: 0, animated: false });
            }}
          />
        ),
      headerRight: () => (
        <HeaderAction label='필터' onPress={() => navigation.navigate('HistoryFilter')} />
      ),
    });
  }, [navigation, filter.period, label, month, today, first, showMonth]);

  // 내역 탭을 보고 있을 때 탭을 다시 누르면 맨 위(useScrollToTop)와 함께 이번 달로 돌아온다. 헤더에 "이번 달" 자리가 없다
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        const state = useHistoryFilter.getState();
        if (navigation.isFocused() && state.filter.period === 'month' && state.filter.month)
          state.showMonth(today.slice(0, 7), today);
      }),
    [navigation, today],
  );

  if (!data || !lists) return <View className='flex-1 bg-canvas' />;

  const sections = groupByDate(data.rows);
  // 날짜 머리를 줄 사이에 끼운 한 목록이다. 머리는 끈적하게 위에 붙는다(DESIGN.md 4.4)
  const entries: Entry[] = sections.flatMap(section => [
    { key: `h:${section.date}`, section, tx: undefined },
    ...section.data.map(tx => ({ key: String(tx.id), section, tx })),
  ]);
  const sticky = entries.flatMap((entry, index) => (entry.tx ? [] : [index + 1]));
  const expense = data.rows.filter(r => r.type === 'expense').reduce((n, r) => n + r.amount, 0);
  const income = data.rows.filter(r => r.type === 'income').reduce((n, r) => n + r.amount, 0);
  const category = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  // 이모지가 있는 카테고리가 하나라도 보이면 모든 줄에 같은 폭의 이모지 칸을 둬 글자의 왼쪽 끝을 맞춘다
  const glyphs = data.rows.some(r => leadingEmoji(category(r.categoryId)).emoji !== undefined);
  const conditions = [
    filter.type === 'expense' ? '지출만' : filter.type === 'income' ? '수입만' : undefined,
    ...filter.categoryIds.map(category),
    ...filter.reasonTagIds.map(id => lists.names.reasonTags.get(id) ?? '태그'),
  ].filter((s): s is string => s !== undefined);
  const header = (
    <Stack className='gap-3 pb-2'>
      {/* 보기 칩은 합계 오른쪽에 둬 머리를 한 단 줄인다. 큰 글자에서는 합계 아래로 내려간다 */}
      <Stack direction='row' wrap align='end' justify='between' className='gap-3'>
        <Total label={label} type={filter.type} expense={expense} income={income} />
        <Stack direction='row' className='gap-3'>
          <Chip label='목록' selected={view === 'list'} onPress={() => setView('list')} />
          <Chip
            label='카테고리'
            selected={view === 'chart'}
            // 카테고리 보기는 모든 카테고리의 몫이다. 표에서 눌러 건 카테고리 조건이 남으면 조각 하나가 100%가 된다
            onPress={() => {
              if (view === 'chart') return;
              if (filter.categoryIds.length > 0) apply({ ...filter, categoryIds: [] });
              setView('chart');
            }}
          />
        </Stack>
      </Stack>
      {isFiltered(filter) && (
        <Stack direction='row' align='center' justify='between' className='gap-3'>
          <Prose size='sm' tone='muted' className='flex-1'>
            {conditions.length > 0 ? conditions.join(' · ') : '기간만 바꿨어요'}
          </Prose>
          <Button label='초기화' variant='ghost' size='sm' onPress={clear} />
        </Stack>
      )}
    </Stack>
  );

  if (data.first === undefined) {
    return (
      <View className='flex-1 bg-canvas px-4 pt-1'>
        <Empty
          title='아직 기록이 없어요'
          body='지출과 수입을 기록하면 여기에 날짜별로 모여요'
          action={
            <Button
              label='기록하기'
              variant='secondary'
              className='self-start'
              onPress={() => navigation.navigate('Entry', {})}
            />
          }
        />
      </View>
    );
  }

  const thisMonth = month === today.slice(0, 7);
  return (
    <View className='flex-1 bg-canvas'>
      <FlatList
        ref={list}
        className='flex-1 bg-canvas'
        contentContainerClassName='px-4 pb-6 pt-1'
        // 카테고리 보기는 목록을 비우고 빈 자리에 도넛을 그린다. 머리(달 옮기기, 합계)와 스크롤은 그대로다
        data={view === 'list' ? entries : []}
        keyExtractor={entry => entry.key}
        stickyHeaderIndices={view === 'list' ? sticky : []}
        // Android FlatList는 화면 밖 줄을 네이티브에서 떼어 둔다(removeClippedSubviews 기본 켜짐). 그 상태로 빈 상태(카테고리
        // 보기)와 끈적한 머리가 있는 목록을 오가면 Fabric이 줄을 없는 자리에 끼우다 죽었다("addViewAt: failed to insert
        // view", 에뮬레이터). 한 달 기록은 수십 줄이라 떼어 두지 않아도 된다
        removeClippedSubviews={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          view === 'chart' && data.rows.length > 0 ? (
            <CategoryShare
              rows={data.rows}
              type={filter.type}
              category={category}
              onPick={categoryIds => {
                apply({ ...filter, categoryIds });
                setView('list');
                toTop();
              }}
            />
          ) : isFiltered(filter) ? (
            <Empty
              title='조건에 맞는 기록이 없어요'
              action={
                <Button
                  label='필터 초기화'
                  variant='secondary'
                  className='self-start'
                  onPress={clear}
                />
              }
            />
          ) : thisMonth ? (
            // 필터 없이 이번 달이 비었다. 달이 막 바뀌었을 때다(DESIGN.md 4.4)
            <Empty
              title={`${label}에는 아직 기록이 없어요`}
              action={
                <Stack direction='row' wrap className='gap-3'>
                  <Button
                    label='기록하기'
                    variant='secondary'
                    onPress={() => navigation.navigate('Entry', {})}
                  />
                  <Button
                    label='지난 달 보기'
                    variant='ghost'
                    onPress={() => showMonth(previousMonth(filter, today), today)}
                  />
                </Stack>
              }
            />
          ) : (
            // 지난 달을 넘기다 기록이 없는 달을 만났다. 옮기는 것은 위의 ‹ ›가 맡는다
            <Empty title={`${label}에는 기록이 없어요`} />
          )
        }
        renderItem={({ item }) => (
          <HistoryItem
            entry={item}
            category={category}
            glyphs={glyphs}
            onPress={id => navigation.navigate('Entry', { transactionId: id })}
          />
        )}
      />
    </View>
  );
}

/**
 * 헤더 가운데의 ‹ 10월 ›(DESIGN.md 4.4). 첫 기록의 달보다 앞, 이번 달보다 뒤로는 가지 않는다(입력 시트가 오늘 뒤의
 * 날짜를 막는다). 이번 달로 한 번에 돌아오는 것은 내역 탭 다시 누르기다
 */
function MonthNav({
  month,
  today,
  first,
  onChange,
}: {
  month: string;
  today: string;
  first: string | undefined;
  onChange: (month: string) => void;
}) {
  const current = today.slice(0, 7);
  const earliest = first !== undefined && first.slice(0, 7) < current ? first.slice(0, 7) : current;
  return (
    <Stack direction='row' align='center'>
      <IconButton
        icon='chevron-left'
        label='이전 달'
        disabled={month <= earliest}
        onPress={() => onChange(addMonths(month, -1))}
      />
      {/* 달이 바뀌면 스크린 리더가 새 달을 읽는다. live region은 늘 있는 View에서 글자만 바꾼다(DESIGN.md 3.7).
          "9월"과 "10월"의 폭 차이로 화살표가 움직이지 않게 가장 흔한 폭을 잡는다 */}
      <View accessibilityLiveRegion='polite' collapsable={false} className='min-w-16 items-center'>
        <Text heading='2' size='lg' className='tabular-nums'>
          {monthLabel(month, today)}
        </Text>
      </View>
      <IconButton
        icon='chevron-right'
        label='다음 달'
        disabled={month >= current}
        onPress={() => onChange(addMonths(month, 1))}
      />
    </Stack>
  );
}

/**
 * 기간 합계. 홈의 남은 예산과 같은 모양(작은 이름 + 2xl 금액)이라 아래 목록의 줄과 섞이지 않는다.
 * 수입만 걸러 보면 수입이 큰 금액이다. 스크린 리더는 한 덩어리("10월 지출 288,100원, 수입 …")로 읽는다
 */
function Total({
  label,
  type,
  expense,
  income,
}: {
  label: string;
  type: 'expense' | 'income' | undefined;
  expense: number;
  income: number;
}) {
  const kind = type === 'income' ? '수입' : '지출';
  const amount = formatWon(type === 'income' ? income : expense);
  const extra = type === undefined && income > 0 ? `수입 ${formatWon(income)}` : undefined;
  return (
    <View
      accessible
      accessibilityLabel={[`${label} ${kind} ${amount}`, extra].filter(Boolean).join(', ')}
      className='gap-1'
    >
      <Text size='sm' tone='muted'>
        {kind}
      </Text>
      <Text size='2xl' className='tabular-nums'>
        {amount}
      </Text>
      {extra !== undefined && (
        <Text size='sm' tone='muted' className='tabular-nums'>
          {extra}
        </Text>
      )}
    </View>
  );
}

/**
 * 카테고리 몫(DESIGN.md 4.4). 회고의 카테고리 도넛과 같은 그림(가장 큰 조각만 brand, 나머지는 회색 단계, 상위 5개 +
 * "그 외 N개")과 같은 값의 표다. 표가 차트의 대체 텍스트이고, 줄을 누르면 그 카테고리(그 외는 묶인 카테고리들)의
 * 목록으로 간다. 고정비도 넣어 조각의 합이 위의 합계와 같다
 */
function CategoryShare({
  rows,
  type,
  category,
  onPick,
}: {
  rows: TransactionRow[];
  type: 'expense' | 'income' | undefined;
  category: (id: number) => string;
  onPick: (categoryIds: number[]) => void;
}) {
  const kind = type === 'income' ? 'income' : 'expense';
  const target = rows.filter(r => r.type === kind);
  const total = target.reduce((n, r) => n + r.amount, 0);
  if (total === 0) return <Empty title={kind === 'income' ? '수입이 없어요' : '지출이 없어요'} />;
  const { top, others } = categoryShares(target);
  const slices = [
    ...top.map(c => ({
      key: `category-${c.categoryId}`,
      label: category(c.categoryId),
      amount: c.amount,
      ids: [c.categoryId],
    })),
    // 나머지 묶음은 기본 카테고리 "기타"와 이름이 겹치지 않게 개수로 부른다(회고와 같다)
    ...(others.length > 0
      ? [
          {
            key: 'rest',
            label: `그 외 ${others.length}개`,
            amount: others.reduce((n, c) => n + c.amount, 0),
            ids: others.map(c => c.categoryId),
          },
        ]
      : []),
  ];
  const percents = slices.map(slice => formatPercent(slice.amount, total));
  return (
    // 칩과 카드 사이를 목록의 첫 날짜 머리만큼 띄운다
    <View className='pt-2'>
      <Section title={kind === 'income' ? '카테고리별 수입' : '카테고리별 지출'}>
        {/* 표의 줄이 눌린다는 것을 표를 보기 전에 말한다. 꺾쇠는 다른 화면으로 가는 줄에만 단다(layout.tsx Row) */}
        <Prose size='sm' tone='muted'>
          카테고리를 누르면 그 내역만 보여요
        </Prose>
        <Donut slices={slices} percents={percents} />
        {/* 줄 사이 간격은 줄 자신의 여백만 쓴다(Section gap은 제목과 내용 사이) */}
        <View>
          {slices.map((slice, i) => (
            <Row
              key={slice.key}
              // 스크린 리더는 이모지 이름을 읽지 않게 이름만 읽는다(목록 줄과 같다)
              label={`${leadingEmoji(slice.label).rest} ${percents[i]}, ${formatWon(slice.amount)}, 내역 보기`}
              onPress={() => onPick(slice.ids)}
            >
              <Swatch index={i} />
              <Text className='flex-1'>{slice.label}</Text>
              {/* 금액 자릿수가 달라도 % 열이 곧게 서게 폭을 정한다 */}
              <Text size='sm' tone='muted' className='w-12 text-right tabular-nums'>
                {percents[i]}
              </Text>
              <Text className='min-w-24 text-right tabular-nums'>{formatWon(slice.amount)}</Text>
            </Row>
          ))}
        </View>
      </Section>
    </View>
  );
}

/**
 * 날짜 머리 또는 거래 한 줄(DESIGN.md 4.4). 줄은 두 칸이다: 윗줄은 제목과 금액이 같은 줄에, 아랫줄은 카테고리.
 * 카테고리 이모지는 왼쪽 칸에 따로 세운다. 수입은 +와 brand 글자, 고정비는 배지 하나
 */
function HistoryItem({
  entry,
  category,
  glyphs,
  onPress,
}: {
  entry: Entry;
  category: (id: number) => string;
  glyphs: boolean;
  onPress: (id: number) => void;
}) {
  const item = entry.tx;
  if (!item) {
    // 하루마다 위에 구분선을 긋는다. 선 위 24(앞 줄 여백 12 + 12), 선 아래 16이라 선이 아래 날짜에 붙는다.
    // 줄 사이에는 긋지 않는다. 합계는 줄 금액과 같은 오른쪽 열이다. 끈적하게 붙으면 선이 헤더 아래 경계가 된다
    return (
      <View
        accessible
        accessibilityRole='header'
        accessibilityLabel={sectionTitle(entry.section)}
        className='bg-canvas pt-3'
      >
        <View className='flex-row justify-between gap-3 border-t border-border pb-1 pt-4'>
          <Text size='sm' tone='muted'>
            {formatDate(entry.section.date)}
          </Text>
          <Text size='sm' tone='muted' className='tabular-nums'>
            {sectionAmount(entry.section)}
          </Text>
        </View>
      </View>
    );
  }
  const name = leadingEmoji(category(item.categoryId));
  const title = item.memo || name.rest;
  // 메모가 없거나 카테고리 이름과 같으면("교통비") 아랫줄에 다시 쓰지 않는다. 결제수단은 거의 모든 줄이 카드라 카드가
  // 아닐 때만 쓴다
  const meta = [
    title === name.rest ? undefined : name.rest,
    item.paymentMethod === 'card' ? undefined : paymentLabel(item.paymentMethod),
  ]
    .filter(Boolean)
    .join(' · ');
  const income = item.type === 'income';
  const amount = income ? `+${formatWon(item.amount)}` : formatWon(item.amount);
  return (
    <Row
      inset='screen'
      // 아랫줄이 비면 빈 칸을 읽지 않는다("식비, , 지출")
      label={[
        title,
        meta,
        `${income ? '수입' : '지출'} ${formatWon(item.amount)}`,
        item.isFixed ? '고정비' : '',
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() => onPress(item.id)}
    >
      {glyphs && (
        <View className='w-8 items-center'>
          {name.emoji !== undefined && <Text size='xl'>{name.emoji}</Text>}
        </View>
      )}
      <Stack className='flex-1 gap-1'>
        <Stack direction='row' className='gap-3'>
          <RNText numberOfLines={1} className='flex-1 font-sans text-md text-fg'>
            {title}
          </RNText>
          <Text className={income ? 'text-fg-brand tabular-nums' : 'tabular-nums'}>{amount}</Text>
        </Stack>
        {(meta !== '' || item.isFixed) && (
          <Stack direction='row' align='center' className='gap-2'>
            {meta !== '' && (
              <Text size='sm' tone='muted'>
                {meta}
              </Text>
            )}
            {item.isFixed && (
              <Badge variant='secondary' size='sm'>
                고정비
              </Badge>
            )}
          </Stack>
        )}
      </Stack>
    </Row>
  );
}
