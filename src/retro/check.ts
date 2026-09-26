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
  'no-placeholder' | 'unknown-key' | 'unknown-group' | 'invalid-char' | 'numeral';

const PLACEHOLDER = /\{([^{}]+)\}/g;
/** 플레이스홀더를 뺀 문장 문자. GBNF의 화이트리스트와 같다. 숫자와 다른 문자 체계, 자모("ㄴ만")를 잡는다 */
const ALLOWED = /^[가-힣 .,!?·~()-]*$/;
/**
 * 문법으로 막을 수 없는 한글 수사와 단위(PRD 4.6). 낱말 첫머리에서만 본다("이번 주", "이건"은 수사가 아니다).
 * 한자어 수는 원·퍼센트·배와, 고유어 수는 번·개·잔 같은 단위와 쓴다
 */
const SINO = /(?:^|[^가-힣])[일이삼사오육칠팔구십백천만억]+\s?(?:원|퍼센트|프로|배)/;
const NATIVE =
  /(?:^|[^가-힣])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰)\s?(?:번|배|개|건|명|잔|곳|가지|차례|끼)/;
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
  return problems;
}

/** 필드 하나의 사후 검사. headline·suggestion은 모든 키, insight는 about에 쓴 묶음의 키만 쓸 수 있다 */
export function checkField(keyed: KeyedFacts, field: Field): Problem[] {
  const allKeys = new Set(keyed.groups.flatMap(g => g.facts.map(f => f.key)));
  if (field.field === 'headline') return checkSentence(field.text, allKeys, true);
  if (field.field === 'suggestion') return checkSentence(field.text, allKeys, false);
  const group = keyed.groups.find(g => g.id === field.about);
  if (!group) return ['unknown-group'];
  return checkSentence(field.text, new Set(group.facts.map(f => f.key)), true);
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
