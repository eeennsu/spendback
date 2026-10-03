import { Button, Card, Chip, Input, Label, Stack, Text } from '@eeennsu/native';
import { useRoute } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch } from 'react-native-css/components';

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
import { IconButton } from '../ui/chrome';
import { FormFrame } from '../ui/keyboard';
import { Row } from '../ui/layout';
import { Prose } from '../ui/prose';

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
        {/* 무엇을 할 수 있는지 목록보다 먼저 말한다 */}
        <Prose size='sm' tone='muted'>
          연필을 누르면 이름을 바꿔요. 스위치를 끈 항목은 입력에서 빠지고, 지난 기록과 회고에는
          그대로 남아요
        </Prose>
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
  const input = useRef<{ focus(): void; blur(): void }>(null);
  // 연필을 누른 손이 떨어진 뒤에 포커스해야 키보드가 뜬다(바로 하면 칸만 포커스되고 키보드가 안 떴다, 에뮬레이터)
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [editing]);
  const trimmed = name.trim();
  const error = !trimmed ? '이름을 입력해 주세요' : taken(trimmed) ? '같은 이름이 있어요' : '';

  if (editing) {
    return (
      <Stack className='gap-2 py-2'>
        <Label htmlFor={`rename-${item.id}`}>새 이름</Label>
        <Input
          ref={input}
          id={`rename-${item.id}`}
          label={`${item.name} 새 이름`}
          value={name}
          onValueChange={setName}
          size='lg'
        />
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
  // 동작이 둘(이름 바꾸기, 입력에 보이기)이라 줄 전체를 스위치로 만들지 않고 컨트롤마다 이름을 준다(DESIGN.md 3.7)
  return (
    <Row compact>
      <Text tone={item.hidden ? 'muted' : 'default'} className='flex-1'>
        {item.hidden ? `${item.name} · 숨김` : item.name}
      </Text>
      <IconButton
        icon='pencil'
        label={`${item.name} 이름 바꾸기`}
        onPress={() => setEditing(true)}
      />
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
      <Label htmlFor='new-name'>{label}</Label>
      <Stack direction='row' align='center' className='gap-3'>
        <Input
          id='new-name'
          label={label}
          value={name}
          onValueChange={setName}
          size='lg'
          className='flex-1'
        />
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
