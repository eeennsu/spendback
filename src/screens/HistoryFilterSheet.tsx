import { Button, Chip, Label, Stack, Text } from '@eeennsu/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native-css/components';

import { toLocalDate } from '../domain/date';
import { useToday } from '../state/data';
import { useLists } from '../state/lists';
import { type HistoryFilterState, filterRange, useHistoryFilter } from '../state/ui';
import { Choices, MultiChoices } from '../ui/layout';
import { Sheet } from '../ui/sheet';

const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

/**
 * 내역 필터 시트(PRD 4.5, docs/DESIGN.md 4.4). 기간(이번 달 · 지난 달 · 직접), 지출/수입, 카테고리, 이유 태그를
 * 고르고 "적용"으로 내역에 건다
 */
export function HistoryFilterSheet() {
  const navigation = useNavigation();
  const today = useToday();
  const lists = useLists();
  const { filter, apply } = useHistoryFilter();
  const [draft, setDraft] = useState<HistoryFilterState>(() => {
    const range = filterRange(filter, today);
    return { ...filter, from: filter.from ?? range.from, to: filter.to ?? range.to };
  });
  const [picking, setPicking] = useState<'from' | 'to'>();
  if (!lists) return null;

  const set = (patch: Partial<HistoryFilterState>) => setDraft(d => ({ ...d, ...patch }));
  const categories = lists.categories
    .filter(c => !c.hidden && (draft.type === undefined || c.type === draft.type))
    .map(c => ({
      value: c.id,
      label: c.type === 'income' && draft.type === undefined ? `${c.name}(수입)` : c.name,
    }));
  const tags = lists.reasonTags.filter(t => !t.hidden).map(t => ({ value: t.id, label: t.name }));
  const from = draft.from ?? today;
  const to = draft.to ?? today;

  const footer = (
    <View className='px-6 pb-4 pt-3'>
      <Button
        label='적용'
        size='lg'
        className='w-full'
        onPress={() => {
          apply(draft.period === 'custom' ? draft : { ...draft, from: undefined, to: undefined });
          navigation.goBack();
        }}
      />
    </View>
  );

  return (
    <Sheet title='필터' onClose={() => navigation.goBack()} footer={footer}>
      <ScrollView className='shrink grow-0' contentContainerClassName='gap-6 px-6 pb-4 pt-2'>
        <Choices
          label='기간'
          options={[
            { value: 'thisMonth', label: '이번 달' },
            { value: 'lastMonth', label: '지난 달' },
            { value: 'custom', label: '직접' },
          ]}
          value={draft.period}
          onChange={period => period && set({ period })}
        />
        {draft.period === 'custom' && (
          <Stack className='gap-2'>
            <Label>범위</Label>
            <Stack direction='row' wrap align='center' className='gap-3'>
              <Chip label={md(from)} selected onPress={() => setPicking('from')} />
              <Text tone='muted'>~</Text>
              <Chip label={md(to)} selected onPress={() => setPicking('to')} />
            </Stack>
          </Stack>
        )}
        {picking && (
          <DateTimePicker
            value={new Date(`${picking === 'from' ? from : to}T12:00:00`)}
            mode='date'
            onValueChange={(_, date) => {
              setPicking(undefined);
              const picked = toLocalDate(date);
              // 시작이 끝보다 늦으면 둘을 맞춘다
              if (picking === 'from') set({ from: picked, to: picked > to ? picked : to });
              else set({ to: picked, from: picked < from ? picked : from });
            }}
            onDismiss={() => setPicking(undefined)}
          />
        )}
        <Choices
          label='구분'
          options={[
            { value: 'expense', label: '지출' },
            { value: 'income', label: '수입' },
          ]}
          value={draft.type}
          onChange={type =>
            set({
              type,
              categoryIds: [],
              reasonTagIds: type === 'income' ? [] : draft.reasonTagIds,
            })
          }
          optional
        />
        <MultiChoices
          label='카테고리'
          options={categories}
          values={draft.categoryIds}
          onChange={categoryIds => set({ categoryIds })}
        />
        {draft.type !== 'income' && (
          <MultiChoices
            label='이유 태그'
            options={tags}
            values={draft.reasonTagIds}
            onChange={reasonTagIds => set({ reasonTagIds })}
          />
        )}
      </ScrollView>
    </Sheet>
  );
}
