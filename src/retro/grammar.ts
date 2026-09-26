import type { FactGroup, KeyedFact, KeyedFacts } from './keys';
import { JOSA_PAIRS } from './render';

/**
 * 요청마다 facts의 키로 GBNF 문법을 만든다(PRD 4.6). 출력은 아래 JSON 하나다.
 *
 *   {"headline": "…", "insights": [{"about": "<묶음 id>", "text": "…"}, …(2~4개)], "suggestion": "…"}
 *
 * - 문장은 한글 낱말을 공백이나 ", "로 이은 것이다. 숫자와 다른 문자 체계를 원천 차단한다(PRD 13장).
 *   PRD의 화이트리스트(`.,!?·~()-`)에서 괄호·가운뎃점·물결·붙임표·느낌표를 뺐다. 첫 하네스에서 2B 모델이
 *   "  )),  ))" 같은 문장부호 더미와 프롬프트의 설명 괄호를 문장에 옮겨 썼다
 * - 문장 하나는 facts 묶음 하나의 키만 쓴다. insight는 about에 묶음을 먼저 쓰고, headline과 suggestion은
 *   첫 플레이스홀더의 묶음을 따른다. "식비 지출이 {total.change_rate_phrase}"처럼 다른 사실에 붙이지 못한다
 * - headline과 insight는 플레이스홀더를 1개 이상, 3개까지 쓰고 사이에 낱말이 있어야 한다
 * - 플레이스홀더 앞에는 공백이 온다. "증가했32,400원 늘었어요"처럼 낱말에 붙여 쓰지 못한다
 * - 플레이스홀더 바로 뒤에는 조사 쌍, 받침과 상관없는 조사, 공백·쉼표, 문장 끝만 온다. 다음 낱말은 단위 글자로
 *   시작할 수 없다. "20,100원원", "1일 일", "54,000원였어요"를 구조로 막는다
 * - 서술어 키 뒤에는 마침표가 온다. "32,400원 늘었어요 늘었어요", "늘었어요가"를 막는다
 * - 증감을 직접 쓰는 낱말(늘었·줄어·증가·감소…)로 시작할 수 없다. 증감은 코드가 쓴 서술어 키로만 말한다(PRD 2장).
 *   첫 하네스에서 "충동 태그 지출은 지난주보다 늘었어요"처럼 facts에 없는 증감을 가장 많이 지어냈다
 */

/** 받침과 상관없이 붙는 조사 */
const PARTICLES = ['의', '도', '만', '에', '에서', '까지', '보다', '부터', '처럼', '만큼'];

/** 낱말 조각의 낱말 수 상한. 문장이 잘리지 않게 넉넉히 두고, 채운 뒤의 길이 한도는 하네스가 잰다 */
const WORDS = 9;

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

function placeholderRule(name: string, facts: KeyedFact[]) {
  const nouns = facts.filter(f => f.kind === 'noun').map(f => f.key);
  const predicates = facts.filter(f => f.kind === 'predicate').map(f => f.key);
  const options = [
    ...(nouns.length ? [`"{" (${alt(nouns)}) "}" (josa | particle)? end?`] : []),
    ...(predicates.length ? [`"{" (${alt(predicates)}) "}" "."`] : []),
  ];
  return `ph-${name} ::= ${options.join(' | ')}`;
}

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

/** (낱말 조각) 플레이스홀더 (낱말 조각 플레이스홀더)×2까지 (낱말 조각과 끝 문장부호) */
const sentence = (ph: string) => `(seg " ")? ${ph} (gap after " " ${ph}){0,2} (gap after end)?`;

export function buildGrammar(keyed: KeyedFacts) {
  const groups = keyed.groups.map((_, i) => i);
  const insight = (g: FactGroup, i: number) =>
    `ins-${i} ::= "{" ws "\\"about\\":" ws ${literal(`"${g.id}"`)} ws "," ws "\\"text\\":" ws "\\"" s-${i} "\\"" ws "}"`;

  return [
    'root ::= "{" ws "\\"headline\\":" ws "\\"" headline "\\"" ws "," ws "\\"insights\\":" ws "[" ws ins (ws "," ws ins){1,3} ws "]" ws "," ws "\\"suggestion\\":" ws "\\"" suggestion "\\"" ws "}"',
    `headline ::= ${groups.map(i => `s-${i}`).join(' | ')}`,
    `suggestion ::= seg end | ${groups.map(i => `s-${i}`).join(' | ')}`,
    `ins ::= ${groups.map(i => `ins-${i}`).join(' | ')}`,
    ...keyed.groups.map(insight),
    ...groups.map(i => `s-${i} ::= ${sentence(`ph-${i}`)}`),
    ...keyed.groups.map((g, i) => placeholderRule(String(i), g.facts)),
    `josa ::= ${alt(JOSA_PAIRS.map(pair => `{${pair}}`))}`,
    `particle ::= ${alt(PARTICLES)}`,
    `seg ::= w (gap w){0,${WORDS - 1}}`,
    `after ::= wa (gap w){0,${WORDS - 1}}`,
    wordRule('w', []),
    wordRule('wa', UNIT_STARTS),
    'rest ::= [\\uAC00-\\uD7A3]{0,11}',
    'gap ::= " " | ", "',
    'end ::= [.?]',
    'ws ::= [ \\n]?',
  ].join('\n');
}
