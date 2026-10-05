import { useState } from 'react';
import { useCssElement } from 'react-native-css';
import { View } from 'react-native-css/components';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Prose } from './prose';

/**
 * 회고 차트(docs/DESIGN.md 4.4): 카테고리 도넛, 일별 막대, 회고 목록의 달별 막대. 조각 5~6개, 막대 12~31개라 그리기만 하면 되어
 * Skia·victory-native를 들이지 않고 DS 아이콘이 이미 쓰는 react-native-svg로 그린다(PRD 13장).
 * 색은 DS 클래스(stroke-brand, fill-fg-muted)를 react-native-css가 SVG prop으로 옮긴다. JS에 색 값을 두지 않는다
 */

const strokeMapping = {
  className: { target: false, nativeStyleMapping: { stroke: 'stroke' } },
} as const;
const fillMapping = { className: { target: false, nativeStyleMapping: { fill: 'fill' } } } as const;

function Ring(props: React.ComponentProps<typeof Circle> & { className: string }) {
  return useCssElement(Circle, props, strokeMapping);
}

function Divider(props: React.ComponentProps<typeof Line> & { className: string }) {
  return useCssElement(Line, props, strokeMapping);
}

function Bar(props: React.ComponentProps<typeof Rect> & { className: string }) {
  return useCssElement(Rect, props, fillMapping);
}

function Label(props: React.ComponentProps<typeof SvgText> & { className: string }) {
  return useCssElement(SvgText, props, fillMapping);
}

/** 테두리만 그린 막대. 진행 중인 달처럼 아직 정해지지 않은 값이다 */
function OutlineBar(props: React.ComponentProps<typeof Rect> & { className: string }) {
  return useCssElement(Rect, props, strokeMapping);
}

/**
 * 조각 색. 큰 순서로 brand · 주황 · 청록 · 노랑 · 분홍(global.css의 차트 색)이고, 6번째("그 외 N개")는 옅은 회색이다.
 * 처음에는 가장 큰 조각만 brand이고 나머지를 회색 단계로 두었는데, 3번째부터 서로 구분되지 않았다(2026-10-05 사용자).
 * Tailwind는 글자 그대로 있는 클래스만 만들어 표로 둔다
 */
const SLICE_CLASSES = [
  'stroke-brand',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
] as const;
/** "그 외"의 회색. 색 조각보다 물러나 보이게 옅게 둔다 */
const REST_OPACITY = 0.45;

const sliceClass = (i: number) => SLICE_CLASSES[i] ?? 'stroke-fg-muted';
const sliceOpacity = (i: number) => (i < SLICE_CLASSES.length ? 1 : REST_OPACITY);

/** 조각 색 견본. 표의 줄 앞에 두어 조각과 줄을 잇는다(같은 %가 둘이어도 구분된다). 스크린 리더는 줄 글자를 읽는다 */
export function Swatch({ index }: { index: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
      <Svg width={12} height={12}>
        <Ring
          className={sliceClass(index)}
          strokeOpacity={sliceOpacity(index)}
          cx={6}
          cy={6}
          r={3}
          fill='none'
          strokeWidth={6}
        />
        {/* 옅은 회색 견본도 카드 바탕에서 보이게 테두리를 긋는다(5차 028) */}
        {index >= SLICE_CLASSES.length && (
          <Ring className='stroke-border' cx={6} cy={6} r={5.5} fill='none' strokeWidth={1} />
        )}
      </Svg>
    </View>
  );
}

/** key는 이름이 아니라 카테고리 id로 만든다. 이름은 겹칠 수 있다 */
export type Slice = { key: string; label: string; amount: number };

/**
 * 카테고리 도넛. 조각마다 바깥에 %를 적고, 같은 값의 표가 차트의 대체 텍스트다(DESIGN.md 4.4). 색은 순위를 따른다:
 * 카테고리가 열 개 넘게 있어 카테고리마다 색을 고정하면 다섯 색이 겹친다. 표의 견본이 조각과 이름을 잇는다
 */
export function Donut({ slices, percents }: { slices: Slice[]; percents: string[] }) {
  const size = 200;
  const width = 26;
  const r = 62;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((n, s) => n + s.amount, 0);
  const fractions = slices.map(s => (total > 0 ? s.amount / total : 0));
  // 조각마다 시작 위치(앞 조각들의 합)
  const starts = fractions.map((_, i) => fractions.slice(0, i).reduce((n, f) => n + f, 0));
  return (
    <View
      className='items-center'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
    >
      <Svg width={size} height={size}>
        {slices.map((slice, i) => {
          const fraction = fractions[i];
          const start = starts[i];
          const angle = -Math.PI / 2 + 2 * Math.PI * (start + fraction / 2);
          return [
            <Ring
              key={`ring-${slice.key}`}
              className={sliceClass(i)}
              strokeOpacity={sliceOpacity(i)}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill='none'
              strokeWidth={width}
              strokeDasharray={`${fraction * c} ${c}`}
              strokeDashoffset={-start * c}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />,
            fraction >= 0.05 && (
              <Label
                key={`label-${slice.key}`}
                className='fill-fg-muted'
                x={size / 2 + (r + width / 2 + 14) * Math.cos(angle)}
                y={size / 2 + (r + width / 2 + 14) * Math.sin(angle) + 4}
                fontSize={14}
                textAnchor='middle'
              >
                {percents[i]}
              </Label>
            ),
          ];
        })}
        {/* 조각 사이에 카드 바탕색 틈을 둔다. 옅은 회색 조각끼리도 경계가 보인다(5차 028) */}
        {slices.length > 1 &&
          starts.map((start, i) => {
            const a = -Math.PI / 2 + 2 * Math.PI * start;
            return (
              <Divider
                key={`gap-${slices[i].key}`}
                className='stroke-surface'
                x1={size / 2 + (r - width / 2 - 1) * Math.cos(a)}
                y1={size / 2 + (r - width / 2 - 1) * Math.sin(a)}
                x2={size / 2 + (r + width / 2 + 1) * Math.cos(a)}
                y2={size / 2 + (r + width / 2 + 1) * Math.sin(a)}
                strokeWidth={2}
              />
            );
          })}
      </Svg>
    </View>
  );
}

