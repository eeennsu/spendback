import { Button, Card, Stack, Text } from '@eeennsu/native';
import { type StaticScreenProps, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text as RNText, View } from 'react-native-css/components';

import { allBudgets } from '../db/budgets';
import { findRetrospective } from '../db/retrospectives';
import { getSetting } from '../db/settings';
import { firstRecordDate, transactionsBetween } from '../db/transactions';
import { addDays } from '../domain/date';
import { computeFacts } from '../domain/facts';
import { fixedCostChecklist, paymentDate } from '../domain/fixedCost';
import { formatPercent, formatWon } from '../domain/format';
import {
  type PeriodKind,
  isOngoing,
  periodEnd,
  periodLabel,
  previousStart,
} from '../domain/periods';
import { hasModel } from '../native/files';
import type { Output } from '../retro/check';
import { type KeyedFacts, factValues, keyFacts } from '../retro/keys';
import { MIN_RECORDS } from '../retro/narrate';
import { renderParts } from '../retro/render';
import { useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { type Generation, modelFor, useGeneration } from '../state/retro';
import { DailyBars, Donut, Swatch } from '../ui/charts';
import { HeaderAction } from '../ui/chrome';
import { Row, ScreenScroll, Section } from '../ui/layout';
import { Prose, wrapWords } from '../ui/prose';

type Params = { kind: PeriodKind; start: string };

/**
 * 회고 상세(PRD 4.6, docs/DESIGN.md 4.4). 총지출 → 회고 문장 → 카테고리 도넛과 표 → 일별 막대. 끝난 기간을 처음
 * 열면 회고를 만들어 저장하고, 저장본이 있으면 그것을 보인다. 코드가 채운 값은 brand 글자로 강조한다
 * ("숫자는 코드가 쓴다", PRD 2장)
 */
export function RetroDetailScreen({ route }: StaticScreenProps<Params>) {
  const { kind, start } = route.params;
  const navigation = useNavigation();
  const today = useToday();
  const lists = useLists();
  const period = { kind, start, end: periodEnd(kind, start) };
  const data = useQuery(`retro:${kind}:${start}`, async db => ({
    transactions: await transactionsBetween(db, previousStart(kind, start), period.end),
    first: await firstRecordDate(db),
    budgets: await allBudgets(db),
    saved: await findRetrospective(db, kind, start),
    modelId: await getSetting(db, 'model'),
  }));
  const generation = useGeneration(period);
  const [skipFixedCheck, setSkipFixedCheck] = useState(false);
  const autoStarted = useRef(false);

  const ongoing = isOngoing(period, today);
  const facts =
    data && lists
      ? computeFacts({
          period: { kind, start },
          transactions: data.transactions,
          firstRecordDate: data.first,
          budgets: data.budgets,
          categories: lists.categories,
        })
      : undefined;
  const enough = facts !== undefined && facts.variableCount >= MIN_RECORDS;
  // 월간은 만들기 전에 그 달에 기록하지 않은 고정비를 알린다(PRD 4.4, 4.6)
  const month = start.slice(0, 7);
  const unrecorded =
    kind === 'monthly' && data && lists
      ? fixedCostChecklist(
          lists.fixedCosts,
          data.transactions.filter(tx => tx.date.startsWith(month)),
          month,
          addDays(period.end, 1),
        ).overdue
      : [];
  const needsFixedCheck = unrecorded.length > 0 && !skipFixedCheck;
  const canGenerate = !ongoing && enough && generation.state.status !== 'writing';

  const generate = () => {
    if (!facts || !lists) return;
    void generation.start({ facts, names: lists.names, modelId: data?.modelId });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: periodLabel(period, today),
      headerRight:
        data?.saved && canGenerate && !needsFixedCheck
          ? () => <HeaderAction label='다시 만들기' onPress={generate} />
          : undefined,
    });
  });

  // 끝난 기간의 회고 상세를 처음 열 때 만든다. 저장본이 있으면 다시 만들기는 사용자가 요청할 때만이다(PRD 4.6)
  useEffect(() => {
    if (autoStarted.current || !data || !lists || data.saved || !canGenerate || needsFixedCheck) {
      return;
    }
    autoStarted.current = true;
    generate();
  });

  // 모델이 없어 폴백했다가 모델 관리에서 받고 돌아오면 바로 만든다
  useFocusEffect(() => {
    const state = generation.state;
    if (
      state.status === 'fallback' &&
      state.reason === 'no-model' &&
      hasModel(modelFor(data?.modelId))
    ) {
      generate();
    }
  });

  if (!data || !lists || !facts) return <View className='flex-1 bg-canvas' />;

  const keyed = keyFacts(facts, lists.names);
  const categoryName = (id: number) => lists.names.categories.get(id) ?? '카테고리';
  const change = keyed.groups
    .find(g => g.id === 'total')
    ?.facts.find(f => f.key === 'total.change_phrase')?.value;
  const before = kind === 'weekly' ? '지난주' : '지난달';
  const top = facts.categories.slice(0, 5);
  const rest = facts.categories.slice(5).reduce((n, c) => n + c.amount, 0);
  const slices = [
    ...top.map(c => ({ label: categoryName(c.categoryId), amount: c.amount })),
    ...(rest > 0 ? [{ label: '기타', amount: rest }] : []),
  ];
  const percents = slices.map(s =>
    facts.variable > 0 ? formatPercent(s.amount, facts.variable) : '0%',
  );
  const length = kind === 'weekly' ? 7 : Number(period.end.slice(8));
  const days = Array.from({ length }, (_, i) => {
    const date = addDays(start, i);
    const amount = data.transactions
      .filter(tx => tx.date === date && tx.type === 'expense' && !tx.isFixed)
      .reduce((n, tx) => n + tx.amount, 0);
    return { date, amount };
  });
  const busiest = days.reduce((best, d) => (d.amount > best.amount ? d : best), days[0]);
  // 회고 문장이 총지출 묶음(변동비 증감 등)을 말하면 카드의 비교 줄을 빼 같은 사실을 두 번 말하지 않는다
  const output = data.saved?.output;
  const saidTotal =
    output !== undefined &&
    [output.headline, ...output.insights.map(i => i.text)].some(text => text.includes('{total.'));

  return (
    <ScreenScroll>
      <Card className='gap-2'>
        <Text size='sm' tone='muted'>
          총지출
        </Text>
        <Text size='2xl' className='tabular-nums'>
          {formatWon(facts.total)}
        </Text>
        <Text size='sm' tone='muted' className='tabular-nums'>
          {`변동비 ${formatWon(facts.variable)} · 고정비 ${formatWon(facts.fixed)}`}
        </Text>
        {!saidTotal && (
          <Prose className='tabular-nums'>
            {change === undefined
              ? `${before}와 비교할 기록이 없어요`
              : change === '같았어요'
                ? `변동비가 ${before}와 같았어요`
                : `변동비가 ${before}보다 ${change}`}
          </Prose>
        )}
      </Card>

      <Narrative
        ongoing={ongoing}
        enough={enough}
        saved={data.saved ?? undefined}
        generation={generation.state}
        unrecorded={
          needsFixedCheck
            ? unrecorded.map(item => ({ ...item, date: paymentDate(item.dayOfMonth, month) }))
            : []
        }
        kind={kind}
        onGenerate={generate}
        onSkipFixed={() => setSkipFixedCheck(true)}
        onRecordFixed={id => navigation.navigate('Entry', { fixedCostId: id })}
        onCancel={generation.cancel}
        onModels={() => navigation.navigate('Models')}
      />

      {slices.length > 0 && (
        <Section title='카테고리'>
          <Donut slices={slices} percents={percents} />
          {/* 줄 사이 간격은 줄 자신의 여백만 쓴다(Section gap은 제목과 내용 사이) */}
          <View>
            {slices.map((slice, i) => (
              <Row key={slice.label}>
                <Swatch index={i} />
                <Text className='flex-1'>{slice.label}</Text>
                <Text size='sm' tone='muted' className='tabular-nums'>
                  {percents[i]}
                </Text>
                <Text className='tabular-nums'>{formatWon(slice.amount)}</Text>
              </Row>
            ))}
          </View>
        </Section>
      )}

      <Section title='날마다 쓴 돈'>
        <DailyBars
          days={days}
          summary={
            busiest && busiest.amount > 0
              ? `가장 많이 쓴 날은 ${Number(busiest.date.slice(5, 7))}월 ${Number(busiest.date.slice(8))}일, ${formatWon(busiest.amount)}`
              : '변동비를 쓴 날이 없어요'
          }
        />
        <Prose size='sm' tone='muted'>
          고정비는 빼고 변동비만 날마다 더했어요
        </Prose>
      </Section>
    </ScreenScroll>
  );
}

