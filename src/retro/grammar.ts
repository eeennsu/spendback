import type { FactGroup, KeyedFact, KeyedFacts } from './keys';
import { JOSA_PAIRS } from './render';

/**
 * 요청마다 facts의 키로 GBNF 문법을 만든다(PRD 4.6). 출력은 아래 JSON 하나다.
 *
 *   {"headline": "…", "insights": [{"about": "<묶음 id>", "text": "…"}, …(2~4개)], "suggestion": "…"}
 *
 * - 문장 문자는 화이트리스트(한글 음절, 공백, `.,!?·~()-`)다. 숫자와 다른 문자 체계를 원천 차단한다(PRD 13장)
 * - headline과 insight는 플레이스홀더를 1개 이상 쓴다. insight는 about에 고른 묶음의 키만 쓴다
 * - 플레이스홀더 바로 뒤에는 조사 쌍, 받침과 상관없는 조사, 문장부호·공백, 문장 끝만 올 수 있다.
 *   "20,100원원"(단위 중복), "54,000원였어요"(조사), "늘었어요가"(서술어를 명사로 씀)를 구조로 막는다
 */

/** 받침과 상관없이 붙는 조사 */
const PARTICLES = ['의', '도', '만', '에', '에서', '까지', '보다', '부터', '처럼', '만큼'];

/** 문장 조각 길이 상한. 채운 뒤의 길이 한도(headline 30자, insight 60자, suggestion 45자)는 하네스가 잰다 */
const SPAN = { headline: 30, insight: 50, suggestion: 45 };

const literal = (s: string) => JSON.stringify(s);
const alt = (items: string[]) => items.map(literal).join(' | ');

function placeholderRules(name: string, facts: KeyedFact[]) {
  const nouns = facts.filter(f => f.kind === 'noun').map(f => f.key);
  const predicates = facts.filter(f => f.kind === 'predicate').map(f => f.key);
  const options = [
    ...(nouns.length ? [`"{" (${alt(nouns)}) "}" (josa | particle)?`] : []),
    ...(predicates.length ? [`"{" (${alt(predicates)}) "}"`] : []),
  ];
  return [
    `ph-${name} ::= ${options.join(' | ')}`,
    // 플레이스홀더 뒤에는 끝이거나, 경계 문자 다음에 글자와 다음 플레이스홀더가 온다
    `tail-${name} ::= (b c{0,40} (ph-${name} tail-${name})?)?`,
  ];
}

export function buildGrammar(keyed: KeyedFacts) {
  const all = keyed.groups.flatMap(g => g.facts);
  const insight = (g: FactGroup, i: number) =>
    `ins-${i} ::= "{" ws "\\"about\\":" ws ${literal(`"${g.id}"`)} ws "," ws "\\"text\\":" ws "\\"" c{0,${SPAN.insight}} ph-${i} tail-${i} "\\"" ws "}"`;

  return [
    'root ::= "{" ws "\\"headline\\":" ws "\\"" headline "\\"" ws "," ws "\\"insights\\":" ws "[" ws ins (ws "," ws ins){1,3} ws "]" ws "," ws "\\"suggestion\\":" ws "\\"" suggestion "\\"" ws "}"',
    `headline ::= c{0,${SPAN.headline}} ph-all tail-all`,
    `suggestion ::= c{1,${SPAN.suggestion}} | c{0,${SPAN.suggestion}} ph-all tail-all`,
    `ins ::= ${keyed.groups.map((_, i) => `ins-${i}`).join(' | ')}`,
    ...keyed.groups.map(insight),
    ...placeholderRules('all', all),
    ...keyed.groups.flatMap((g, i) => placeholderRules(String(i), g.facts)),
    `josa ::= ${alt(JOSA_PAIRS.map(pair => `{${pair}}`))}`,
    `particle ::= ${alt(PARTICLES)}`,
    'c ::= [\\uAC00-\\uD7A3 .,!?·~()-]',
    'b ::= [ .,!?·~()-]',
    'ws ::= [ \\n]?',
  ].join('\n');
}
