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

/** 모르는 키는 그대로 둔다. 사후 검사(check.ts)가 모르는 키를 먼저 거른다 */
export function render(text: string, values: Record<string, string>) {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    out += text.slice(last, match.index);
    const token = match[1];
    out += token in JOSA ? josa(token, out) : (values[token] ?? match[0]);
    last = match.index + match[0].length;
  }
  return out + text.slice(last);
}
