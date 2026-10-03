import { Button, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';

import type { FixedCostRow } from '../db/lists';
import { formatWon } from '../domain/format';
import { paymentLabel, useLists } from '../state/lists';
import { Empty, Row, ScreenScroll, Section } from '../ui/layout';

/**
 * 고정비 항목(PRD 4.4). 월세·통신비·구독처럼 매달 나가는 지출을 등록해 두면 홈이 달마다 기록했는지 확인한다.
 * 해지한 항목은 숨긴다. 과거 거래와 집계는 그대로 남는다
 */
export function FixedCostsScreen() {
  const navigation = useNavigation();
  const lists = useLists();
  if (!lists) return null;
  // 결제일 순서로 둔다. 홈의 미기록 줄과 같은 순서다(DESIGN.md 4.2)
  const active = lists.fixedCosts
    .filter(f => !f.hidden)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const hidden = lists.fixedCosts.filter(f => f.hidden);
  const category = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  const detail = (item: FixedCostRow) =>
    [
      `매월 ${item.dayOfMonth}일`,
      formatWon(item.amount),
      category(item.categoryId),
      paymentLabel(item.paymentMethod),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ScreenScroll>
      {active.length === 0 ? (
        <Empty
          title='등록한 고정비가 없어요'
          body='월세·통신비·구독을 등록하면 결제일에 기록했는지 홈에서 알려 줘요'
        />
      ) : (
        <Section title='쓰는 항목'>
          {active.map(item => (
            <Row
              key={item.id}
              label={`${item.name}, ${detail(item)}`}
              onPress={() => navigation.navigate('FixedCostEdit', { id: item.id })}
            >
              <Stack className='flex-1 gap-1'>
                <Text>{item.name}</Text>
                <Text size='sm' tone='muted' className='tabular-nums'>
                  {detail(item)}
                </Text>
              </Stack>
            </Row>
          ))}
        </Section>
      )}
      <Button
        label='항목 추가'
        icon='plus'
        variant='secondary'
        onPress={() => navigation.navigate('FixedCostEdit', {})}
      />
      {hidden.length > 0 && (
        <Section title='해지한 항목'>
          {hidden.map(item => (
            <Row
              key={item.id}
              label={`${item.name}, 해지함`}
              onPress={() => navigation.navigate('FixedCostEdit', { id: item.id })}
            >
              <Text tone='muted' className='flex-1'>
                {item.name}
              </Text>
            </Row>
          ))}
        </Section>
      )}
    </ScreenScroll>
  );
}
