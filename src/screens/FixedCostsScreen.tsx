import { Button, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native-css/components';

import type { FixedCostRow } from '../db/lists';
import { linkedPayments } from '../db/transactions';
import { installmentOver, installmentProgress } from '../domain/fixedCost';
import { formatWon } from '../domain/format';
import { useQuery, useToday } from '../state/data';
import { paymentLabel, useLists } from '../state/lists';
import { Empty, Row, ScreenScroll, Section } from '../ui/layout';

/**
 * 고정비 항목(PRD 4.4). 월세·통신비·구독처럼 매달 나가는 지출을 등록해 두면 홈이 달마다 기록했는지 확인한다.
 * 할부는 회차와 남은 금액을 보이고, 마지막 달이 지나면 "끝난 할부"로 내려간다.
 * 해지한 항목은 숨긴다. 과거 거래와 집계는 그대로 남는다
 */
export function FixedCostsScreen() {
  const navigation = useNavigation();
  const lists = useLists();
  const month = useToday().slice(0, 7);
  const installmentIds = (lists?.fixedCosts ?? [])
    .filter(f => f.installmentMonths !== null)
    .map(f => f.id);
  const payments = useQuery(`fixed:payments:${installmentIds.join(',')}`, db =>
    linkedPayments(db, installmentIds),
  );
  if (!lists || !payments) return null;
  // 결제일 순서로 둔다. 홈의 미기록 줄과 같은 순서다(DESIGN.md 4.2)
  const active = lists.fixedCosts
    .filter(f => !f.hidden && !installmentOver(f, month))
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const over = lists.fixedCosts.filter(f => !f.hidden && installmentOver(f, month));
  const hidden = lists.fixedCosts.filter(f => f.hidden);
  const category = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  const progress = (item: FixedCostRow) => {
    if (item.installmentMonths === null) return undefined;
    const { paid, remaining } = installmentProgress(
      item,
      payments.filter(p => p.fixedCostId === item.id),
    );
    return `할부 ${paid}/${item.installmentMonths}회 · 남은 ${formatWon(remaining)}`;
  };
  const detail = (item: FixedCostRow) =>
    [
      `매월 ${item.dayOfMonth}일`,
      formatWon(item.amount),
      category(item.categoryId),
      paymentLabel(item.paymentMethod),
    ]
      .filter(Boolean)
      .join(' · ');
  const open = (item: FixedCostRow) => navigation.navigate('FixedCostEdit', { id: item.id });

  return (
    <ScreenScroll>
      {active.length === 0 ? (
        <Empty
          title='등록한 고정비가 없어요'
          body='월세·통신비·구독을 등록하면 결제일에 기록했는지 홈에서 알려 줘요'
        />
      ) : (
        <Section title='쓰는 항목'>
          {/* 줄 사이 간격은 줄 자신의 여백만 쓴다(Section gap은 제목과 내용 사이) */}
          <View>
            {active.map(item => {
              const lines = [detail(item), progress(item)].filter(line => line !== undefined);
              return (
                <Row
                  key={item.id}
                  label={`${item.name}, ${lines.join(', ')}`}
                  onPress={() => open(item)}
                  chevron
                >
                  <Stack className='flex-1 gap-1'>
                    <Text>{item.name}</Text>
                    {lines.map(line => (
                      <Text key={line} size='sm' tone='muted' className='tabular-nums'>
                        {line}
                      </Text>
                    ))}
                  </Stack>
                </Row>
              );
            })}
          </View>
        </Section>
      )}
      <Button
        label='항목 추가'
        icon='plus'
        variant='secondary'
        onPress={() => navigation.navigate('FixedCostEdit', {})}
      />
      {over.length > 0 && (
        <Section title='끝난 할부'>
          <View>
            {over.map(item => {
              // 끝난 것은 할부뿐이라 진행이 늘 있다
              const text = progress(item) ?? '';
              return (
                <Row
                  key={item.id}
                  label={`${item.name}, ${text}`}
                  onPress={() => open(item)}
                  chevron
                >
                  <Stack className='flex-1 gap-1'>
                    <Text tone='muted'>{item.name}</Text>
                    <Text size='sm' tone='muted' className='tabular-nums'>
                      {text}
                    </Text>
                  </Stack>
                </Row>
              );
            })}
          </View>
        </Section>
      )}
      {hidden.length > 0 && (
        <Section title='해지한 항목'>
          <View>
            {hidden.map(item => (
              <Row key={item.id} label={`${item.name}, 해지함`} onPress={() => open(item)} chevron>
                <Text tone='muted' className='flex-1'>
                  {item.name}
                </Text>
              </Row>
            ))}
          </View>
        </Section>
      )}
    </ScreenScroll>
  );
}
