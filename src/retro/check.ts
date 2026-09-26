import { z } from 'zod';

import type { KeyedFacts } from './keys';
import { JOSA_PAIRS } from './render';

/** LLM 출력(PRD 4.6). 문법이 모양을 강제하지만 하네스의 문법 없는 실행과 저장본 읽기를 위해 다시 검증한다 */
export const OutputSchema = z.object({
  headline: z.string(),
  insights: z
    .array(z.object({ about: z.string(), text: z.string() }))
    .min(2)
    .max(4),
  suggestion: z.string(),
});
export type Output = z.infer<typeof OutputSchema>;

export type Field =
  | { field: 'headline'; text: string }
  | { field: 'insight'; index: number; about: string; text: string }
  | { field: 'suggestion'; text: string };

export type Problem =
  | 'no-placeholder'
  | 'unknown-key'
  | 'unknown-group'
  | 'invalid-char'
  | 'numeral'
  | 'dangling-unit'
  | 'direction'
  | 'repetition';

const PLACEHOLDER = /\{([^{}]+)\}/g;
/** 플레이스홀더를 뺀 문장 문자. GBNF와 같다(grammar.ts). 숫자와 다른 문자 체계, 자모("ㄴ만"), 문장부호 더미를 잡는다 */
const ALLOWED = /^[가-힣 .,?]*$/;
/**
 * 문법으로 막을 수 없는 한글 수사와 단위(PRD 4.6). 낱말 첫머리에서만 본다("이번 주", "이건"은 수사가 아니다).
 * 한자어 수는 원·퍼센트·배와, 고유어 수는 번·개·잔 같은 단위와 쓴다
 */
const SINO = /(?:^|[^가-힣])[일이삼사오육칠팔구십백천만억]+\s?(?:원|퍼센트|프로|배)/;
const NATIVE =
  /(?:^|[^가-힣])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰)\s?(?:번|배|개|건|명|잔|곳|가지|차례|끼)/;
/** 숫자 없이 홀로 남은 단위("지출이  원 늘었어요", "{memo.1.count} 번"). 숫자를 쓰려다 막힌 흔적이다 */
const DANGLING_UNIT = /(?:^|[^가-힣])(?:원|퍼센트|프로|번|배|개|건)(?=[^가-힣]|$)/;
/**
 * 값에 단위가 있는데 플레이스홀더 뒤에 단위를 또 쓴 것("{amount} 원의" → "412,300원 원의", "1일 일").
 * 뒤에 조사가 오는 경우까지 본다. "원하는", "일주일"처럼 단위로 시작하는 낱말은 조사가 아니라 걸리지 않는다
 */
const UNIT_AFTER =
  /\}\s+(?:원|퍼센트|프로|번|배|개|건|일)(?=[^가-힣]|$|[의이가을를은는과와로도만에])/;
/**
 * 방향을 플레이스홀더 없이 직접 쓴 말. 증감 방향은 코드가 서술어 값으로 쓴다(PRD 2장). 직접 쓰면 facts에 없는
 * 증감(“충동 태그 지출이 늘었어요”)이나 반대 방향을 지어낼 수 있다
 */
const DIRECTION = /늘었|늘어|줄었|줄어|증가|감소|많아졌|적어졌|커졌|작아졌|높아졌|낮아졌|올랐|내렸/;
/** 같은 글자를 세 번 넘게 잇는 되풀이("했어요요요요"). 작은 모델이 문법 안에서 빠지는 반복이다 */
const REPETITION = /([가-힣])\1\1/;
/** "한 번 더 생각해 보세요"의 한 번은 횟수가 아니라 관용구다 */
const IDIOM = /(?:^|[^가-힣])한\s?번/g;

export function checkSentence(text: string, keys: Set<string>, requirePlaceholder: boolean) {
  const used = [...text.matchAll(PLACEHOLDER)].map(m => m[1]).filter(t => !JOSA_PAIRS.includes(t));
  const plain = text.replace(PLACEHOLDER, ' ');
  const words = plain.replace(IDIOM, ' ');
  const problems: Problem[] = [];
  if (requirePlaceholder && used.length === 0) problems.push('no-placeholder');
  if (used.some(key => !keys.has(key))) problems.push('unknown-key');
  if (!ALLOWED.test(plain)) problems.push('invalid-char');
  if (SINO.test(words) || NATIVE.test(words)) problems.push('numeral');
  if (DANGLING_UNIT.test(words) || UNIT_AFTER.test(text)) problems.push('dangling-unit');
  if (DIRECTION.test(plain)) problems.push('direction');
  if (REPETITION.test(plain)) problems.push('repetition');
  return problems;
}

/**
 * 필드 하나의 사후 검사. 문장 하나는 묶음 하나의 키만 쓴다(grammar.ts). insight는 about에 쓴 묶음,
 * headline·suggestion은 첫 플레이스홀더의 묶음이다
 */
export function checkField(keyed: KeyedFacts, field: Field): Problem[] {
  const require = field.field !== 'suggestion';
  const about =
    field.field === 'insight'
      ? field.about
      : keyed.groups.find(g => g.facts.some(f => field.text.includes(`{${f.key}}`)))?.id;
  if (field.field !== 'insight' && about === undefined) {
    return checkSentence(field.text, new Set(), require);
  }
  const group = keyed.groups.find(g => g.id === about);
  if (!group) return ['unknown-group'];
  return checkSentence(field.text, new Set(group.facts.map(f => f.key)), require);
}

export function fieldsOf(output: Output): Field[] {
  return [
    { field: 'headline', text: output.headline },
    ...output.insights.map((insight, index) => ({ field: 'insight' as const, index, ...insight })),
    { field: 'suggestion', text: output.suggestion },
  ];
}

/**
 * 모델 출력 문자열을 읽는다. Qwen3.5는 추론 모드를 꺼도 앞에 빈 `<think></think>`를 붙이므로 뗀다(PRD 6장).
 * 읽을 수 없으면 undefined
 */
export function parseOutput(raw: string): Output | undefined {
  const body = raw
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '')
    .replace(/^\s*```(?:json)?\s*/, '')
    .replace(/\s*```\s*$/, '');
  try {
    const parsed = OutputSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