/** 일별 변동비 막대. 가장 많이 쓴 날만 brand다. 막대 아래에 summary("가장 많이 쓴 날은 …")를 글로 쓴다 */
export function DailyBars({
  days,
  summary,
}: {
  days: Array<{ date: string; amount: number }>;
  summary: string;
}) {
  const [width, setWidth] = useState(0);
  const height = 120;
  const labelHeight = 20;
  const max = Math.max(...days.map(d => d.amount), 1);
  const top = days.reduce((best, d) => (d.amount > best.amount ? d : best), days[0]);
  const step = width / Math.max(days.length, 1);
  const barWidth = Math.max(2, step * 0.6);
  return (
    <View className='w-full gap-2'>
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        className='w-full'
      >
        {width > 0 && (
          <Svg width={width} height={height + labelHeight}>
            {days.map((day, i) => {
              const barHeight = day.amount > 0 ? Math.max(2, (day.amount / max) * height) : 0;
              const x = i * step + (step - barWidth) / 2;
              const dayNumber = Number(day.date.slice(8));
              const showLabel = dayNumber === 1 || dayNumber % 5 === 0;
              return [
                <Bar
                  key={`bar-${day.date}`}
                  className={day === top && day.amount > 0 ? 'fill-brand' : 'fill-fg-muted'}
                  // 회색 막대도 카드 바탕과 3:1을 넘게 한다(라이트 약 3.1, 다크 약 4)
                  fillOpacity={day === top ? 1 : 0.7}
                  x={x}
                  y={height - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={Math.min(3, barWidth / 2)}
                />,
                showLabel && (
                  <Label
                    key={`day-${day.date}`}
                    className='fill-fg-muted'
                    x={i * step + step / 2}
                    y={height + 14}
                    fontSize={12}
                    textAnchor='middle'
                  >
                    {String(dayNumber)}
                  </Label>
                ),
              ];
            })}
          </Svg>
        )}
      </View>
      <Prose size='sm' tone='muted' className='tabular-nums'>
        {summary}
      </Prose>
    </View>
  );
}

/**
 * 달별 변동비 막대(회고 목록, PRD 4.6 목록). 끝난 달 중 가장 많이 쓴 달만 brand이고, 진행 중인 달은 아직 정해지지
 * 않은 값이라 점선 테두리로 그린다. 막대 아래에 달 숫자, 그 아래 summary를 글로 쓴다(차트는 스크린 리더에서 숨긴다)
 */
export function MonthlyBars({
  months,
  ongoing,
  summary,
}: {
  months: Array<{ month: string; amount: number }>;
  /** 진행 중인 달(`YYYY-MM`) */
  ongoing: string;
  summary: string;
}) {
  const [width, setWidth] = useState(0);
  const height = 96;
  const labelHeight = 20;
  const max = Math.max(...months.map(m => m.amount), 1);
  const top = months
    .filter(m => m.month !== ongoing)
    .reduce<(typeof months)[number] | undefined>(
      (best, m) => (!best || m.amount > best.amount ? m : best),
      undefined,
    );
  const step = width / Math.max(months.length, 1);
  const barWidth = Math.max(2, step * 0.6);
  return (
    <View className='w-full gap-2'>
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        className='w-full'
      >
        {width > 0 && (
          <Svg width={width} height={height + labelHeight}>
            {months.map((m, i) => {
              const barHeight = m.amount > 0 ? Math.max(2, (m.amount / max) * height) : 0;
              const x = i * step + (step - barWidth) / 2;
              const bar =
                m.month === ongoing ? (
                  <OutlineBar
                    key={`bar-${m.month}`}
                    className='stroke-fg-muted'
                    fill='none'
                    strokeWidth={1.5}
                    strokeDasharray='3 2'
                    x={x + 0.75}
                    y={height - Math.max(barHeight, 2) + 0.75}
                    width={Math.max(barWidth - 1.5, 1)}
                    height={Math.max(barHeight - 1.5, 1)}
                    rx={Math.min(3, barWidth / 2)}
                  />
                ) : (
                  <Bar
                    key={`bar-${m.month}`}
                    className={m === top && m.amount > 0 ? 'fill-brand' : 'fill-fg-muted'}
                    // 회색 막대도 카드 바탕과 3:1을 넘게 한다(일별 막대와 같다)
                    fillOpacity={m === top ? 1 : 0.7}
                    x={x}
                    y={height - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(3, barWidth / 2)}
                  />
                );
              return [
                bar,
                <Label
                  key={`month-${m.month}`}
                  className='fill-fg-muted'
                  x={i * step + step / 2}
                  y={height + 14}
                  fontSize={12}
                  textAnchor='middle'
                >
                  {String(Number(m.month.slice(5)))}
                </Label>,
              ];
            })}
          </Svg>
        )}
      </View>
      <Prose size='sm' tone='muted' className='tabular-nums'>
        {summary}
      </Prose>
    </View>
  );
}
