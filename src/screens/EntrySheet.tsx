import { Button, Chip, Icon, Input, Label, Stack, Text, cn } from '@eeennsu/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { type StaticScreenProps, useNavigation, usePreventRemove } from '@react-navigation/native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { Pressable, ScrollView, Switch, View } from 'react-native-css/components';

import { type InboxItem, dismissInbox, inboxView, saveFromInbox } from '../cards/inbox';
import { type CategoryRow, type FixedCostRow, type ReasonTagRow, allCategories } from '../db/lists';
import {
  type TransactionInput,
  type TransactionRow,
  addTransaction,
  deleteTransaction,
  getTransaction,
  lastCategoryForMemo,
  memoSuggestions,
  updateTransaction,
} from '../db/transactions';
import { addDays, toLocalDate } from '../domain/date';
import { amountText, editAmount } from '../domain/entry';
import { paymentDate } from '../domain/fixedCost';
import { render } from '../retro/render';
import { mutate, read, useQuery, useToday } from '../state/data';
import { PAYMENT_METHODS, SATISFACTION, useLists } from '../state/lists';
import { Choices, SwitchRow } from '../ui/layout';
import { Prose } from '../ui/prose';
import { Sheet } from '../ui/sheet';
import { visibleExpenseCategories } from './CardInboxSection';

type Params = { transactionId?: number; fixedCostId?: number; inboxId?: number } | undefined;

/**
 * 입력 시트(PRD 4.1, docs/DESIGN.md 4.3). 금액 → 카테고리 → 저장, 3번에 끝나도록 필수 항목만 먼저 보이고 나머지는
 * "선택 항목"으로 접는다. 거래 줄에서 열면 수정, 홈 고정비 줄에서 열면 그 항목으로 채운 채로 연다(PRD 4.4).
 * 홈 카드 알림 줄에서 열면 알림 값과 추천 카테고리로 채운다(PRD 4.9)
 */
export function EntrySheet({ route }: StaticScreenProps<Params>) {
  const { transactionId, fixedCostId, inboxId } = route.params ?? {};
  const today = useToday();
  const lists = useLists();
  const editing = useQuery(`entry:${transactionId}`, db =>
    transactionId === undefined
      ? Promise.resolve(null)
      : getTransaction(db, transactionId).then(tx => tx ?? null),
  );
  // 추천은 홈이 보이는 동안 늦게 올 수 있어 구독한다
  const inbox = useQuery(`entry:inbox:${inboxId}`, async db => {
    if (inboxId === undefined) return null;
    const items = await inboxView(db, visibleExpenseCategories(await allCategories(db)));
    return items.find(item => item.id === inboxId) ?? null;
  });
  if (!lists || editing === undefined || inbox === undefined) return null;

  const fixedItem = lists.fixedCosts.find(item => item.id === fixedCostId);
  return (
    <EntryForm
      initial={initialValues(editing, fixedItem, inbox, today)}
      editingId={editing?.id}
      fixedItem={fixedItem}
      inbox={inbox ?? undefined}
      today={today}
      categories={lists.categories}
      reasonTags={lists.reasonTags}
      fixedCosts={lists.fixedCosts}
    />
  );
}

type Values = Omit<TransactionInput, 'amount' | 'categoryId' | 'isFixed'> & {
  isFixed: boolean;
  /** 쉼표 없는 숫자 문자열 */
  amount: string;
  categoryId: number | undefined;
};

