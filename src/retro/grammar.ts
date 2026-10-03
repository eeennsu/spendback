import type { KeyedFacts } from './keys';
import { JOSA_PAIRS } from './render';

/**
 * 요청마다 문장 틀 id와 이름 키로 GBNF 문법을 만든다(PRD 4.6). 출력은 아래 JSON 하나다.
 *
 *   {"headline": "<틀 id>", "insights": ["<틀 id>", …(2~4개)], "suggestion": "다음 주에는 … 보세요."}
 *
 * - headline은 headline 후보(눈에 띄는 묶음의 짧은 틀, frames.ts)에서, insight는 headline과 다른 묶음의 틀에서
 *   id만 고른다. 첫 하네스(v3)에서 Kanana·EXAONE 재시도의 대부분이 headline 묶음을 insight로 다시 고른 것이었다.
 *   사실 문장은 코드가 쓴 틀이라 키 오용, 단위 중복, 조사 오류가 생기지 않는다
 * - LLM이 직접 쓰는 문장은 suggestion 하나다. "다음 주에는"(월간은 "다음 달에는")으로 시작해 "보세요."·"하세요."
 *   처럼 "세요."로 끝나고, 사이는 한글 낱말을 공백이나 ", "로 잇는다. 다짐·질문·습니다체가 나올 자리가 없다.
 *   "보세요."로만 끝내게 하면 "생각하세요 보세요"처럼 끝이 어긋났고, "보세요" 앞을 연결형으로 묶으면
 *   "필요한지에대 보세요"처럼 일찍 끊겼다(하네스 v4). 숫자와 다른 문자 체계를 원천 차단한다(PRD 13장).
 *   PRD의 화이트리스트(`.,!?·~()-`)에서 괄호·가운뎃점·물결·붙임표·느낌표를 뺐다
 * - suggestion의 플레이스홀더는 이름 키(카테고리·태그 이름, 메모)만 2개까지 쓴다. 금액·비율 같은 값은 틀이 쓴다
 * - 플레이스홀더 앞에는 공백이 온다. 바로 뒤에는 조사 쌍, 받침과 상관없는 조사만 붙고, 다음 낱말은 단위 글자로
 *   시작할 수 없다. "배달 번", "54,000원였어요" 같은 오류를 구조로 막는다
 * - 증감을 직접 쓰는 낱말(늘었·줄어·증가·감소…)로 시작할 수 없다. 증감은 코드가 쓴 틀로만 말한다(PRD 2장).
 *   첫 하네스에서 "충동 태그 지출은 지난주보다 늘었어요"처럼 facts에 없는 증감을 가장 많이 지어냈다
 */

/** 받침과 상관없이 붙는 조사 */
const PARTICLES = ['의', '도', '만', '에', '에서', '까지', '보다', '부터', '처럼', '만큼'];

/**
 * 제안 낱말 하나의 길이 상한(글자). 띄어 쓰지 않고 뭉친 낱말("다시한번생각해")을 막는다. 일곱 자에서는 Kanana가
 * "다시한번생각해 보세요"를 거의 매번 썼다(하네스 v4)
 */
const WORD_LENGTH = 6;

/** 플레이스홀더 바로 다음 낱말이 시작할 수 없는 글자. 원·번·일·퍼센트 같은 단위의 첫 글자다 */
const UNIT_STARTS = ['개', '건', '배', '번', '원', '일', '퍼', '회'];

/**
 * 증감을 직접 쓰는 낱말의 첫 글자와 그 뒤 둘째 글자. 늘·줄은 제안에 쓰는 늘려·줄여·줄이만 허용하고
 * (늘었·늘어·늘면·늘했 같은 우회를 막는다), 증·감은 증가·감소만 막는다(증거, 감사는 쓸 수 있다)
 */
const DIRECTION_HEADS: Record<string, { allow: string[] } | { deny: string[] }> = {
  늘: { allow: ['려'] },
  줄: { allow: ['여', '이'] },
  증: { deny: ['가'] },
  감: { deny: ['소'] },
};

