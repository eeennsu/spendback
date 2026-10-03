import { Card, Chip, Label, Stack, Text, cn } from '@eeennsu/native';
import type { ElementChildren } from '@eeennsu/tokens';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Prose } from './prose';

/**
 * 화면들이 같이 쓰는 조각(docs/DESIGN.md 3.3, 4.2). 섹션 하나가 카드 하나이고, 카드 안의 줄은 구분선 없이 여백으로
 * 나눈다(토스풍, DESIGN.md 1.7).
 */

type Children = ElementChildren;

/**
 * 스택 화면의 스크롤 바탕. 아래 끝은 제스처 막대나 3버튼 내비게이션 자리를 더 비워 마지막 버튼이 막대에 걸리지 않는다
 */
export function ScreenScroll({ children }: { children: Children }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-3 px-4 pb-8 pt-1'>
      {children as ReactNode}
      {/* contentContainerStyle을 주면 react-native-css가 className의 여백을 덮어써(에뮬레이터) 빈 뷰로 비운다 */}
      <View style={{ height: insets.bottom }} />
    </ScrollView>
  );
}

/** 섹션 카드. 제목 옆(aside)에 진행 상황 같은 한 줄을 둔다 */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string | ReactElement;
  children: Children;
}) {
  return (
    <Card className='gap-3'>
      <Stack direction='row' align='center' justify='between' className='gap-3'>
        <Text heading='2' size='lg'>
          {title}
        </Text>
        {typeof aside === 'string' ? (
          <Text size='sm' tone='muted' className='tabular-nums'>
            {aside}
          </Text>
        ) : (
          aside
        )}
      </Stack>
      {children}
    </Card>
  );
}

/**
 * 목록 한 줄. label을 주면 줄 전체가 버튼이 되고 스크린 리더는 label을 읽는다.
 * inset은 카드 안(좌우 24) 또는 화면 바로 위(좌우 16)의 눌림 배경 폭이다.
 * compact는 안쪽에 이미 48 높이의 누름 영역(이름 버튼, 스위치)이 있는 줄이라 위아래 여백을 4로 줄인다
 */
export function Row({
  column = false,
  compact = false,
  label,
  onPress,
  inset = 'card',
  children,
}: {
  column?: boolean;
  compact?: boolean;
  label?: string;
  onPress?: () => void;
  inset?: 'card' | 'screen';
  children: Children;
}) {
  // 눌림 배경을 카드 끝까지 늘려 글자가 눌림 사각형 가장자리에 붙지 않게 한다
  const className = cn(
    inset === 'card' ? '-mx-6 px-6' : '-mx-4 px-4',
    compact ? 'py-1' : 'py-3',
    column ? 'gap-2' : 'flex-row items-center gap-3',
  );
  if (label === undefined) return <View className={className}>{children as ReactNode}</View>;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(className, 'active:bg-surface-hover')}
    >
      {children as ReactNode}
    </Pressable>
  );
}

/** 한 가지를 고르는 칩 묶음. optional이면 고른 칩을 다시 눌러 선택을 지운다(필수 항목은 지우지 않는다) */
export function Choices<T extends string | number>({
  label,
  options,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  optional?: boolean;
}) {
  return (
    <Stack className='gap-2'>
      <Label>{label}</Label>
      <Stack direction='row' wrap className='gap-3'>
        {options.map(option => (
          <Chip
            key={String(option.value)}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(optional && option.value === value ? undefined : option.value)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

/** 여럿을 고르는 칩 묶음(내역 필터) */
export function MultiChoices<T extends string | number>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  values: T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <Stack className='gap-2'>
      <Label>{label}</Label>
      <Stack direction='row' wrap className='gap-3'>
        {options.map(option => {
          const selected = values.includes(option.value);
          return (
            <Chip
              key={String(option.value)}
              label={option.label}
              selected={selected}
              onPress={() =>
                onChange(
                  selected ? values.filter(v => v !== option.value) : [...values, option.value],
                )
              }
            />
          );
        })}
      </Stack>
    </Stack>
  );
}

/** 스위치 줄. 글자를 눌러도 켜진다. 스위치는 모양만 맡고 스크린 리더는 줄 하나를 읽는다(DESIGN.md 3.7) */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  children: ReactElement;
}) {
  return (
    <Pressable
      accessibilityRole='switch'
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      className='-mx-6 flex-row items-center justify-between gap-3 px-6 py-3 active:bg-surface-hover'
    >
      <Stack className='flex-1 gap-1'>
        <Text>{label}</Text>
        {description !== undefined && (
          <Text size='sm' tone='muted'>
            {description}
          </Text>
        )}
      </Stack>
      {children}
    </Pressable>
  );
}

/** 빈 상태: 사실 한 줄 + 무엇이 생기는지 + 채우는 동작(DESIGN.md 3.6) */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactElement;
}) {
  return (
    <Card className='gap-3'>
      <Prose size='lg'>{title}</Prose>
      {body !== undefined && (
        <Prose size='sm' tone='muted'>
          {body}
        </Prose>
      )}
      {action}
    </Card>
  );
}
