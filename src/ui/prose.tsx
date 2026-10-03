import { cn } from '@eeennsu/native';
import type { Tone, TypographyStep } from '@eeennsu/tokens';
import { Platform } from 'react-native';
import { Text } from 'react-native-css/components';

const WORD_JOINER = '⁠';
const space = /\s/;

/**
 * 낱말(띄어쓰기로 나뉜 덩어리) 안의 글자 사이에 WORD JOINER(U+2060)를 넣어 줄이 낱말 사이에서만 바뀌게 한다.
 * Android의 RN Text는 한글 음절 사이 어디서나 줄을 바꿔 "보세/요."처럼 낱말을 자른다(에뮬레이터, docs/DESIGN.md 3.4).
 * iOS에는 `lineBreakStrategyIOS='hangul-word'`가 있지만 Android RN은 줄바꿈 설정(LineBreakConfig)을 넘기지 않는다.
 * 한 줄보다 긴 낱말은 Android가 글자 단위로 끊는다.
 *
 * @param joinStart 앞 조각이 공백 없이 이어지면(회고 문장의 값 조각 뒤 조사) 첫 글자 앞에도 넣는다
 */
export function keepWords(text: string, joinStart = false) {
  let out = '';
  let previous = joinStart ? 'x' : ' ';
  for (const char of text) {
    if (!space.test(previous) && !space.test(char)) out += WORD_JOINER;
    out += char;
    previous = char;
  }
  return out;
}

/** Android에서만 낱말을 묶는다. 스크린 리더와 E2E는 accessibilityLabel의 원래 문장을 읽는다 */
export const wrapWords = (text: string, joinStart = false) =>
  Platform.OS === 'android' ? keepWords(text, joinStart) : text;

// Tailwind는 소스에 글자 그대로 있는 클래스만 만든다. 이름을 조립하지 않고 DS Text와 같은 표로 둔다
const steps: Record<TypographyStep, string> = {
  'sm': 'text-sm',
  'md': 'text-md',
  'lg': 'text-lg',
  'xl': 'text-xl',
  '2xl': 'text-2xl',
};

const tones: Record<Tone, string> = {
  default: 'text-fg',
  muted: 'text-fg-muted',
  danger: 'text-fg-danger',
};

/**
 * 여러 줄이 될 수 있는 문장. DS Text와 같은 클래스(글꼴, 글자 스텝, tone)로 그리고 낱말 단위로 줄을 바꾼다.
 * DS Text 계약에는 accessibilityLabel이 없어 RN Text로 만든다
 */
export function Prose({
  children,
  size = 'md',
  tone = 'default',
  className,
}: {
  children: string;
  size?: TypographyStep;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Text
      accessibilityLabel={children}
      className={cn('font-sans', tones[tone], steps[size], className)}
    >
      {wrapWords(children)}
    </Text>
  );
}
