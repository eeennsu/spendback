import { Button, Stack } from '@eeennsu/native';
import { useState } from 'react';
import { AccessibilityInfo, FlatList } from 'react-native';
import { View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type TransactionRow, tagExpenses, untaggedExpenses } from '../db/transactions';
import { TAGGING_FROM, leadingEmoji, relativeDate } from '../domain/entry';
import { formatWon } from '../domain/format';
import { mutate, useQuery, useToday } from '../state/data';
import { SATISFACTION, useLists } from '../state/lists';
import { Choices, Empty, MoneyRow } from '../ui/layout';
import { Prose } from '../ui/prose';

type Satisfaction = NonNullable<TransactionRow['satisfaction']>;

/**
 * 이유·만족도 몰아 고르기(PRD 4.5, docs/DESIGN.md 4.4). 10월부터의 변동비 지출 중 둘 중 하나라도 빈 것을 모은다.
 * 여러 줄을 체크하고 아래 칸에서 고른 값만 한 번에 붙인다. 둘 다 채운 지출은 목록에서 빠진다
 */
export function TaggingScreen() {
  const insets = useSafeAreaInsets();
  const today = useToday();
  const lists = useLists();
  const rows = useQuery('tagging', db => untaggedExpenses(db, TAGGING_FROM));
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [reasonTagId, setReasonTagId] = useState<number>();
  const [satisfaction, setSatisfaction] = useState<Satisfaction>();
  const [failed, setFailed] = useState(false);

  if (!rows || !lists) return <View className='flex-1 bg-canvas' />;

  const category = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  const glyphs = rows.some(r => leadingEmoji(category(r.categoryId)).emoji !== undefined);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  };
  const count = selected.size;
  const ready = count > 0 && (reasonTagId !== undefined || satisfaction !== undefined);

  const apply = async () => {
    try {
      await mutate(db =>
        tagExpenses(db, [...selected], {
          ...(reasonTagId !== undefined && { reasonTagId }),
          ...(satisfaction !== undefined && { satisfaction }),
        }),
      );
    } catch (error) {
      console.error(error);
      setFailed(true);
      return;
    }
    setFailed(false);
    setSelected(new Set());
    setReasonTagId(undefined);
    setSatisfaction(undefined);
    AccessibilityInfo.announceForAccessibility(`${count}건에 적용했어요`);
  };

  return (
    <View className='flex-1 bg-canvas'>
      <FlatList
        className='flex-1'
        contentContainerClassName='px-4 pb-4 pt-1'
        data={rows}
        keyExtractor={row => String(row.id)}
        ListHeaderComponent={
          rows.length > 0 ? (
            <Prose size='sm' tone='muted' className='pb-2'>
              {`비어 있는 지출 ${rows.length}건이에요. 골라서 이유와 만족도를 한 번에 정해요`}
            </Prose>
          ) : undefined
        }
        ListEmptyComponent={
          <Empty
            title='고를 지출이 없어요'
            body='10월부터 기록한 지출에 이유와 만족도가 모두 있어요'
          />
        }
        renderItem={({ item }) => {
          const name = leadingEmoji(category(item.categoryId));
          const title = item.memo || name.rest;
          // 이미 고른 값을 보여 어느 쪽이 비었는지 알게 한다
          const meta = [
            title === name.rest ? undefined : name.rest,
            relativeDate(item.date, today),
            item.reasonTagId === null ? undefined : lists.names.reasonTags.get(item.reasonTagId),
            SATISFACTION.find(s => s.value === item.satisfaction)?.label,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <MoneyRow
              inset='screen'
              dense
              checked={selected.has(item.id)}
              label={`${title}, ${meta}, ${formatWon(item.amount)}`}
              onPress={() => toggle(item.id)}
              glyphs={glyphs}
              emoji={name.emoji}
              title={title}
              amount={formatWon(item.amount)}
              meta={meta}
            />
          );
        }}
      />
      {rows.length > 0 && (
        <Stack className='gap-3 border-t border-border bg-surface px-4 pt-3'>
          <Choices
            label='이유'
            compact
            optional
            options={lists.reasonTags
              .filter(t => !t.hidden)
              .map(t => ({ value: t.id, label: t.name }))}
            value={reasonTagId}
            onChange={setReasonTagId}
          />
          <Choices
            label='만족도'
            compact
            optional
            options={SATISFACTION}
            value={satisfaction}
            onChange={setSatisfaction}
          />
          {failed && (
            <Prose size='sm' tone='danger'>
              저장하지 못했어요. 다시 눌러 주세요
            </Prose>
          )}
          <Button
            label={count > 0 ? `${count}건에 적용` : '지출을 고르세요'}
            disabled={!ready}
            onPress={apply}
          />
          {/* 제스처 막대 자리. style을 주면 react-native-css가 className 여백을 덮어써 빈 뷰로 비운다(ScreenScroll과 같다) */}
          <View style={{ height: insets.bottom }} />
        </Stack>
      )}
    </View>
  );
}
