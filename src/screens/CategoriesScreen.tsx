import { Button, Card, Chip, Input, Stack, Text } from '@eeennsu/native';
import { useRoute } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch } from 'react-native-css/components';

import {
  addCategory,
  addReasonTag,
  categoryNameTaken,
  renameCategory,
  renameReasonTag,
  setCategoryHidden,
  setReasonTagHidden,
} from '../db/lists';
import { mutate, read } from '../state/data';
import { useLists } from '../state/lists';
import { FormFrame } from '../ui/keyboard';
import { Row } from '../ui/layout';

type Item = { id: number; name: string; hidden: boolean };

/**
 * 카테고리와 이유 태그 편집(PRD 4.2). 이름을 바꾸고, 더하고, 숨긴다. 지우지 않고 숨겨서 과거 거래와 집계가 남는다.
 * 같은 화면을 이유 태그(ReasonTags)에도 쓴다
 */
export function CategoriesScreen() {
  const route = useRoute();
  const lists = useLists();
  const tags = route.name === 'ReasonTags';
  const [type, setType] = useState<'expense' | 'income'>('expense');
  if (!lists) return null;

  const items: Item[] = tags ? lists.reasonTags : lists.categories.filter(c => c.type === type);
  const names = new Set(items.map(i => i.name));

  return (
    <FormFrame>
      <ScrollView
        className='flex-1'
        contentContainerClassName='gap-3 px-4 pb-8 pt-1'
        keyboardShouldPersistTaps='handled'
      >
        {!tags && (
          <Stack direction='row' className='gap-3'>
            <Chip label='지출' selected={type === 'expense'} onPress={() => setType('expense')} />
            <Chip label='수입' selected={type === 'income'} onPress={() => setType('income')} />
          </Stack>
        )}
        <Card className='gap-1'>
          {items.map(item => (
            <EditableRow
              key={item.id}
              item={item}
              taken={name => name !== item.name && names.has(name)}
              onRename={name =>
                mutate(db =>
                  tags ? renameReasonTag(db, item.id, name) : renameCategory(db, item.id, name),
                )
              }
              onToggle={() =>
                mutate(db =>
                  tags
                    ? setReasonTagHidden(db, item.id, !item.hidden)
                    : setCategoryHidden(db, item.id, !item.hidden),
                )
              }
            />
          ))}
        </Card>
        <AddRow
          label={
            tags ? '새 이유 태그' : type === 'expense' ? '새 지출 카테고리' : '새 수입 카테고리'
          }
          onAdd={async name => {
            if (
              names.has(name) ||
              (!tags && (await read(db => categoryNameTaken(db, type, name))))
            ) {
              return '같은 이름이 있어요';
            }
            await mutate(db => (tags ? addReasonTag(db, name) : addCategory(db, type, name)));
            return '';
          }}
        />
        <Text size='sm' tone='muted'>
          이름을 누르면 바꿀 수 있어요. 스위치를 끈 항목은 입력에서 빠지고, 지난 기록과 회고에는
          그대로 남아요
        </Text>
      </ScrollView>
    </FormFrame>
  );
}

function EditableRow({
  item,
  taken,
  onRename,
  onToggle,
}: {
  item: Item;
  taken: (name: string) => boolean;
  onRename: (name: string) => Promise<unknown>;
  onToggle: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const trimmed = name.trim();
  const error = !trimmed ? '이름을 입력해 주세요' : taken(trimmed) ? '같은 이름이 있어요' : '';

  if (editing) {
    return (
      <Stack className='gap-2 py-2'>
        <Input label={`${item.name} 새 이름`} value={name} onValueChange={setName} size='lg' />
        {error !== '' && (
          <Text size='sm' tone='danger'>
            {error}
          </Text>
        )}
        <Stack direction='row' className='gap-3'>
          <Button
            label='저장'
            size='sm'
            disabled={error !== ''}
            onPress={() => void onRename(trimmed).then(() => setEditing(false))}
          />
          <Button
            label='취소'
            size='sm'
            variant='ghost'
            onPress={() => {
              setName(item.name);
              setEditing(false);
            }}
          />
        </Stack>
      </Stack>
    );
  }
  // 줄마다 같은 이름의 버튼이 생기지 않게(DESIGN.md 3.7) 이름을 누르면 바꾸고, 스위치는 이름을 붙여 읽힌다
  return (
    <Row compact>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`${item.name} 이름 바꾸기`}
        onPress={() => setEditing(true)}
        className='min-h-12 flex-1 justify-center rounded-md active:bg-surface-hover'
      >
        <Text tone={item.hidden ? 'muted' : 'default'}>
          {item.hidden ? `${item.name} · 숨김` : item.name}
        </Text>
      </Pressable>
      <Switch
        value={!item.hidden}
        onValueChange={() => void onToggle()}
        accessibilityLabel={`${item.name} 입력에 보이기`}
      />
    </Row>
  );
}

function AddRow({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<string> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <Card className='gap-2'>
      <Stack direction='row' align='center' className='gap-3'>
        <Input label={label} value={name} onValueChange={setName} size='lg' className='flex-1' />
        <Button
          label='추가'
          disabled={!name.trim()}
          onPress={async () => {
            const result = await onAdd(name.trim());
            setError(result);
            if (!result) setName('');
          }}
        />
      </Stack>
      {error !== '' && (
        <Text size='sm' tone='danger'>
          {error}
        </Text>
      )}
    </Card>
  );
}
