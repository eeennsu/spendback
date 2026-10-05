import { Stack, Text } from '@eeennsu/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert, AppState } from 'react-native';
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
import { Prose, wrapWords } from '../ui/prose';

/** 보이는 지출 카테고리. 추천은 이 중에서만 고른다(PRD 4.9) */
export const visibleExpenseCategories = (rows: Awaited<ReturnType<typeof allCategories>>) =>
  rows.filter(c => c.type === 'expense' && !c.hidden).map(({ id, name }) => ({ id, name }));

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

  // 백그라운드로 가 멈춘 추천은 앞으로 돌아오면 다시 돌린다. 새 알림이 없으면 DB가 바뀌지 않아 effect가 다시 돌지 않는다
  useFocusEffect(
    useCallback(() => {
      if (!waiting || !data) return;
      const suggest = () => void suggestCards(data.categories, modelFor(data.modelId));
      suggest();
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') suggest();
      });
      return () => subscription.remove();
    }, [waiting, data]),
  );

  if (!data || data.items.length === 0) return null;
  // 모델이 없으면 추천이 오지 않는다. "추천 준비 중"으로 기다리게 하지 않는다
  const modelReady = hasModel(modelFor(data.modelId));
  const nameOf = (id: number) => data.categories.find(c => c.id === id)?.name ?? '카테고리';

  return (
    <Section title='카드 알림' aside={`${data.items.length}건`}>
      {/* 저장 전 줄이 최근 지출 줄과 같은 모양이라, 고정비처럼 안내 줄과 "기록"을 둔다(7차 038) */}
      <Prose size='sm' tone='muted'>
        확인하고 저장해야 기록돼요
      </Prose>
      <View>
        {data.items.map(item => (
          <InboxRow
            key={item.id}
            item={item}
            today={today}
            nameOf={nameOf}
            modelReady={modelReady}
            open={() => navigation.navigate('Entry', { inboxId: item.id })}
            record={() => navigation.navigate('Entry', {})}
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
  record,
}: {
  item: InboxItem;
  today: string;
  nameOf: (id: number) => string;
  modelReady: boolean;
  /** 이 알림으로 채운 입력 시트 */
  open: () => void;
  /** 빈 입력 시트(읽지 못한 알림을 직접 기록) */
  record: () => void;
}) {
  const amount = item.amount !== null ? formatWon(item.amount) : '';
  const merchant = item.merchant ?? '';
  const dismiss = () => void mutate(db => dismissInbox(db, item.id));

  if (item.kind === 'unreadable') {
    const title = `읽지 못한 알림 · ${item.appName}`;
    // 제목이 카드 이름을 말하므로 본문은 원문만이다. 알림 제목이 카드 이름과 다를 때만 앞에 둔다
    const body = [item.title !== item.appName && item.title, item.text].filter(Boolean).join('\n');
    return (
      <Line
        title={title}
        meta={item.text || item.title}
        label={`${title}, ${item.text}`}
        onPress={() =>
          Alert.alert(title, body, [
            { text: '닫기', style: 'cancel' },
            {
              text: '직접 기록',
              onPress: () => {
                dismiss();
                record();
              },
            },
            { text: '넘기기', onPress: dismiss },
          ])
        }
      />
    );
  }

  if (item.kind === 'cancel') {
    const title = `결제 취소 · ${merchant}`;
    const paired = item.paired;
    const meta = paired
      ? `${relativeDate(paired.date, today)} 기록을 지울까요?`
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
                `${relativeDate(paired.date, today)} ${paired.memo ?? merchant} ${formatWon(paired.amount)} 기록을 카드 결제 취소로 지워요.`,
                [
                  { text: '닫기', style: 'cancel' },
                  { text: '기록 두기', onPress: dismiss },
                  {
                    text: '지우기',
                    style: 'destructive',
                    onPress: () => void mutate(db => confirmCancel(db, item.id)),
                  },
                ],
              )
            : Alert.alert('이 취소 알림을 넘길까요?', '내역에서 원래 기록을 고칠 수 있어요.', [
                { text: '닫기', style: 'cancel' },
                { text: '넘기기', onPress: dismiss },
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
  // 겹친 기록은 저장 전에 알아야 하는 것이라 맨 앞이다
  const meta = [
    item.maybeDuplicate ? '이미 기록했을 수 있어요' : undefined,
    suggestion,
    item.date ? relativeDate(item.date, today) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Line
      title={merchant}
      meta={meta}
      amount={amount}
      action='기록'
      label={`${merchant} 기록, ${meta}, ${amount}`}
      onPress={open}
    />
  );
}

function Line({
  title,
  meta,
  amount,
  action,
  label,
  onPress,
}: {
  title: string;
  meta: string;
  amount?: string;
  /** 누르면 무엇이 되는지(고정비 줄의 "기록"과 같다) */
  action?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Row label={label} onPress={onPress}>
      <Stack className='flex-1 gap-1'>
        <RNText numberOfLines={1} className='font-sans text-md text-fg'>
          {title}
        </RNText>
        {/* 두 줄이 되면 낱말 사이에서만 바뀐다(DESIGN.md 3.4). 스크린 리더는 원래 문장을 읽는다 */}
        <RNText
          numberOfLines={2}
          accessibilityLabel={meta}
          className='font-sans text-sm text-fg-muted'
        >
          {wrapWords(meta)}
        </RNText>
      </Stack>
      {amount || action ? (
        <Stack align='end' className='gap-1'>
          {amount ? <Text className='tabular-nums'>{amount}</Text> : null}
          {action ? (
            <Text size='sm' className='text-fg-brand'>
              {action}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Row>
  );
}
