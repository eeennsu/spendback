import { Badge, Button, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect } from 'react';
import { FlatList } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { type TransactionRow, filterTransactions, firstRecordDate } from '../db/transactions';
import { groupByDate, sectionTitle } from '../domain/entry';
import { formatWon } from '../domain/format';
import { useQuery, useToday } from '../state/data';
import { paymentLabel, useLists } from '../state/lists';
import { filterRange, isFiltered, rangeLabel, useHistoryFilter } from '../state/ui';
import { HeaderAction } from '../ui/chrome';
import { Empty, Row } from '../ui/layout';

type Entry = {
  key: string;
  section: { date: string; expense: number; income: number };
  tx: TransactionRow | undefined;
};

/**
 * 내역(PRD 4.5, docs/DESIGN.md 4.4). 위에 기간 합계와 적용 중인 필터, 아래에 날짜별 묶음. 줄을 누르면 수정 시트다
 */
export function HistoryScreen() {
  const navigation = useNavigation();
  const today = useToday();
  const lists = useLists();
  const { filter, reset } = useHistoryFilter();
  const range = filterRange(filter, today);
  const data = useQuery(`history:${JSON.stringify(filter)}:${today}`, async db => ({
    rows: await filterTransactions(db, {
      ...range,
      type: filter.type,
      categoryIds: filter.categoryIds,
      reasonTagIds: filter.reasonTagIds,
    }),
    first: await firstRecordDate(db),
  }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderAction label='필터' onPress={() => navigation.navigate('HistoryFilter')} />
      ),
    });
  }, [navigation]);

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
  const conditions = [
    filter.type === 'expense' ? '지출만' : filter.type === 'income' ? '수입만' : undefined,
    ...filter.categoryIds.map(category),
    ...filter.reasonTagIds.map(id => lists.names.reasonTags.get(id) ?? '태그'),
  ].filter((s): s is string => s !== undefined);

  const header = (
    <Stack className='gap-2 pb-3'>
      <Text className='tabular-nums'>
        {`${rangeLabel(filter, today)} 지출 ${formatWon(expense)}${income > 0 ? ` · 수입 ${formatWon(income)}` : ''}`}
      </Text>
      {isFiltered(filter) && (
        <Stack direction='row' align='center' justify='between' className='gap-3'>
          <Text size='sm' tone='muted' className='flex-1'>
            {conditions.length > 0 ? conditions.join(' · ') : '기간만 바꿨어요'}
          </Text>
          <Button label='초기화' variant='ghost' size='sm' onPress={reset} />
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

  return (
    <FlatList
      className='flex-1 bg-canvas'
      contentContainerClassName='px-4 pb-6 pt-1'
      data={entries}
      keyExtractor={entry => entry.key}
      stickyHeaderIndices={sticky}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Empty
          title='조건에 맞는 기록이 없어요'
          action={
            <Button
              label='필터 초기화'
              variant='secondary'
              className='self-start'
              onPress={reset}
            />
          }
        />
      }
      renderItem={({ item }) => (
        <HistoryItem
          entry={item}
          category={category}
          onPress={id => navigation.navigate('Entry', { transactionId: id })}
        />
      )}
    />
  );
}

/** 날짜 머리 또는 거래 한 줄. 수입은 +와 brand 글자, 고정비는 배지 하나(DESIGN.md 4.4) */
function HistoryItem({
  entry,
  category,
  onPress,
}: {
  entry: Entry;
  category: (id: number) => string;
  onPress: (id: number) => void;
}) {
  const item = entry.tx;
  if (!item) {
    return (
      <View className='bg-canvas pb-1 pt-3'>
        <Text size='sm' tone='muted' heading='2' className='tabular-nums'>
          {sectionTitle(entry.section)}
        </Text>
      </View>
    );
  }
  const title = item.memo || category(item.categoryId);
  // 메모가 없으면 제목이 카테고리라 아랫줄에 다시 쓰지 않는다
  const meta = [item.memo ? category(item.categoryId) : undefined, paymentLabel(item.paymentMethod)]
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
      <Stack className='flex-1 gap-1'>
        <RNText numberOfLines={1} className='font-sans text-md text-fg'>
          {title}
        </RNText>
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
      <Text className={income ? 'text-fg-brand tabular-nums' : 'tabular-nums'}>{amount}</Text>
    </Row>
  );
}
