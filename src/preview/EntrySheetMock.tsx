import { Button, Input, Label, Stack, Text, cn } from '@eeennsu/native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native-css/components';

import { Chip } from '../ui/Chip';
import { HomeMock } from './HomeMock';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  REASON_TAGS,
  SATISFACTION,
  fixedCostItems,
  memoSuggestions,
} from './fixtures';

type EntrySheetMockProps = {
  /** 선택 항목을 펼친 채로 시작한다 */
  expanded?: boolean;
};

const DATES = ['오늘', '어제', '다른 날'] as const;

// 시안용 표시 변환. 실제 금액 포맷터는 도메인 계층에서 TDD로 만든다(PRD 12장 4번).
const onlyDigits = (text: string) => text.replace(/\D/g, '').replace(/^0+/, '');
const withCommas = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 입력 시트 시안(PRD 4.1, docs/DESIGN.md 4장). 금액 → 카테고리 → 저장, 3번에 끝나도록 필수 항목만
 * 먼저 보이고 나머지는 "선택 항목"으로 접는다. 실제 시트는 React Navigation의 formSheet로 띄운다.
 */
export function EntrySheetMock({ expanded = false }: EntrySheetMockProps) {
  const [amount, setAmount] = useState('9500');
  const [kind, setKind] = useState<'지출' | '수입'>('지출');
  const [category, setCategory] = useState('식비');
  const [date, setDate] = useState('오늘');
  const [more, setMore] = useState(expanded);
  const [reason, setReason] = useState('');
  const [satisfaction, setSatisfaction] = useState('');
  const [memo, setMemo] = useState('');
  const [payment, setPayment] = useState('');
  const [fixed, setFixed] = useState(false);
  const [fixedItem, setFixedItem] = useState('');
  // KeyboardAvoidingView는 자기 layout(부모 기준)과 키보드 위치(창 기준)를 비교한다. 이 화면이 창 맨 위에서
  // 떨어진 만큼을 keyboardVerticalOffset으로 넘겨야 키보드가 가리는 높이를 제대로 잰다.
  const [windowTop, setWindowTop] = useState(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);

  const amountRef = useRef<{ focus(): void; blur(): void }>(null);

  const expense = kind === '지출';
  const categories: readonly string[] = expense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const missing =
    amount === ''
      ? '금액을 입력해 주세요'
      : categories.includes(category)
        ? ''
        : '카테고리를 골라 주세요';

  // 새 기록은 금액 칸에서 시작한다. 시트가 열리면 숫자 키패드가 바로 뜬다(docs/DESIGN.md 4.3).
  useEffect(() => {
    if (!expanded) amountRef.current?.focus();
  }, [expanded]);

  const switchKind = (next: string) => {
    if (next !== '지출' && next !== '수입') return;
    setKind(next);
    setCategory('');
  };

  return (
    <View
      ref={rootRef}
      className='flex-1'
      onLayout={() => rootRef.current?.measureInWindow((_x, y) => setWindowTop(y))}
    >
      {/* 시트 뒤의 부모 화면. 시트가 떠 있는 동안 스크린 리더가 읽지 않는다 */}
      <View
        className='flex-1'
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
      >
        <HomeMock />
      </View>
      <View className='absolute inset-0 bg-overlay' />

      {/*
        키보드가 뜨면 시트를 그만큼 올린다. edge-to-edge(Android 15+)에서는 창이 줄지 않아 직접 비켜야 한다.
        시트는 화면 높이를 넘지 않고, 넘치는 만큼 가운데 스크롤이 줄어 제목과 저장이 늘 보인다.
      */}
      <KeyboardAvoidingView
        behavior='padding'
        keyboardVerticalOffset={windowTop}
        pointerEvents='box-none'
        className='absolute inset-0 justify-end'
      >
        <View
          accessibilityViewIsModal
          className={cn(
            // 다크에서는 시트(gray-900)와 scrim 아래 배경의 대비가 1.2:1이라 테두리로 경계를 긋는다
            'max-h-full rounded-t-lg bg-surface pt-2 dark:border dark:border-border',
            more && 'mt-12 flex-1',
          )}
        >
          <View className='h-1 w-12 self-center rounded-full bg-border' />

          <Stack direction='row' align='center' justify='between' className='gap-3 px-4 pb-2 pt-3'>
            <Text heading='1' size='xl'>
              {expense ? '지출 기록' : '수입 기록'}
            </Text>
            {/* min-h-12·active:opacity-80은 DS 0.3.0이 Button에 넣으면 지운다(docs/DESIGN.md 5.2) */}
            <Button
              label='닫기'
              icon='x'
              variant='ghost'
              size='sm'
              className='min-h-12 active:opacity-80'
            />
          </Stack>

          <ScrollView
            className={more ? 'flex-1' : 'shrink grow-0'}
            contentContainerClassName='gap-6 px-4 pb-4 pt-2'
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
                  value={withCommas(amount)}
                  onValueChange={text => setAmount(onlyDigits(text))}
                  // placeholder는 DS 0.2.0에서 플랫폼 기본색(흰 표면 위 약 2.7:1)이라 두지 않는다.
                  // focus:는 DS 0.3.0이 Input에 넣으면 지운다(docs/DESIGN.md 5.2)
                  className='flex-1 text-2xl tabular-nums focus:border-border-focus'
                />
                <Text size='lg'>원</Text>
              </Stack>
            </Stack>

            <Choices
              label='카테고리'
              options={categories}
              value={category}
              onChange={setCategory}
            />
            <Choices label='날짜' options={DATES} value={date} onChange={setDate} />

            <Pressable
              accessibilityRole='button'
              accessibilityState={{ expanded: more }}
              onPress={() => setMore(open => !open)}
              className='-mx-4 gap-1 px-4 py-3 active:bg-surface-hover'
            >
              <Text>{more ? '선택 항목 접기' : '선택 항목 더 보기'}</Text>
              <Text size='sm' tone='muted'>
                {expense
                  ? '구분 · 이유 · 만족도 · 메모 · 결제수단 · 고정비'
                  : '구분 · 메모 · 결제수단'}
              </Text>
            </Pressable>

            {more && (
              <>
                <Choices
                  label='구분'
                  options={['지출', '수입']}
                  value={kind}
                  onChange={switchKind}
                />
                {expense && (
                  <Choices
                    label='이유'
                    options={REASON_TAGS}
                    value={reason}
                    onChange={setReason}
                    optional
                  />
                )}
                {expense && (
                  <Choices
                    label='만족도'
                    options={SATISFACTION}
                    value={satisfaction}
                    onChange={setSatisfaction}
                    optional
                  />
                )}
                <Stack className='gap-2'>
                  <Stack className='gap-1'>
                    <Label htmlFor='memo'>메모</Label>
                    <Input
                      id='memo'
                      label='메모'
                      value={memo}
                      onValueChange={setMemo}
                      className='focus:border-border-focus'
                    />
                  </Stack>
                  <Stack direction='row' wrap className='gap-3'>
                    {memoSuggestions.map(suggestion => (
                      <Chip
                        key={suggestion}
                        label={suggestion}
                        selected={suggestion === memo}
                        onPress={() => {
                          // 같은 메모를 전에 고른 카테고리로 채운다(PRD 4.1). 시안에서는 식비로 둔다.
                          setMemo(suggestion);
                          setCategory('식비');
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>
                <Choices
                  label='결제수단'
                  options={PAYMENT_METHODS}
                  value={payment}
                  onChange={setPayment}
                  optional
                />
                {expense && (
                  // 글자를 눌러도 켜진다. 스위치는 모양만 맡고 스크린 리더는 줄 하나를 읽는다
                  <Pressable
                    accessibilityRole='switch'
                    accessibilityLabel='고정비'
                    accessibilityState={{ checked: fixed }}
                    onPress={() => setFixed(on => !on)}
                    className='-mx-4 flex-row items-center justify-between gap-3 px-4 py-3 active:bg-surface-hover'
                  >
                    <Stack className='flex-1 gap-1'>
                      <Text>고정비</Text>
                      <Text size='sm' tone='muted'>
                        월세·구독처럼 매달 나가는 지출이에요. 켜면 등록한 항목에 연결해요
                      </Text>
                    </Stack>
                    <Switch
                      value={fixed}
                      onValueChange={setFixed}
                      accessibilityElementsHidden
                      importantForAccessibility='no-hide-descendants'
                    />
                  </Pressable>
                )}
                {expense && fixed && (
                  <Choices
                    label='연결할 고정비 항목'
                    options={fixedCostItems}
                    value={fixedItem}
                    onChange={setFixedItem}
                  />
                )}
              </>
            )}
          </ScrollView>

          <View className='gap-2 border-t border-border px-4 pb-4 pt-3'>
            {/* 저장이 안 되는 이유가 바뀌면 스크린 리더가 조용히 알린다 */}
            <View accessibilityLiveRegion='polite'>
              {missing !== '' && (
                <Text size='sm' tone='muted'>
                  {missing}
                </Text>
              )}
            </View>
            <Button
              label='저장'
              size='lg'
              disabled={missing !== ''}
              className='w-full active:opacity-80'
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * 한 가지를 고르는 칩 묶음. optional이면 고른 칩을 다시 눌러 선택을 지운다(필수 항목은 지우지 않는다).
 */
function Choices({
  label,
  options,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <Stack className='gap-2'>
      <Label>{label}</Label>
      <Stack direction='row' wrap className='gap-3'>
        {options.map(option => (
          <Chip
            key={option}
            label={option}
            selected={option === value}
            onPress={() => onChange(optional && option === value ? '' : option)}
          />
        ))}
      </Stack>
    </Stack>
  );
}
