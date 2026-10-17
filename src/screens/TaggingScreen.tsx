import { Button } from '@eeennsu/native';
import { useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';
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
  const { height } = useWindowDimensions();
  const today = useToday();
  const lists = useLists();
  const rows = useQuery('tagging', db => untaggedExpenses(db, TAGGING_FROM));
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [reasonTagId, setReasonTagId] = useState<number>();
  const [satisfaction, setSatisfaction] = useState<Satisfaction>();
  // 적용한 결과. 다음에 무언가 고르면 지운다
  const [notice, setNotice] = useState<{ text: string; failed: boolean }>();

  if (!rows || !lists) return <View className='flex-1 bg-canvas' />;

  const category = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  const glyphs = rows.some(r => leadingEmoji(category(r.categoryId)).emoji !== undefined);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
    setNotice(undefined);
  };
  const count = selected.size;
  const picked = reasonTagId !== undefined || satisfaction !== undefined;
  // 입력 시트의 저장 줄과 같이 버튼이 꺼진 이유와 누르면 일어날 일을 버튼 위에 쓴다(DESIGN.md 3.7)
  const status =
    notice?.text ??
    (rows.length === 0
      ? ''
      : count === 0
        ? '지출을 고르세요'
        : !picked
          ? '이유나 만족도를 골라 주세요'
          : '고른 값만 붙이고 이미 있는 값은 그대로 둬요');

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
      setNotice({ text: '저장하지 못했어요. 다시 눌러 주세요', failed: true });
      return;
    }
    setNotice({ text: `${count}건에 적용했어요`, failed: false });
    setSelected(new Set());
    setReasonTagId(undefined);
    setSatisfaction(undefined);
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
              {`이유나 만족도가 빈 지출 ${rows.length}건이에요. 골라서 한 번에 정해요`}
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
          const reason =
            item.reasonTagId === null ? undefined : lists.names.reasonTags.get(item.reasonTagId);
          const feeling = SATISFACTION.find(s => s.value === item.satisfaction)?.label;
          // 이미 고른 값에 이름을 붙여 어느 쪽이 비었는지 알게 한다
          const meta = [
            title === name.rest ? undefined : name.rest,
            relativeDate(item.date, today),
            reason && `이유 ${reason}`,
            feeling && `만족도 ${feeling}`,
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
      {/* 마지막 지출까지 채워 목록이 비어도 상태 줄은 남아 결과를 읽는다. 칩과 버튼만 지출이 있을 때 둔다 */}
      <View className={rows.length > 0 ? 'border-t border-border bg-surface' : undefined}>
        {rows.length > 0 && (
          // 글자를 크게 하거나 태그가 늘어도 목록과 버튼이 남게 칩만 스크롤한다. 넘치면 스크롤 막대를 늘 보인다
          <ScrollView
            persistentScrollbar
            style={{ maxHeight: height * 0.4 }}
            contentContainerClassName='gap-3 px-4 pt-3'
          >
            <Choices
              label='이유'
              compact
              optional
              options={lists.reasonTags
                .filter(t => !t.hidden)
                .map(t => ({ value: t.id, label: t.name }))}
              value={reasonTagId}
              onChange={value => {
                setReasonTagId(value);
                setNotice(undefined);
              }}
            />
            <Choices
              label='만족도'
              compact
              optional
              options={SATISFACTION}
              value={satisfaction}
              onChange={value => {
                setSatisfaction(value);
                setNotice(undefined);
              }}
            />
          </ScrollView>
        )}
        <View className='gap-2 px-4 pb-3 pt-3'>
          {/* 접근성 prop만 가진 View는 평탄화돼 live region이 사라진다(DESIGN.md 3.7, 입력 시트와 같다) */}
          <View accessibilityLiveRegion='polite' collapsable={false}>
            <Prose size='sm' tone={notice?.failed ? 'danger' : 'muted'}>
              {status}
            </Prose>
          </View>
          {rows.length > 0 && (
            <Button
              label={count > 0 ? `${count}건에 적용` : '적용'}
              disabled={count === 0 || !picked}
              onPress={apply}
            />
          )}
        </View>
        {/* 제스처 막대 자리. style을 주면 react-native-css가 className 여백을 덮어써 빈 뷰로 비운다(ScreenScroll과 같다) */}
        <View style={{ height: insets.bottom }} />
      </View>
    </View>
  );
}