/** 회고 문장 영역의 상태(DESIGN.md 4.4): 진행 중, 기록 부족, 고정비 미기록 알림, 생성 중, 폴백, 저장본 */
function Narrative({
  ongoing,
  enough,
  saved,
  generation,
  unrecorded,
  kind,
  onGenerate,
  onSkipFixed,
  onRecordFixed,
  onCancel,
  onModels,
}: {
  ongoing: boolean;
  enough: boolean;
  saved: { facts: KeyedFacts; output: Output } | undefined;
  generation: Generation;
  unrecorded: Array<{ id: number; name: string; amount: number; date: string }>;
  kind: PeriodKind;
  onGenerate: () => void;
  onSkipFixed: () => void;
  onRecordFixed: (id: number) => void;
  onCancel: () => void;
  onModels: () => void;
}) {
  if (ongoing) {
    return (
      <Notice
        title={
          kind === 'weekly'
            ? '이번 주가 끝나면 회고를 만들어요'
            : '이번 달이 끝나면 회고를 만들어요'
        }
        body='진행 중인 기간은 지표와 차트만 보여 줘요'
      />
    );
  }
  if (!enough) {
    return (
      <Notice
        title='기록이 부족해요'
        body={`변동비 지출이 ${MIN_RECORDS}건 이상 있어야 회고를 만들어요`}
      />
    );
  }
  if (generation.status === 'writing') {
    return (
      <Card className='gap-3'>
        <View accessibilityLiveRegion='polite' collapsable={false}>
          <Text size='sm' tone='muted'>
            {generation.retrying ? '다시 쓰는 중' : '쓰는 중'}
          </Text>
        </View>
        {generation.sentences.map((sentence, i) => (
          <Prose key={sentence} size={i === 0 ? 'xl' : 'md'}>
            {sentence}
          </Prose>
        ))}
        <Button label='취소' variant='secondary' className='self-start' onPress={onCancel} />
      </Card>
    );
  }
  if (generation.status === 'fallback') {
    const message = {
      'no-model': '모델을 받으면 회고 문장을 만들 수 있어요',
      'load-failed': '모델을 불러오지 못했어요',
      'check-failed': '회고 문장을 만들지 못했어요',
    }[generation.reason];
    return (
      <Card className='gap-3'>
        <Prose>{message}</Prose>
        <Text size='sm' tone='muted'>
          지표와 차트는 아래에 있어요
        </Text>
        <Stack direction='row' wrap className='gap-3'>
          {generation.reason !== 'no-model' && (
            <Button
              label={generation.reason === 'check-failed' ? '다시 만들기' : '다시 시도'}
              variant='secondary'
              onPress={onGenerate}
            />
          )}
          {generation.reason !== 'check-failed' && (
            <Button label='모델 관리로 이동' variant='secondary' onPress={onModels} />
          )}
        </Stack>
      </Card>
    );
  }
  if (unrecorded.length > 0) {
    return (
      <Card className='gap-3'>
        <Text>기록하지 않은 고정비가 있어요</Text>
        <Prose size='sm' tone='muted'>
          빠뜨리면 고정비 합계와 수입 대비 지출률이 틀려요. 기록하거나 그대로 만들 수 있어요
        </Prose>
        {unrecorded.map(item => (
          <Row
            key={item.id}
            label={`${item.name} 기록, ${Number(item.date.slice(8))}일 결제 · 예상 ${formatWon(item.amount)}`}
            onPress={() => onRecordFixed(item.id)}
          >
            <Stack className='flex-1 gap-1'>
              <Text>{item.name}</Text>
              <Text size='sm' tone='muted' className='tabular-nums'>
                {`${Number(item.date.slice(8))}일 결제 · 예상 ${formatWon(item.amount)}`}
              </Text>
            </Stack>
            <Text size='sm' className='text-fg-brand'>
              기록
            </Text>
          </Row>
        ))}
        <Button
          label='그대로 만들기'
          variant='secondary'
          className='self-start'
          onPress={onSkipFixed}
        />
      </Card>
    );
  }
  if (saved) return <Sentences facts={saved.facts} output={saved.output} />;
  return (
    <Card className='gap-3'>
      <Text>
        {generation.status === 'cancelled' ? '만들기를 취소했어요' : '아직 회고가 없어요'}
      </Text>
      <Button label='회고 만들기' variant='secondary' className='self-start' onPress={onGenerate} />
    </Card>
  );
}

