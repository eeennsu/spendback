import { Stack, Text } from '@eeennsu/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { Text as RNText, View } from 'react-native-css/components';

import { type InboxItem, confirmCancel, dismissInbox, inboxView } from '../cards/inbox';
import { allCategories } from '../db/lists';
import { getSetting } from '../db/settings';
import { relativeDate } from '../domain/entry';
import { formatWon } from '../domain/format';
import { hasModel } from '../native/files';
import { suggestCards } from '../state/cards';
import { mutate, useQuery } from '../state/data';
import { modelFor } from '../state/retro';
import { Row, Section } from '../ui/layout';

/** 보이는 지출 카테고리. 추천은 이 중에서만 고른다(PRD 4.9) */
export const visibleExpenseCategories = (rows: Awaited<ReturnType<typeof allCategories>>) =>
  rows.filter(c => c.type === 'expense' && !c.hidden).map(({ id, name }) => ({ id, name }));

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

/**
 * 홈의 카드 알림 대기 목록(PRD 4.9, docs/DESIGN.md 4.2). 승인은 누르면 채운 입력 시트를 열고, 취소·읽지 못한 알림은
 * 대화상자로 처리한다. 홈이 보이면 처음 보는 가맹점의 추천을 기기 안 모델에 묻는다
 */
export function CardInboxSection({ today }: { today: string }) {
  const navigation = useNavigation();
  const data = useQuery('home:cards', async db => {
    const categories = visibleExpenseCategories(await allCategories(db));
    return {
      categories,
      items: await inboxView(db, categories),
      modelId: await getSetting(db, 'model'),
    };
  });
  const waiting = data?.items.some(item => item.needsSuggestion) ?? false;

  useFocusEffect(
    useCallback(() => {
      if (waiting && data) void suggestCards(data.categories, modelFor(data.modelId));
    }, [waiting, data]),
  );

  if (!data || data.items.length === 0) return null;
  // 모델이 없으면 추천이 오지 않는다. "추천 준비 중"으로 기다리게 하지 않는다
  const modelReady = hasModel(modelFor(data.modelId));
  const nameOf = (id: number) => data.categories.find(c => c.id === id)?.name ?? '카테고리';

  return (
    <Section title='카드 알림' aside={`${data.items.length}건`}>
      <View>
        {data.items.map(item => (
          <InboxRow
            key={item.id}
            item={item}
            today={today}
            nameOf={nameOf}
            modelReady={modelReady}
            open={() => navigation.navigate('Entry', { inboxId: item.id })}
          />
        ))}
      </View>
    </Section>
  );
}

function InboxRow({
  item,
  today,
  nameOf,
  modelReady,
  open,
}: {
  item: InboxItem;
  today: string;
  nameOf: (id: number) => string;
  modelReady: boolean;
  open: () => void;
}) {
  const amount = item.amount !== null ? formatWon(item.amount) : '';
  const merchant = item.merchant ?? '';

  if (item.kind === 'unreadable') {
    const title = `읽지 못한 알림 · ${item.appName}`;
    return (
      <Line
        title={title}
        meta={item.text || item.title}
        label={`${title}, ${item.text}`}
        onPress={() =>
          Alert.alert(title, `${item.title}\n${item.text}`.trim(), [
            { text: '닫기', style: 'cancel' },
            { text: '넘기기', onPress: () => void mutate(db => dismissInbox(db, item.id)) },
          ])
        }
      />
    );
  }

  if (item.kind === 'cancel') {
    const title = `결제 취소 · ${merchant}`;
    const paired = item.paired;
    const meta = paired
      ? `${monthDay(paired.date)} 기록을 지울까요?`
      : '짝을 찾지 못했어요 · 내역에서 고쳐 주세요';
    return (
      <Line
        title={title}
        meta={meta}
        amount={amount}
        label={`${title}, ${meta}, ${amount}`}
        onPress={() =>
          paired
            ? Alert.alert(
                '이 기록을 지울까요?',
                `${monthDay(paired.date)} ${paired.memo ?? merchant} ${formatWon(paired.amount)} 기록을 카드 결제 취소로 지워요.`,
                [
                  { text: '두기', onPress: () => void mutate(db => dismissInbox(db, item.id)) },
                  {
                    text: '지우기',
                    style: 'destructive',
                    onPress: () => void mutate(db => confirmCancel(db, item.id)),
                  },
                ],
              )
            : Alert.alert('이 취소 알림을 넘길까요?', '내역에서 원래 기록을 고칠 수 있어요.', [
                { text: '취소', style: 'cancel' },
                { text: '넘기기', onPress: () => void mutate(db => dismissInbox(db, item.id)) },
              ])
        }
      />
    );
  }

  const suggestion = item.suggestion
    ? `${nameOf(item.suggestion.categoryId)} 추천`
    : item.needsSuggestion && modelReady
      ? '추천 준비 중'
      : '카테고리 고르기';
  const meta = [
    suggestion,
    item.date ? relativeDate(item.date, today) : undefined,
    item.maybeDuplicate ? '이미 기록했을 수 있어요' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Line
      title={merchant}
      meta={meta}
      amount={amount}
      label={`${merchant}, ${meta}, ${amount}`}
      onPress={open}
    />
  );
}

function Line({
  title,
  meta,
  amount,
  label,
  onPress,
}: {
  title: string;
  meta: string;
  amount?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Row label={label} onPress={onPress}>
      <Stack className='flex-1 gap-1'>
        <RNText numberOfLines={1} className='font-sans text-md text-fg'>
          {title}
        </RNText>
        <RNText numberOfLines={2} className='font-sans text-sm text-fg-muted'>
          {meta}
        </RNText>
      </Stack>
      {amount ? <Text className='tabular-nums'>{amount}</Text> : null}
    </Row>
  );
}