function initialValues(
  tx: TransactionRow | null,
  item: FixedCostRow | undefined,
  inbox: InboxItem | null,
  today: string,
): Values {
  if (tx) return { ...tx, amount: String(tx.amount) };
  // 금액·날짜·가맹점은 알림의 사실이고 결제수단은 카드다. 이유와 만족도는 회고의 재료라 비운다(PRD 4.9)
  if (inbox) {
    return {
      type: 'expense',
      amount: inbox.amount !== null ? String(inbox.amount) : '',
      date: inbox.date ?? today,
      categoryId: inbox.suggestion?.categoryId,
      reasonTagId: null,
      satisfaction: null,
      memo: inbox.merchant,
      paymentMethod: 'card',
      isFixed: false,
      fixedCostId: null,
    };
  }
  if (item) {
    return {
      type: 'expense',
      amount: String(item.amount),
      date: paymentDate(item.dayOfMonth, today.slice(0, 7)),
      categoryId: item.categoryId,
      reasonTagId: null,
      satisfaction: null,
      memo: item.name,
      paymentMethod: item.paymentMethod,
      isFixed: true,
      fixedCostId: item.id,
    };
  }
  return {
    type: 'expense',
    amount: '',
    date: today,
    categoryId: undefined,
    reasonTagId: null,
    satisfaction: null,
    memo: null,
    paymentMethod: null,
    isFixed: false,
    fixedCostId: null,
  };
}

