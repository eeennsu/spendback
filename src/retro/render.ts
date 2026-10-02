/**
 * LLM이 쓴 문장의 `{키}`를 facts 값으로, `{이/가}` 같은 조사 쌍을 앞 글자에 맞는 조사로 바꾼다(PRD 4.6).
 * 값의 받침은 코드만 안다. 스파이크에서 LLM이 직접 고른 조사는 "54,000원였어요"처럼 틀렸다.
 */

/** 조사 쌍 → [받침이 있을 때, 없을 때] */
const JOSA: Record<string, [string, string]> = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '와/과': ['과', '와'],
  '으로/로': ['으로', '로'],
  '이에요/예요': ['이에요', '예요'],
  '이었어요/였어요': ['이었어요', '였어요'],
};

export const JOSA_PAIRS = Object.keys(JOSA);

const RIEUL = 8;
/** 0~9를 읽은 소리의 받침(영 ㅇ, 일 ㄹ, 이, 삼 ㅁ, 사, 오, 육 ㄱ, 칠 ㄹ, 팔 ㄹ, 구) */
const DIGIT_FINAL = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];
/** 끝자리 0의 개수로 정해지는 자리 이름의 받침(십 ㅂ, 백 ㄱ, 천 ㄴ, 만 ㄴ, …, 억 ㄱ) */
const PLACE_FINAL = [17, 1, 4, 4, 4, 4, 4, 1];
/** 영단어 끝 글자 l·m·n은 받침으로 읽는다(Google 구글, Steam 스팀) */
const LATIN_FINAL: Record<string, number> = { l: 8, m: 16, n: 4 };

/** 마지막으로 읽히는 글자의 받침 번호. 0이면 받침이 없다 */
function finalConsonant(text: string) {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
    if (ch === '%') return 0; // 퍼센트
    if (/\d/.test(ch)) {
      const digits =
        text
          .slice(0, i + 1)
          .replace(/,/g, '')
          .match(/\d+$/)?.[0] ?? ch;
      const zeros = digits.length - digits.replace(/0+$/, '').length;
      if (zeros === 0 || zeros === digits.length) return DIGIT_FINAL[Number(ch)];
      return PLACE_FINAL[Math.min(zeros, PLACE_FINAL.length) - 1];
    }
    if (/[a-z]/i.test(ch)) return LATIN_FINAL[ch.toLowerCase()] ?? 0;
    // 괄호·문장부호·공백은 건너뛴다
  }
  return 0;
}

function josa(pair: string, before: string) {
  const [withFinal, withoutFinal] = JOSA[pair];
  const final = finalConsonant(before);
  // 으로/로는 ㄹ 받침도 로다
  if (pair === '으로/로' && final === RIEUL) return withoutFinal;
  return final ? withFinal : withoutFinal;
}

/** 문장 조각. value는 코드가 채운 facts 값이다. 회고 화면이 값을 강조한다(docs/DESIGN.md 4.4) */
export type Part = { text: string; value: boolean };

/** 서술어 값("29,000원 늘었어요")의 앞 숫자. 강조는 숫자까지다 */
const LEADING_NUMBER = /^(\d[\d,]*(?:원|%))(.*)$/s;

/**
 * 모르는 키는 그대로 둔다. 사후 검사(check.ts)가 모르는 키를 먼저 거른다.
 * predicates에 든 키(서술어 값)는 앞 숫자만 값 조각이고 나머지 서술어("늘었어요")는 문장 글자다
 */
export function renderParts(
  text: string,
  values: Record<string, string>,
  predicates: ReadonlySet<string> = new Set(),
): Part[] {
  const parts: Part[] = [];
  let out = '';
  let last = 0;
  const push = (piece: string, value: boolean) => {
    out += piece;
    const prev = parts[parts.length - 1];
    if (prev && prev.value === value) prev.text += piece;
    else if (piece) parts.push({ text: piece, value });
  };
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    push(text.slice(last, match.index), false);
    const token = match[1];
    const value = values[token];
    if (token in JOSA) push(josa(token, out), false);
    else if (value === undefined) push(match[0], false);
    else if (predicates.has(token)) {
      const [, number = '', rest = value] = value.match(LEADING_NUMBER) ?? [];
      push(number, true);
      push(rest, false);
    } else push(value, true);
    last = match.index + match[0].length;
  }
  push(text.slice(last), false);
  return parts;
}

export function render(text: string, values: Record<string, string>) {
  return renderParts(text, values)
    .map(part => part.text)
    .join('');
}
