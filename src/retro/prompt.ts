import type { Frame } from './frames';
import { type KeyedFacts, factValues } from './keys';
import { render } from './render';

/**
 * 회고 스냅샷에 함께 저장한다(PRD 6장). 프롬프트나 문법을 바꾸면 올린다.
 * v3는 문장 틀, v4는 v3에 사실 순서·headline 후보·제안 모양을 더한 것이다(PRD 11장). v1(LLM이 플레이스홀더로
 * 문장을 씀)·v2(묶음별 예시)·v3 코드는 걷어 냈다. 결과는 scripts/eval/README.md에 있다.
 * 하네스로 프롬프트를 비교할 때는 버전을 더하고 --prompt로 고른다(narrate.ts FORMATS)
 */
export const PROMPT_VERSIONS = ['v4'] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
export const PROMPT_VERSION: PromptVersion = 'v4';

export type Message = { role: 'system' | 'user'; content: string };

const unit = (kind: KeyedFacts['kind']) => (kind === 'weekly' ? '주' : '달');
/** 제안의 첫머리. 문법이 강제한다(grammar.ts) */
const next = (kind: KeyedFacts['kind']) => `다음 ${unit(kind)}에는`;

/** 문장은 코드가 이미 썼다. LLM은 어떤 문장을 어떤 순서로 보일지 고르고 제안 한 문장만 쓴다 */
function system(kind: KeyedFacts['kind']) {
  return `너는 가계부 앱에서 한 ${unit(kind)}의 소비 회고를 엮는 담백한 분석가다. 회고에 쓸 문장은 앱이 이미 써 두었다. 너는 그중 무엇을 어떤 순서로 보여 줄지 고르고, 제안 한 문장만 직접 쓴다.

규칙:
- 문장은 묶음([ ] 안)별로 적었고, 묶음은 눈에 띄는 것부터 적었다.
- headline에는 이번 ${unit(kind)}에 가장 눈에 띄는 사실의 문장 id를 하나 쓴다. "headline 후보"에서 고른다.
- insights에는 headline과 다른 묶음의 문장 id를 2~4개, 중요한 것부터 쓴다. 묶음마다 하나만 고른다.
- suggestion은 headline이나 insights에서 고른 사실 하나에 맞춰 다음 ${unit(kind)}에 할 수 있는 일 하나를 권하는 한 문장이다. "${next(kind)}"으로 시작해 "해 보세요.", "확인하세요."처럼 "세요."로 끝낸다. 훈계하거나 과장하지 않고, 낱말은 띄어 쓴다.
- 제안 예: "${next(kind)} {category.9.name} 예산을 주 단위로 나눠 보세요.", "${next(kind)} 지출이 없는 날을 하루 더 만들어 보세요.", "${next(kind)} {memo.2.text}{을/를} 집에서 준비해 보세요." 예를 그대로 옮기지 말고 이번 사실에 맞게 쓴다.
- suggestion에는 숫자를 쓸 수 없다. 카테고리·태그 이름과 메모는 "이름 키"의 {키}로 쓰고, {키} 바로 뒤에 조사를 쓸 때는 {이/가}, {을/를}, {은/는}, {와/과}, {으로/로} 중 하나를 쓴다.
- JSON만 출력한다.

출력 예(다른 facts로 쓴 예라 id는 그대로 쓰지 않는다):
{"headline": "category.9.change", "insights": ["budget.usage_balance", "tag.8.amount_share", "regret.amount_share"], "suggestion": "${next(kind)} {category.9.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;
}

/** 묶음마다 채운 문장을 id와 함께 쓴다. headline 후보와 제안에 쓸 이름 키를 따로 적는다 */
function user(keyed: KeyedFacts, frames: Frame[], headlines: Frame[], names: string[]) {
  const values = factValues(keyed);
  const filled = (text: string) => render(text, values);
  const groups = keyed.groups
    .map(g => {
      const mine = frames.filter(f => f.group === g.id);
      if (!mine.length) return '';
      return [`[${g.id}] ${g.title}`, ...mine.map(f => `${f.id}: ${filled(f.text)}`)].join('\n');
    })
    .filter(Boolean);
  const nameLine = names.map(key => `{${key}} = ${values[key]}`).join(', ');
  const period = keyed.kind === 'weekly' ? '이번 주' : '이번 달';
  return `문장(id: 문장)\n\n${groups.join('\n\n')}\n\nheadline 후보: ${headlines.map(f => f.id).join(', ')}\n\n이름 키: ${nameLine}\n\n${period} 회고를 JSON으로 써 줘.`;
}

export function buildMessages(
  keyed: KeyedFacts,
  frames: Frame[],
  headlines: Frame[],
  names: string[],
): Message[] {
  return [
    { role: 'system', content: system(keyed.kind) },
    { role: 'user', content: user(keyed, frames, headlines, names) },
  ];
}
