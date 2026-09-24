import { Button, Stack, Text, cn } from '@eeennsu/native';
import type { ReactElement } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native-css/components';

import { Meter } from '../ui/Meter';
import { budget, categoryBudgets, fixedCosts, recentExpenses } from './fixtures';

type HomeMockProps = {
  /** filled: 한 달 가운데쯤의 모습, firstRun: 예산과 기록이 없는 첫 실행 */
  variant?: 'filled' | 'firstRun';
  onRecord?: () => void;
};

/**
 * 홈 탭 시안(docs/DESIGN.md 4장). 탭 바와 헤더("9월")는 React Navigation이 그리므로 여기에는 내용만 있다.
 * 가짜 데이터로 그리고 DB·내비게이션은 붙이지 않는다. 12장 6번에서 실제 화면으로 바꾼다.
 */
export function HomeMock({ variant = 'filled', onRecord }: HomeMockProps) {
  return (
    <View className='flex-1 bg-canvas'>
      <ScrollView className='flex-1' contentContainerClassName='gap-8 px-4 pb-24 pt-4'>
        {variant === 'filled' ? <Filled /> : <FirstRun />}
      </ScrollView>
      {/* 기록은 이 앱의 핵심 동작이라 엄지가 닿는 오른쪽 아래에 둔다(docs/DESIGN.md 3장) */}
      <Button
        label='기록'
        icon='plus'
        size='lg'
        onPress={onRecord}
        className='absolute bottom-4 right-4 rounded-full shadow-md'
      />
    </View>
  );
}

function Filled() {
  return (
    <>
      <Stack className='gap-3'>
        <Text size='sm' tone='muted'>
          {budget.title}
        </Text>
        <Text size='2xl' className='tabular-nums'>
          {budget.remaining}
        </Text>
        <Meter
          label='9월 예산 사용률'
          valueText={budget.valueText}
          ratio={budget.ratio}
          marker={budget.elapsed}
        />
        <Stack direction='row' justify='between'>
          <Text size='sm' tone='muted' className='tabular-nums'>
            {budget.used}
          </Text>
          <Text size='sm' tone='muted' className='tabular-nums'>
            {budget.total}
          </Text>
        </Stack>
        <Text size='sm' className='tabular-nums'>
          {budget.pace}
        </Text>
      </Stack>

      <Section title='고정비' aside={fixedCosts.progress}>
        <Text size='sm' tone='muted'>
          결제일이 지났는데 아직 기록하지 않았어요
        </Text>
        {fixedCosts.overdue.map((item, index) => (
          // 항목을 누르면 입력 시트가 채워진 채로 열린다(PRD 4.4). 줄 전체가 누름 영역이다.
          <Row
            key={item.name}
            last={index === fixedCosts.overdue.length - 1}
            label={`${item.name} 기록, ${item.detail}`}
          >
            <Stack className='flex-1 gap-1'>
              <Text>{item.name}</Text>
              <Text size='sm' tone='muted' className='tabular-nums'>
                {item.detail}
              </Text>
            </Stack>
            <Text size='sm' className='text-brand'>
              기록
            </Text>
          </Row>
        ))}
      </Section>

      <Section title='카테고리 예산'>
        {categoryBudgets.map((item, index) => (
          <Row key={item.name} last={index === categoryBudgets.length - 1} column>
            <Stack direction='row' justify='between' className='gap-3'>
              <Text>{item.name}</Text>
              <Text
                size='sm'
                tone={item.ratio > 1 ? 'danger' : 'muted'}
                className='flex-1 text-right tabular-nums'
              >
                {item.amount}
              </Text>
            </Stack>
            <Meter
              label={`${item.name} 예산 사용률`}
              valueText={item.valueText}
              ratio={item.ratio}
              size='sm'
            />
          </Row>
        ))}
      </Section>

      <Section title='최근 지출' aside={<Button label='내역 보기' variant='ghost' size='sm' />}>
        {recentExpenses.map((item, index) => (
          // 누르면 같은 입력 시트가 수정 모드로 열린다(docs/DESIGN.md 4장)
          <Row
            key={item.id}
            last={index === recentExpenses.length - 1}
            label={`${item.memo}, ${item.meta}, ${item.amount}`}
          >
            <Stack className='flex-1 gap-1'>
              <RNText numberOfLines={1} className='text-md text-fg'>
                {item.memo}
              </RNText>
              <Text size='sm' tone='muted'>
                {item.meta}
              </Text>
            </Stack>
            <Text className='tabular-nums'>{item.amount}</Text>
          </Row>
        ))}
      </Section>
    </>
  );
}

function FirstRun() {
  return (
    <>
      <Stack className='gap-3'>
        <Text size='sm' tone='muted'>
          9월 예산
        </Text>
        <Text size='lg'>아직 예산이 없어요</Text>
        <Text size='sm' tone='muted'>
          예산을 정하면 남은 금액과 쓰는 속도를 여기에 보여 줘요
        </Text>
        <Button label='예산 정하기' variant='secondary' className='self-start' />
      </Stack>

      <Section title='최근 지출'>
        <Text size='sm' tone='muted'>
          아직 기록이 없어요. 오른쪽 아래 기록 버튼으로 첫 지출을 남겨 보세요
        </Text>
      </Section>
    </>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string | ReactElement;
  children: ReactElement | ReactElement[] | (ReactElement | ReactElement[])[];
}) {
  return (
    <Stack className='gap-2'>
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
    </Stack>
  );
}

/**
 * 목록 한 줄. 줄 사이는 테두리 한 줄로 나누고 카드를 쌓지 않는다(docs/DESIGN.md 3장).
 * label을 주면 줄 전체가 버튼이 되고 스크린 리더는 label을 읽는다.
 */
function Row({
  last,
  column = false,
  label,
  onPress,
  children,
}: {
  last: boolean;
  column?: boolean;
  label?: string;
  onPress?: () => void;
  children: ReactElement | ReactElement[];
}) {
  const className = cn(
    'py-3',
    column ? 'gap-2' : 'flex-row items-center gap-3',
    !last && 'border-b border-border',
  );

  if (label === undefined) return <View className={className}>{children}</View>;

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(className, 'active:bg-surface-hover')}
    >
      {children}
    </Pressable>
  );
}