/** 저장한 회고. 값은 facts 스냅샷으로 채우고 brand 글자로 강조한다 */
function Sentences({ facts, output }: { facts: KeyedFacts; output: Output }) {
  const fill = {
    values: factValues(facts),
    // 서술어 값("29,000원 늘었어요")은 숫자만 강조한다
    predicates: new Set(
      facts.groups.flatMap(g => g.facts.filter(f => f.kind === 'predicate').map(f => f.key)),
    ),
  };
  return (
    <Card className='gap-4'>
      <Emphasized text={output.headline} fill={fill} className='text-xl' heading />
      <Stack className='gap-3'>
        {output.insights.map(insight => (
          <Emphasized key={insight.about} text={insight.text} fill={fill} className='text-md' />
        ))}
      </Stack>
      <View className='rounded-lg bg-surface-muted px-4 py-3'>
        <Emphasized text={output.suggestion} fill={fill} className='text-md' />
      </View>
    </Card>
  );
}

/** DS Text는 문자열만 받아(DS 알려진 동작 6) 강조는 중첩 RN Text로 그린다 */
function Emphasized({
  text,
  fill,
  className,
  heading = false,
}: {
  text: string;
  fill: { values: Record<string, string>; predicates: ReadonlySet<string> };
  className: string;
  heading?: boolean;
}) {
  const parts = renderParts(text, fill.values, fill.predicates);
  // 낱말 단위로 줄을 바꾼다. 조각이 공백 없이 이어지면("배달" + "이") 그 사이도 묶는다(src/ui/prose.tsx)
  const joined = (i: number) => i > 0 && !/\s$/.test(parts[i - 1].text);
  return (
    <RNText
      accessibilityRole={heading ? 'header' : undefined}
      accessibilityLabel={parts.map(part => part.text).join('')}
      className={`font-sans text-fg ${className}`}
    >
      {parts.map((part, i) =>
        part.value ? (
          <RNText key={i} className='text-fg-brand tabular-nums'>
            {wrapWords(part.text, joined(i))}
          </RNText>
        ) : (
          wrapWords(part.text, joined(i))
        ),
      )}
    </RNText>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card className='gap-2'>
      <Prose>{title}</Prose>
      <Prose size='sm' tone='muted'>
        {body}
      </Prose>
    </Card>
  );
}