const hex = (code: number) => `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;

/** 한글 음절(가~힣)에서 몇 글자를 뺀 문자 집합 */
function hangulExcept(chars: string[]) {
  const ranges: string[] = [];
  let from = 0xac00;
  for (const code of chars.map(c => c.charCodeAt(0)).sort((a, b) => a - b)) {
    if (code > from) ranges.push(`${hex(from)}-${hex(code - 1)}`);
    from = code + 1;
  }
  ranges.push(`${hex(from)}-${hex(0xd7a3)}`);
  return `[${ranges.join('')}]`;
}

const literal = (s: string) => JSON.stringify(s);
const alt = (items: string[]) => items.map(literal).join(' | ');

/** 낱말 규칙. banned 글자로 시작할 수 없고, 증감을 직접 쓰는 낱말로 시작할 수 없다 */
function wordRule(name: string, banned: string[]) {
  const heads = Object.keys(DIRECTION_HEADS).filter(head => !banned.includes(head));
  const second = (head: string) => {
    const rule = DIRECTION_HEADS[head];
    return 'allow' in rule ? `[${rule.allow.join('')}]` : hangulExcept(rule.deny);
  };
  const options = [
    `${hangulExcept([...banned, ...heads])} rest`,
    ...heads.map(head => `"${head}" (${second(head)} rest)?`),
  ];
  return `${name} ::= ${options.join(' | ')}`;
}

/** 틀 id와 그 틀의 묶음 */
export type Choice = { id: string; group: string };

/**
 * @param headlines headline으로 고를 수 있는 틀
 * @param frames insight로 고를 수 있는 틀. 총지출 묶음은 빠져 있다(frames.ts insightFrames)
 * @param names 제안에 쓸 수 있는 이름 키(frames.ts nameKeys)
 */
export function buildGrammar(
  headlines: Choice[],
  frames: Choice[],
  names: string[],
  kind: KeyedFacts['kind'],
) {
  const ids = (list: Choice[]) => list.map(c => literal(`"${c.id}"`)).join(' | ');
  const groups = [...new Set(headlines.map(h => h.group))];
  /** headline 묶음 i를 뺀 insight. 다른 묶음이 없으면(사실이 한 묶음뿐) 모든 틀에서 고른다 */
  const insightRule = (group: string, i: number) => {
    const others = frames.filter(f => f.group !== group);
    return `ins-${i} ::= ${ids(others.length ? others : frames)}`;
  };
  const headRule = (group: string, i: number) =>
    `head-${i} ::= (${ids(headlines.filter(h => h.group === group))}) ws "," ws "\\"insights\\":" ws "[" ws ins-${i} (ws "," ws ins-${i}){1,3} ws "]"`;
  const lead = kind === 'weekly' ? '다음 주에는 ' : '다음 달에는 ';
  // 낱말 수 상한은 넉넉히 둔다. 상한에 닿으면 모델이 쓰던 문장을 "필요한지세요.", "생각해세요."처럼 끊었다
  // (하네스 v4, "{이름} 지출 전에 꼭 필요한지 다시 한 번 생각해 보세요"는 열 낱말이다). 길이는 하네스가 잰다
  const body = names.length
    ? [
        '(w gap){0,11} stem',
        '(w gap){0,4} nph gap (wa gap (w gap){0,9})? stem',
        '(w gap){0,3} nph gap (wa gap (w gap){0,5})? nph gap (wa gap (w gap){0,6})? stem',
      ].join(' | ')
    : '(w gap){0,11} stem';
  return [
    `root ::= "{" ws "\\"headline\\":" ws (${groups.map((_, i) => `head-${i}`).join(' | ')}) ws "," ws "\\"suggestion\\":" ws "\\"" suggestion "\\"" ws "}"`,
    ...groups.map(headRule),
    ...groups.map(insightRule),
    `suggestion ::= ${literal(lead)} sbody "세요."`,
    `sbody ::= ${body}`,
    ...(names.length ? [`nph ::= "{" (${alt(names)}) "}" (josa | particle)?`] : []),
    `josa ::= ${alt(JOSA_PAIRS.map(pair => `{${pair}}`))}`,
    `particle ::= ${alt(PARTICLES)}`,
    wordRule('w', []),
    wordRule('wa', UNIT_STARTS),
    `rest ::= [\\uAC00-\\uD7A3]{0,${WORD_LENGTH - 1}}`,
    // 마지막 낱말은 "세요"로 끝난다("보세요", "확인하세요"). stem은 그 앞 글자다
    `stem ::= [\\uAC00-\\uD7A3]{1,${WORD_LENGTH - 2}}`,
    'gap ::= " " | ", "',
    'ws ::= [ \\n]?',
  ].join('\n');
}
