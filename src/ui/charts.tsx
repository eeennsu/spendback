import { useState } from 'react';
import { useCssElement } from 'react-native-css';
import { View } from 'react-native-css/components';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';

import { Prose } from './prose';

/**
 * 회고 차트(docs/DESIGN.md 4.4): 카테고리 도넛과 일별 막대. 조각 5~6개, 막대 7~31개라 그리기만 하면 되어
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

function Bar(props: React.ComponentProps<typeof Rect> & { className: string }) {
  return useCssElement(Rect, props, fillMapping);
}

function Label(props: React.ComponentProps<typeof SvgText> & { className: string }) {
  return useCssElement(SvgText, props, fillMapping);
}

/** 가장 큰 조각만 brand, 나머지는 회색 단계다. 순서대로 옅어진다 */
const GRAY_STEPS = [0.75, 0.55, 0.4, 0.28, 0.18];

const sliceClass = (i: number) => (i === 0 ? 'stroke-brand' : 'stroke-fg-muted');
const sliceOpacity = (i: number) =>
  i === 0 ? 1 : GRAY_STEPS[Math.min(i - 1, GRAY_STEPS.length - 1)];

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
      </Svg>
    </View>
  );
}

export type Slice = { label: string; amount: number };

/** 카테고리 도넛. 조각마다 바깥에 %를 적고, 같은 값의 표가 차트의 대체 텍스트다(DESIGN.md 4.4) */
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
              key={`ring-${slice.label}`}
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
                key={`label-${slice.label}`}
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
      </Svg>
    </View>
  );
}

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

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
  const weekly = days.length === 7;
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
              const showLabel = weekly || dayNumber === 1 || dayNumber % 5 === 0;
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
                    {weekly ? WEEKDAY[i] : String(dayNumber)}
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
