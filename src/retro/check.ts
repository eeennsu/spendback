import { z } from 'zod';

import type { KeyedFacts } from './keys';
import { JOSA_PAIRS } from './render';

/**
 * 저장하는 회고 출력(PRD 4.6). 코드가 LLM이 고른 틀 id를 플레이스홀더 문장으로 펼친 모양이다(frames.ts).
 * 저장본 읽기와 백업 가져오기에서 검증한다
 */
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
  | 'repetition'
  | 'too-long';

const PLACEHOLDER = /\{([^{}]+)\}/g;
/** 플레이스홀더를 뺀 문장 문자. GBNF와 같다(grammar.ts). 숫자와 다른 문자 체계, 자모("ㄴ만"), 문장부호 더미를 잡는다 */
const ALLOWED = /^[가-힣 .,?]*$/;
const NATIVE_NUMBER = '한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰';
/**
 * 문법으로 막을 수 없는 한글 수사와 단위(PRD 4.6). 낱말 첫머리에서만 본다("이번 주", "이건"은 수사가 아니다).
 * 한자어 수는 원·퍼센트·배와, 고유어 수는 번·개·잔·달 같은 단위와 쓴다. 분수("삼분의 일"), 몫("남은 이분"),
 * 할("팔할"), 옛 수사("석 달"), 날수("엿새"), 낱말 안의 금액("한천원")도 본다. 낱말과 겹치는 글자는 뺀다
 * ("구분", "일할 때", "구할", "십분 활용")
 */
const NUMERALS = [
  /(?:^|[^가-힣])[일이삼사오육칠팔구십백천만억]+\s?(?:원|퍼센트|프로|배)/,
  new RegExp(
    `(?:^|[^가-힣])(?:${NATIVE_NUMBER})\\s?(?:번|배|개|건|명|잔|곳|가지|차례|끼|달|주|해|시간|분|살)`,
  ),
  new RegExp(`(?:^|[^가-힣])(?:[일이삼사오육칠팔구십백]+|${NATIVE_NUMBER})\\s?분의`),
  /(?:^|[^가-힣])[이삼사오육칠팔]분(?=[^가-힣]|$|[의을만도이은까])/,
  /(?:^|[^가-힣])[이삼사오육칠팔]할(?=[^가-힣]|$|[을이은의만도])/,
  /(?:^|[^가-힣])(?:석|넉)\s?(?:달|잔|장|되|말|주)/,
  /(?:^|[^가-힣])(?:이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름)/,
  /[천만억]\s?원(?=[^가-힣]|$|[이을은의만도에으과씩짜쯤대])/,
];
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
/** "한 번 더 생각해 보세요", "한 달 동안"은 횟수·기간이 아니라 관용구다 */
const IDIOM = /(?:^|[^가-힣])한\s?(?:번|달|주)/g;

export function checkSentence(text: string, keys: Set<string>, requirePlaceholder: boolean) {
  const used = [...text.matchAll(PLACEHOLDER)].map(m => m[1]).filter(t => !JOSA_PAIRS.includes(t));
  const plain = text.replace(PLACEHOLDER, ' ');
  const words = plain.replace(IDIOM, ' ');
  const problems: Problem[] = [];
  if (requirePlaceholder && used.length === 0) problems.push('no-placeholder');
  if (used.some(key => !keys.has(key))) problems.push('unknown-key');
  if (!ALLOWED.test(plain)) problems.push('invalid-char');
  if (NUMERALS.some(pattern => pattern.test(words))) problems.push('numeral');
  if (DANGLING_UNIT.test(words) || UNIT_AFTER.test(text)) problems.push('dangling-unit');
  if (DIRECTION.test(plain)) problems.push('direction');
  if (REPETITION.test(plain)) problems.push('repetition');
  return problems;
}

/**
 * 필드 하나의 사후 검사. 문장 하나는 묶음 하나의 키만 쓴다. insight는 about에 쓴 묶음, headline·suggestion은
 * 첫 플레이스홀더의 묶음이다. 틀을 펼친 문장은 코드가 써서 걸리지 않지만 한 번 더 막는다(frames.ts)
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