function EntryForm({
  initial,
  editingId,
  fixedItem,
  inbox,
  today,
  categories,
  reasonTags,
  fixedCosts,
}: {
  initial: Values;
  editingId: number | undefined;
  fixedItem: FixedCostRow | undefined;
  inbox: InboxItem | undefined;
  today: string;
  categories: CategoryRow[];
  reasonTags: ReasonTagRow[];
  fixedCosts: FixedCostRow[];
}) {
  const navigation = useNavigation();
  const [values, setValues] = useState(initial);
  const [more, setMore] = useState(false);
  // 펼치면 펼친 줄을 시트 위쪽으로 올려 새로 생긴 항목이 보이게 한다(DESIGN.md 4.3)
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const toggleY = useRef(0);
  // 가운데가 넘쳐 스크롤되는지. 키보드가 뜬 접힌 시트도 넘친다(날짜 줄이 잘린다, 5차 검증 020)
  const scrollHeight = useRef(0);
  const contentHeight = useRef(0);
  const [overflow, setOverflow] = useState(false);
  const measure = () => setOverflow(contentHeight.current > scrollHeight.current + 1);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<{ focus(): void; blur(): void }>(null);
  const set = (patch: Partial<Values>) => setValues(v => ({ ...v, ...patch }));

  const expense = values.type === 'expense';
  // 숨긴 카테고리는 고르지 않지만, 수정하는 거래가 이미 쓰고 있으면 보인다
  const categoryOptions = categories
    .filter(c => c.type === values.type && (!c.hidden || c.id === initial.categoryId))
    .map(c => ({ value: c.id, label: c.name }));
  const tagOptions = reasonTags
    .filter(t => !t.hidden || t.id === initial.reasonTagId)
    .map(t => ({ value: t.id, label: t.name }));
  const fixedOptions = fixedCosts
    .filter(f => !f.hidden || f.id === initial.fixedCostId)
    .map(f => ({ value: f.id, label: f.name }));

  // 카드 알림의 추천은 시트를 연 뒤에 올 수 있다. 아직 고르지 않았으면 추천을 고른 것으로 본다
  const categoryId = values.categoryId ?? (expense ? inbox?.suggestion?.categoryId : undefined);
  const missing =
    values.amount === ''
      ? '금액을 입력해 주세요'
      : categoryOptions.some(o => o.value === categoryId)
        ? ''
        : '카테고리를 골라 주세요';
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const memo = values.memo ?? '';
  const suggestions = useQuery(`memo:${values.type}:${memo}`, db =>
    memoSuggestions(db, memo, values.type),
  );

  // 새 기록은 금액 칸에서 시작한다. 시트가 열리면 숫자 키패드가 바로 뜬다(DESIGN.md 4.3)
  useEffect(() => {
    if (editingId === undefined && fixedItem === undefined && inbox === undefined) {
      const timer = setTimeout(() => amountRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
  }, [editingId, fixedItem, inbox]);

  // 입력이 있는 채로 닫기·뒤로 가기를 하면 버릴지 묻는다(DESIGN.md 4.3)
  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert('입력을 버릴까요?', '저장하지 않은 내용이 사라져요.', [
      { text: '계속 입력', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const switchType = (type: Values['type'] | undefined) => {
    if (!type || type === values.type) return;
    // 수입으로 바꾸면 카테고리 선택이 비고 지출 전용 항목이 사라진다
    set({
      type,
      categoryId: undefined,
      reasonTagId: null,
      satisfaction: null,
      isFixed: false,
      fixedCostId: null,
    });
  };

  const pickMemo = async (suggestion: string) => {
    set({ memo: suggestion });
    // 같은 메모를 전에 고른 카테고리로 채운다(PRD 4.1)
    const categoryId = await read(db => lastCategoryForMemo(db, suggestion, values.type));
    if (categoryId !== undefined && categoryOptions.some(o => o.value === categoryId))
      set({ categoryId });
  };

  const save = async () => {
    if (missing !== '' || categoryId === undefined) return;
    setSaving(true);
    const input: TransactionInput = {
      ...values,
      amount: Number(values.amount),
      categoryId,
      memo: values.memo?.trim() ? values.memo.trim() : null,
    };
    await mutate(async db => {
      // 폼이 보인 추천을 함께 남긴다. 추천을 고치지 않고 저장한 비율이 정확도다(PRD 4.9)
      if (inbox) await saveFromInbox(db, inbox.id, input, inbox.suggestion);
      else if (editingId === undefined) await addTransaction(db, input);
      else await updateTransaction(db, editingId, input);
    });
    navigation.goBack();
  };

  const skip = async () => {
    if (!inbox) return;
    setSaving(true);
    await mutate(db => dismissInbox(db, inbox.id));
    navigation.goBack();
  };

  const remove = () => {
    if (editingId === undefined) return;
    Alert.alert('이 기록을 지울까요?', '지운 기록은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          await mutate(db => deleteTransaction(db, editingId));
          navigation.goBack();
        },
      },
    ]);
  };

  // 카드 알림은 가맹점이 제목이다. 고정비 시트의 항목 이름과 같다(7차 047)
  const title = inbox
    ? `${inbox.merchant ?? '카드 결제'} 기록`
    : fixedItem
      ? `${fixedItem.name} 기록`
      : `${expense ? '지출' : '수입'} ${editingId === undefined ? '기록' : '수정'}`;
  const yesterday = addDays(today, -1);
  const dateChoice =
    values.date === today ? 'today' : values.date === yesterday ? 'yesterday' : 'other';
  const otherLabel =
    dateChoice === 'other'
      ? `${Number(values.date.slice(5, 7))}월 ${Number(values.date.slice(8))}일`
      : '다른 날';
  const summary = [
    values.reasonTagId !== null && tagOptions.find(t => t.value === values.reasonTagId)?.label,
    values.satisfaction !== null && SATISFACTION.find(s => s.value === values.satisfaction)?.label,
    memo.trim() || undefined,
    values.paymentMethod !== null &&
      PAYMENT_METHODS.find(p => p.value === values.paymentMethod)?.label,
    values.isFixed && (values.fixedCostId !== null ? '고정비 연결' : '고정비'),
  ].filter((s): s is string => typeof s === 'string');

  // 저장할 수 있으면 어느 날짜로 저장하는지 쓴다. 키보드가 뜨면 날짜 칩이 가려져도 기본값(오늘)이 보인다
  const dateText =
    dateChoice === 'today' ? '오늘' : dateChoice === 'yesterday' ? '어제' : otherLabel;
  const status = missing !== '' ? missing : `${dateText} 날짜로 저장해요`;

  const footer = (
    // 가운데가 넘쳐 스크롤되면 아래 버튼 영역과의 경계를 긋는다. 잘린 칸이 없는 칸처럼 보이지 않게 한다
    <View className={cn('gap-2 px-6 pb-4 pt-3', overflow && 'border-t border-border')}>
      {/*
        저장이 안 되는 이유가 바뀌면 스크린 리더가 조용히 알린다. 접근성 prop만 가진 View는 New Architecture가
        평탄화해 live region이 사라지므로 collapsable={false}로 네이티브 뷰를 남긴다(DESIGN.md 3.7)
      */}
      <View accessibilityLiveRegion='polite' collapsable={false}>
        <Text size='sm' tone='muted'>
          {status}
        </Text>
      </View>
      {/* 카드 알림은 거래로 남기지 않을 수 있다. 겹친 기록 안내가 가리키는 버튼이라 저장 옆에 둔다(7차 037) */}
      <Stack direction='row' className='gap-2'>
        {inbox && (
          <Button
            label='기록 안 함'
            variant='secondary'
            size='lg'
            onPress={skip}
            disabled={saving}
          />
        )}
        <Button
          label='저장'
          size='lg'
          disabled={missing !== '' || saving}
          onPress={save}
          className='flex-1'
        />
      </Stack>
    </View>
  );

  return (
    <Sheet title={title} onClose={() => navigation.goBack()} expanded={more} footer={footer}>
      <ScrollView
        ref={scrollRef}
        onLayout={event => {
          scrollHeight.current = event.nativeEvent.layout.height;
          measure();
        }}
        onContentSizeChange={(_, height) => {
          contentHeight.current = height;
          measure();
        }}
        className={more ? 'flex-1' : 'shrink grow-0'}
        contentContainerClassName='gap-6 px-6 pb-4 pt-2'
        keyboardShouldPersistTaps='handled'
      >
        <Stack className='gap-1'>
          <Label htmlFor='amount'>금액</Label>
          <Stack direction='row' align='center' className='gap-2'>
            <Input
              ref={amountRef}
              id='amount'
              label='금액'
              kind='number'
              size='lg'
              value={amountText(values.amount)}
              onValueChange={text => set({ amount: editAmount(values.amount, text) })}
              // placeholder는 두지 않는다. 라벨이 칸의 뜻을 말한다(DESIGN.md 4.3)
              className='flex-1 text-2xl tabular-nums'
            />
            <Text size='lg'>원</Text>
          </Stack>
        </Stack>

        <Stack className='gap-2'>
          <Choices
            label='카테고리'
            options={categoryOptions}
            value={categoryId}
            onChange={categoryId => categoryId !== undefined && set({ categoryId })}
          />
          {inbox?.suggestion && (
            <SuggestionNote suggestion={inbox.suggestion} categories={categories} />
          )}
          {inbox?.maybeDuplicate && (
            <Prose size='sm' tone='muted'>
              같은 날 같은 금액의 지출이 이미 있어요. 같은 결제라면 기록 안 함을 눌러 주세요
            </Prose>
          )}
        </Stack>

        <Stack className='gap-2'>
          <Label>날짜</Label>
          <Stack direction='row' wrap className='gap-3'>
            <Chip
              label='오늘'
              selected={dateChoice === 'today'}
              onPress={() => set({ date: today })}
            />
            <Chip
              label='어제'
              selected={dateChoice === 'yesterday'}
              onPress={() => set({ date: yesterday })}
            />
            <Chip
              label={otherLabel}
              selected={dateChoice === 'other'}
              onPress={() => setPicking(true)}
            />
          </Stack>
        </Stack>
        {picking && (
          <DateTimePicker
            value={new Date(`${values.date}T12:00:00`)}
            mode='date'
            maximumDate={new Date(`${today}T12:00:00`)}
            onValueChange={(_, date) => {
              setPicking(false);
              set({ date: toLocalDate(date) });
            }}
            onDismiss={() => setPicking(false)}
          />
        )}

        <Pressable
          accessibilityRole='button'
          accessibilityState={{ expanded: more }}
          onLayout={event => {
            toggleY.current = event.nativeEvent.layout.y;
          }}
          onPress={() => {
            if (more) {
              setMore(false);
              return;
            }
            Keyboard.dismiss();
            setMore(true);
            // 시트가 커진 뒤에 스크롤한다
            setTimeout(
              () => scrollRef.current?.scrollTo({ y: toggleY.current, animated: true }),
              100,
            );
          }}
          className='-mx-6 flex-row items-center gap-3 px-6 py-3 active:bg-surface-hover'
        >
          <Stack className='flex-1 gap-1'>
            <Text>{more ? '선택 항목 접기' : '선택 항목 더 보기'}</Text>
            <Prose size='sm' tone='muted'>
              {summary.length > 0
                ? summary.join(' · ')
                : expense
                  ? '구분 · 이유 · 만족도 · 메모 · 결제수단 · 고정비'
                  : '구분 · 메모 · 결제수단'}
            </Prose>
          </Stack>
          <Icon name={more ? 'chevron-up' : 'chevron-down'} tone='muted' />
        </Pressable>

        {more && (
          <>
            <Choices
              label='구분'
              options={[
                { value: 'expense', label: '지출' },
                { value: 'income', label: '수입' },
              ]}
              value={values.type}
              onChange={switchType}
            />
            {expense && (
              <Choices
                label='이유'
                options={tagOptions}
                value={values.reasonTagId ?? undefined}
                onChange={reasonTagId => set({ reasonTagId: reasonTagId ?? null })}
                optional
              />
            )}
            {expense && (
              <Choices
                label='만족도'
                options={SATISFACTION}
                value={values.satisfaction ?? undefined}
                onChange={satisfaction => set({ satisfaction: satisfaction ?? null })}
                optional
              />
            )}
            <Stack className='gap-2'>
              <Stack className='gap-1'>
                <Label htmlFor='memo'>메모</Label>
                <Input
                  id='memo'
                  label='메모'
                  size='lg'
                  value={memo}
                  onValueChange={text => set({ memo: text })}
                />
              </Stack>
              {suggestions && suggestions.length > 0 && (
                <Stack direction='row' wrap className='gap-3'>
                  {suggestions.map(suggestion => (
                    <Chip
                      key={suggestion}
                      label={suggestion}
                      onPress={() => pickMemo(suggestion)}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
            <Choices
              label='결제수단'
              options={PAYMENT_METHODS}
              value={values.paymentMethod ?? undefined}
              onChange={paymentMethod => set({ paymentMethod: paymentMethod ?? null })}
              optional
            />
            {expense && (
              <SwitchRow
                label='고정비'
                description='월세·구독처럼 매달 나가는 지출이에요. 켜면 등록한 항목에 연결해요'
                value={values.isFixed}
                onChange={isFixed =>
                  set({ isFixed, fixedCostId: isFixed ? values.fixedCostId : null })
                }
              >
                <Switch
                  value={values.isFixed}
                  onValueChange={isFixed =>
                    set({ isFixed, fixedCostId: isFixed ? values.fixedCostId : null })
                  }
                  accessibilityElementsHidden
                  importantForAccessibility='no-hide-descendants'
                />
              </SwitchRow>
            )}
            {expense && values.isFixed && fixedOptions.length > 0 && (
              <Choices
                label='연결할 고정비 항목'
                options={fixedOptions}
                value={values.fixedCostId ?? undefined}
                onChange={fixedCostId => set({ fixedCostId: fixedCostId ?? null })}
                optional
              />
            )}
          </>
        )}
        {/* 수정할 때만. 선택 항목을 펼치지 않아도 찾을 수 있게 접힘 밖에 둔다(5차 030) */}
        {editingId !== undefined && (
          <Button label='삭제' variant='danger' onPress={remove} className='self-start' />
        )}
      </ScrollView>
    </Sheet>
  );
}

/** 추천이 어디서 왔는지(PRD 4.9). 전에 적은 가맹점이면 그 사실을, 기기 안 모델이면 확인을 부탁한다 */
function SuggestionNote({
  suggestion,
  categories,
}: {
  suggestion: NonNullable<InboxItem['suggestion']>;
  categories: CategoryRow[];
}) {
  const name = categories.find(c => c.id === suggestion.categoryId)?.name ?? '카테고리';
  return (
    <Prose size='sm' tone='muted'>
      {suggestion.source === 'exact'
        ? render('전에 이 가맹점을 {name}에 적었어요', { name })
        : render('{name}{은/는} 기기 안 모델의 추천이에요. 맞는지 확인해 주세요', { name })}
    </Prose>
  );
}
