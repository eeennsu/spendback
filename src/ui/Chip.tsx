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
 * 선택 칩(임시). @eeennsu/native 0.3.0의 Chip과 API가 같아 그 버전을 올리면 import만 바꾼다
 * (docs/DESIGN.md 5장). 칩 줄 간격은 gap-3(12)이고, 세로 hitSlop 5를 더해 누름 영역이 48이 된다.
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
        'items-center justify-center rounded-full border px-4 py-2',
        selected
          ? 'border-brand bg-brand active:bg-brand-hover'
          : 'border-border bg-surface active:bg-surface-hover',
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
