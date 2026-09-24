import { cn } from '@eeennsu/native';
import { Pressable, Text } from 'react-native-css/components';

type ChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
};

/**
 * 선택 칩(임시). @eeennsu/native 0.3.0의 Chip과 API·모양이 같아 그 버전을 올리면 import만 바꾼다
 * (docs/DESIGN.md 5장). 칩 줄 간격은 gap-3(12)이고, 세로 hitSlop 5와 최소 폭 48로 누름 영역이 48이다.
 * 누르는 동안은 투명도가 내려간다. 색이 아니라서 className으로 바꾼 배경도 따라간다.
 */
export function Chip({ label, selected = false, disabled = false, onPress, className }: ChipProps) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: 5, bottom: 5 }}
      onPress={onPress && (() => onPress())}
      className={cn(
        'min-w-12 items-center justify-center rounded-full border px-4 py-2 active:opacity-80',
        selected ? 'border-brand bg-brand' : 'border-border bg-surface',
        disabled && 'opacity-50',
        className,
      )}
    >
      <Text
        maxFontSizeMultiplier={1.5}
        className={cn('text-sm', selected ? 'text-fg-on-brand' : 'text-fg')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
