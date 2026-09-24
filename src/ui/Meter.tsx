import { cn } from '@eeennsu/native';
import { View } from 'react-native-css/components';

type MeterProps = {
  /** 접근성 이름. 화면에 보이지 않으므로 무엇의 사용률인지 적는다 */
  label: string;
  /** 스크린 리더가 읽을 값. 색과 막대 길이만으로 뜻을 전하지 않는다 */
  valueText: string;
  /** 사용률. 1을 넘으면 막대를 꽉 채우고 danger 색으로 바꾼다 */
  ratio: number;
  /** 오늘까지 지난 기간의 비율. 주면 기준선을 긋는다(홈 예산 게이지) */
  marker?: number;
  size?: 'sm' | 'md';
};

/**
 * 예산 사용률 막대. 디자인 시스템에 없다. DS 계약은 number prop을 받지 않아(DS 스펙 AC-15)
 * DS로 옮기려면 그 규칙부터 정해야 한다(docs/DESIGN.md 5장). 그래서 앱 컴포넌트로 둔다.
 */
export function Meter({ label, valueText, ratio, marker, size = 'md' }: MeterProps) {
  const over = ratio > 1;
  const fill = { width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` } as const;
  const tick = marker === undefined ? undefined : ({ left: `${marker * 100}%` } as const);

  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      // 라이트 트랙은 border 색이다. surface-muted는 흰 canvas와 1.1:1이라 예산 전체 길이가 안 보인다
      className={cn(
        'w-full rounded-full bg-border dark:bg-surface-muted',
        size === 'md' ? 'h-3' : 'h-2',
      )}
    >
      <View className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-brand')} style={fill} />
      {/* 기준선이 막대 위에 올 때도 3:1 넘게 떨어져 보이도록 배경색 테두리를 두른다(docs/DESIGN.md 2장) */}
      {tick && (
        <View
          className='absolute -bottom-1 -top-1 -ml-1 w-2 rounded-full border-2 border-canvas bg-fg'
          style={tick}
        />
      )}
    </View>
  );
}
