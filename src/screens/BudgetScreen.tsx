import { Button, Card, Input, Label, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native-css/components';

import { type BudgetRow, allBudgets, setBudget } from '../db/budgets';
import type { CategoryRow } from '../db/lists';
import { budgetForMonth } from '../domain/budget';
import { amountText, editAmount } from '../domain/entry';
import { formatWon } from '../domain/format';
import { mutate, useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { FormFrame } from '../ui/keyboard';

/**
 * 예산(PRD 4.3). 월 총예산과 선택형 카테고리 예산. 이번 달부터 적용하고 다음 달에도 이어 쓴다.
 * 지난 달의 예산은 고치지 않는다(지난 회고의 기준이 바뀌지 않게)
 */
export function BudgetScreen() {
  const today = useToday();
  const lists = useLists();
  const budgets = useQuery('budgets', allBudgets);
  if (!lists || !budgets) return null;
  const month = today.slice(0, 7);
  return (
    <BudgetForm
      month={month}
      current={budgetForMonth(budgets, month)}
      categories={lists.categories.filter(c => c.type === 'expense' && !c.hidden)}
    />
  );
}

function BudgetForm({
  month,
  current,
  categories,
}: {
  month: string;
  current: BudgetRow | undefined;
  categories: CategoryRow[];
}) {
  const navigation = useNavigation();
  const [total, setTotal] = useState(current ? String(current.total) : '');
  const [perCategory, setPerCategory] = useState<Record<number, string>>(() =>
    Object.fromEntries((current?.categoryBudgets ?? []).map(c => [c.categoryId, String(c.amount)])),
  );
  const categorySum = Object.values(perCategory).reduce((n, v) => n + Number(v || 0), 0);
  const invalid = total === '' || Number(total) <= 0;

  const save = async () => {
    if (invalid) return;
    const categoryBudgets = Object.entries(perCategory)
      .filter(([, value]) => Number(value) > 0)
      .map(([id, value]) => ({ categoryId: Number(id), amount: Number(value) }));
    await mutate(db => setBudget(db, month, Number(total), categoryBudgets));
    navigation.goBack();
  };

  return (
    <FormFrame>
      <ScrollView
        className='flex-1'
        contentContainerClassName='gap-3 px-4 pb-8 pt-1'
        keyboardShouldPersistTaps='handled'
      >
        <Card className='gap-6'>
          <Text size='sm' tone='muted'>
            {`${Number(month.slice(5))}월부터 적용하고 다음 달에도 이어 써요. 지난 달의 예산은 바뀌지 않아요. 고정비는 예산에 넣지 않아요`}
          </Text>
          <Stack className='gap-1'>
            <Label htmlFor='total'>월 예산</Label>
            <Stack direction='row' align='center' className='gap-2'>
              <Input
                id='total'
                label='월 예산'
                kind='number'
                size='lg'
                value={amountText(total)}
                onValueChange={text => setTotal(editAmount(total, text))}
                className='flex-1 text-xl tabular-nums'
              />
              <Text size='lg'>원</Text>
            </Stack>
          </Stack>
        </Card>
        <Card className='gap-4'>
          <Stack className='gap-1'>
            <Text heading='2' size='lg'>
              카테고리 예산
            </Text>
            <Text size='sm' tone='muted'>
              정하고 싶은 카테고리만 적어요. 비우면 그 카테고리는 예산이 없어요
            </Text>
          </Stack>
          {categories.map(category => {
            const value = perCategory[category.id] ?? '';
            return (
              <Stack key={category.id} direction='row' align='center' className='gap-3'>
                <Label htmlFor={`category-${category.id}`} className='w-24'>
                  {category.name}
                </Label>
                <Input
                  id={`category-${category.id}`}
                  label={`${category.name} 예산`}
                  kind='number'
                  value={amountText(value)}
                  onValueChange={text =>
                    setPerCategory(p => ({ ...p, [category.id]: editAmount(value, text) }))
                  }
                  className='flex-1 tabular-nums'
                />
                <Text>원</Text>
              </Stack>
            );
          })}
          {categorySum > Number(total || 0) && Number(total) > 0 && (
            <Text size='sm' tone='muted' className='tabular-nums'>
              {`카테고리 예산의 합(${formatWon(categorySum)})이 월 예산보다 커요`}
            </Text>
          )}
        </Card>
      </ScrollView>
      <View className='px-4 pb-4 pt-3'>
        <View accessibilityLiveRegion='polite' collapsable={false}>
          {invalid && (
            <Text size='sm' tone='muted' className='pb-2'>
              월 예산을 입력해 주세요
            </Text>
          )}
        </View>
        <Button label='저장' size='lg' disabled={invalid} onPress={save} className='w-full' />
      </View>
    </FormFrame>
  );
}
