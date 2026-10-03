import { Button, Card, Input, Label, Stack, Text } from '@eeennsu/native';
import { type StaticScreenProps, useNavigation } from '@react-navigation/native';
import { useLayoutEffect, useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import {
  type FixedCostInput,
  type FixedCostRow,
  addFixedCost,
  setFixedCostHidden,
  updateFixedCost,
} from '../db/lists';
import { amountText, editAmount } from '../domain/entry';
import { render } from '../retro/render';
import { mutate } from '../state/data';
import { PAYMENT_METHODS, useLists } from '../state/lists';
import { FormFrame } from '../ui/keyboard';
import { Choices } from '../ui/layout';
import { Prose } from '../ui/prose';

/** 고정비 항목 추가·수정(PRD 4.4). 이름, 예상 금액, 카테고리, 결제일(매월 N일), 결제수단 */
export function FixedCostEditScreen({ route }: StaticScreenProps<{ id?: number } | undefined>) {
  const lists = useLists();
  if (!lists) return null;
  const item = lists.fixedCosts.find(f => f.id === route.params?.id);
  const categories = lists.categories
    .filter(c => c.type === 'expense' && (!c.hidden || c.id === item?.categoryId))
    .map(c => ({ value: c.id, label: c.name }));
  return <Form item={item} categories={categories} />;
}

function Form({
  item,
  categories,
}: {
  item: FixedCostRow | undefined;
  categories: Array<{ value: number; label: string }>;
}) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title: item ? '고정비 항목' : '고정비 항목 추가' });
  }, [navigation, item]);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [categoryId, setCategoryId] = useState(item?.categoryId);
  const [day, setDay] = useState(item ? String(item.dayOfMonth) : '');
  const [paymentMethod, setPaymentMethod] = useState(item?.paymentMethod ?? undefined);

  const dayNumber = Number(day);
  const missing = !name.trim()
    ? '이름을 입력해 주세요'
    : !amount
      ? '예상 금액을 입력해 주세요'
      : categoryId === undefined
        ? '카테고리를 골라 주세요'
        : !(dayNumber >= 1 && dayNumber <= 31)
          ? '결제일은 1~31일이에요'
          : '';

  const save = async () => {
    if (missing || categoryId === undefined) return;
    const input: FixedCostInput = {
      name: name.trim(),
      amount: Number(amount),
      categoryId,
      dayOfMonth: dayNumber,
      paymentMethod: paymentMethod ?? null,
    };
    await mutate(async db => {
      if (item) await updateFixedCost(db, item.id, input);
      else await addFixedCost(db, input);
    });
    navigation.goBack();
  };

  const toggleHidden = () => {
    if (!item) return;
    if (item.hidden) {
      void mutate(db => setFixedCostHidden(db, item.id, false)).then(() => navigation.goBack());
      return;
    }
    Alert.alert(
      '이 항목을 해지할까요?',
      // 이름의 받침에 맞는 조사는 회고 렌더러가 고른다
      render('{name}{은/는} 홈에서 더 확인하지 않아요. 지난 기록은 그대로 남아요.', {
        name: item.name,
      }),
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해지',
          style: 'destructive',
          onPress: () =>
            void mutate(db => setFixedCostHidden(db, item.id, true)).then(() =>
              navigation.goBack(),
            ),
        },
      ],
    );
  };

  return (
    <FormFrame>
      <ScrollView
        className='flex-1'
        contentContainerClassName='gap-3 px-4 pb-8 pt-1'
        keyboardShouldPersistTaps='handled'
      >
        <Card className='gap-6'>
          <Stack className='gap-1'>
            <Label htmlFor='name'>이름</Label>
            <Input id='name' label='이름' size='lg' value={name} onValueChange={setName} />
          </Stack>
          <Stack className='gap-1'>
            <Label htmlFor='amount'>예상 금액</Label>
            <Stack direction='row' align='center' className='gap-2'>
              <Input
                id='amount'
                label='예상 금액'
                kind='number'
                size='lg'
                value={amountText(amount)}
                onValueChange={text => setAmount(editAmount(amount, text))}
                className='flex-1 text-xl tabular-nums'
              />
              <Text>원</Text>
            </Stack>
            <Prose size='sm' tone='muted'>
              입력 폼의 기본값으로만 써요. 실제 금액은 기록할 때 고쳐요
            </Prose>
          </Stack>
          <Choices
            label='카테고리'
            options={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
          <Stack className='gap-1'>
            <Label htmlFor='day'>결제일</Label>
            <Stack direction='row' align='center' className='gap-2'>
              <Text>매월</Text>
              <Input
                id='day'
                label='결제일'
                kind='number'
                size='lg'
                value={day}
                onValueChange={text => setDay(text.replace(/\D/g, '').slice(0, 2))}
                className='w-20 tabular-nums'
              />
              <Text>일</Text>
            </Stack>
            <Prose size='sm' tone='muted'>
              그 달에 없는 날이면(2월 30일) 말일로 봐요
            </Prose>
          </Stack>
          <Choices
            label='결제수단'
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={setPaymentMethod}
            optional
          />
        </Card>
        {item && (
          <Button
            label={item.hidden ? '다시 쓰기' : '해지'}
            variant={item.hidden ? 'secondary' : 'danger'}
            onPress={toggleHidden}
            className='self-start'
          />
        )}
      </ScrollView>
      <View className='px-4 pb-4 pt-3'>
        <View accessibilityLiveRegion='polite' collapsable={false}>
          {missing !== '' && (
            <Text size='sm' tone='muted' className='pb-2'>
              {missing}
            </Text>
          )}
        </View>
        <Button
          label='저장'
          size='lg'
          disabled={missing !== ''}
          onPress={save}
          className='w-full'
        />
      </View>
    </FormFrame>
  );
}
