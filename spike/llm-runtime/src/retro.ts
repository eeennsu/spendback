// 버릴 코드(PROTOTYPE): 회고 프롬프트, 플레이스홀더 GBNF, 사후 검사를 가장 단순하게 흉내 낸다.
//
// v1(블랙리스트 문법: 0-9, %, 전각 숫자만 뺌)은 아랍·페르시아 숫자, 분수(⅔), 단위 기호(㎡), 자모(ㄴ만), 외국 문자로 우회됐다.
// v2는 문장 문자를 화이트리스트(한글 음절, 공백, 일부 문장부호)로 두고, headline과 insights에 플레이스홀더를 1개 이상 강제한다.
import facts from './facts.json';

export type Facts = Record<string, string>;
export const FACTS: Facts = facts;
export const PROMPT_VERSION = 'v2';

const SYSTEM = `너는 가계부 앱에서 한 주의 소비 회고를 쓰는 담백한 분석가다. 사용자가 준 facts만 근거로 쓴다.

규칙:
- 숫자는 쓸 수 없다. 금액, 비율, 횟수, 증감, 카테고리·태그 이름, 메모는 facts의 {키}를 그대로 써서 가리킨다. 앱이 {키}를 값으로 바꾼다.
- 값에는 이미 단위가 들어 있다. {키} 뒤에 원, %, 번 같은 단위를 붙이지 않는다.
- change_phrase 값은 "늘었어요" 또는 "줄었어요"로 끝나는 서술어다. 문장 끝에 그대로 쓴다.
- headline과 insights의 각 문장에는 {키}를 하나 이상 쓴다.
- 해요체 한국어로만 쓴다.
- JSON만 출력한다. headline은 한 문장, insights는 2~4개의 문장, suggestion은 다음 주를 위한 제안 한 문장이다.

출력 예(다른 facts로 쓴 예라서 키는 그대로 쓰지 않는다):
{"headline": "{category.c5.name} 지출이 {category.c5.change_phrase}.", "insights": ["{category.c5.name} 지출이 변동비의 {category.c5.share}를 차지했어요.", "{tag.t1.name} 태그가 붙은 지출은 {tag.t1.amount}였어요."], "suggestion": "다음 주에는 {category.c5.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;

export function buildMessages(f: Facts) {
  const lines = Object.entries(f)
    .map(([k, v]) => `{${k}} = ${v}`)
    .join('\n');
  return [
    {role: 'system' as const, content: SYSTEM},
    {role: 'user' as const, content: `facts:\n${lines}\n\n이번 주 회고를 JSON으로 써 줘.`},
  ];
}

export function buildGrammar(f: Facts) {
  const keys = Object.keys(f)
    .map(k => `"${k}"`)
    .join(' | ');
  return `root ::= "{" ws "\\"headline\\":" ws hs ws "," ws "\\"insights\\":" ws "[" ws hs ws "," ws hs (ws "," ws hs)? (ws "," ws hs)? ws "]" ws "," ws "\\"suggestion\\":" ws ss ws "}"
hs ::= "\\"" c{0,60} ph p{0,100} "\\""
ss ::= "\\"" p{1,120} "\\""
p ::= c | ph
c ::= [\\uAC00-\\uD7A3 .,!?·~()-]
ph ::= "{" k "}"
k ::= ${keys}
ws ::= [ \\n]?`;
}

const NUMERAL =
  /(?:[일이삼사오육칠팔구십백천만억]+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰|[ㄱ-ㅎ]+만?)\s?(?:원|배|번|개|건|퍼센트|프로|명|잔|회|곳|가지)/g;
const PH = /\{([^{}\s"]+)\}/g;

export function check(raw: string, f: Facts) {
  const body = raw
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '')
    .replace(/^\s*```(?:json)?\s*/, '')
    .replace(/\s*```\s*$/, '');
  let parsed: any = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    parseError = String(e);
  }
  const schemaOk =
    !!parsed &&
    typeof parsed.headline === 'string' &&
    Array.isArray(parsed.insights) &&
    parsed.insights.every((x: unknown) => typeof x === 'string') &&
    typeof parsed.suggestion === 'string';
  const sentences: string[] = schemaOk ? [parsed.headline, ...parsed.insights, parsed.suggestion] : [body];
  const used = sentences.flatMap(s => [...s.matchAll(PH)].map(m => m[1]));
  const unknownKeys = [...new Set(used.filter(k => !(k in f)))];
  const stripped = sentences.map(s => s.replace(PH, ''));
  const digits = stripped.join(' ').match(/[\p{Nd}\p{No}%％]/gu) ?? [];
  const foreign = stripped.join(' ').match(/[^가-힣\s.,!?·~()\-'"]/gu) ?? [];
  const numerals = stripped.flatMap(s => [...s.matchAll(NUMERAL)].map(m => m[0]));
  const rendered = sentences.map(s => s.replace(PH, (m, k) => f[k] ?? m));
  return {
    schemaOk,
    insights: schemaOk ? parsed.insights.length : null,
    parseError,
    placeholders: used.length,
    distinctKeys: new Set(used).size,
    sentencesWithPh: sentences.filter(s => s.match(PH)).length,
    sentences: sentences.length,
    unknownKeys,
    digits: digits.join(''),
    foreign: [...new Set(foreign)].join(''),
    numerals,
    maxSentenceLen: Math.max(0, ...sentences.map(s => s.length)),
    rendered,
  };
}
