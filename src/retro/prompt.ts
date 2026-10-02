import { type Frame, groupKind, headlineFrames } from './frames';
import { type KeyedFacts, factValues } from './keys';
import { render } from './render';

/**
 * 회고 스냅샷에 함께 저장한다(PRD 6장). 프롬프트나 문법을 바꾸면 올린다.
 * PRD 11장 "회고 문장 품질" 비교용으로 셋을 둔다. v1은 첫 하네스, v2는 v1에 묶음별 예시(①), v3는 문장 틀(③)이다
 */
export const PROMPT_VERSIONS = ['v1', 'v2', 'v3'] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
export const PROMPT_VERSION: PromptVersion = 'v1';

export type Message = { role: 'system' | 'user'; content: string };

const unit = (kind: KeyedFacts['kind']) => (kind === 'weekly' ? '주' : '달');

function system(kind: KeyedFacts['kind'], version: 'v1' | 'v2') {
  const example =
    version === 'v1'
      ? '- // 뒤의 설명은 키를 이해하라고 붙인 것이다. 문장에 옮겨 쓰지 않는다.'
      : '- // 뒤의 설명은 키를 이해하라고 붙인 것이다. 문장에 옮겨 쓰지 않는다.\n- "예:"는 그 묶음의 키로 쓴 문장이다. 같은 종류의 다른 묶음(category.1, category.2 …)도 이 모양으로 쓴다.';
  return `너는 가계부 앱에서 한 ${unit(kind)}의 소비 회고를 쓰는 담백한 분석가다. 주어진 facts만 근거로 쓴다.

규칙:
- 숫자를 쓸 수 없다. 금액, 비율, 횟수, 날짜, 증감, 카테고리와 태그 이름, 메모는 facts의 {키}로 가리킨다. 앱이 {키}를 값으로 바꾼다.
- 값에는 단위가 들어 있다. {키} 뒤에 원, %, 번 같은 단위를 붙이지 않는다.
- "서술어"라고 적힌 키는 "32,400원 늘었어요"처럼 그 자체로 문장을 끝내는 말이다. 문장 끝에 쓰고 바로 뒤에 마침표를 찍는다.
- 늘었어요, 줄었어요, 남았어요, 넘었어요 같은 증감과 방향은 직접 쓰지 않고 서술어 키로만 쓴다.
- {키} 바로 뒤에 조사를 쓸 때는 {이/가}, {을/를}, {은/는}, {와/과}, {으로/로}, {이에요/예요}, {이었어요/였어요} 중 하나를 쓴다. 앱이 알맞은 조사를 고른다.
- insight마다 facts 묶음 하나를 골라 about에 [ ] 안의 묶음 id를 쓰고, text에는 그 묶음의 키만 쓴다.
- headline은 가장 눈에 띄는 사실 한 문장, insights는 서로 다른 사실 2~4개, suggestion은 다음 ${unit(kind)}를 위한 제안 한 문장이다.
- 해요체로 쓰고, 훈계하거나 과장하지 않는다.
${example}
- JSON만 출력한다.

출력 예(다른 facts로 쓴 예라 키는 그대로 쓰지 않는다):
{"headline": "{category.9.name} 지출이 {category.9.change_phrase}.", "insights": [{"about": "category.9", "text": "{category.9.name}{이/가} 변동비의 {category.9.share}{을/를} 차지했어요."}, {"about": "tag.8", "text": "{tag.8.name} 태그가 붙은 지출은 {tag.8.amount}{이었어요/였어요}."}], "suggestion": "다음 ${unit(kind)}에는 {category.9.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;
}

/** v2 예시로 보여 줄 틀. 묶음 종류마다 처음 나온 묶음에 하나만 붙여 프롬프트가 길어지지 않게 한다 */
const EXAMPLE_ORDER: Record<string, string[]> = {
  total: ['change', 'rate', 'variable', 'split'],
  budget: ['usage_balance', 'usage', 'balance'],
  category: ['change_share', 'amount_share', 'change', 'budget'],
  tag: ['amount_share', 'amount'],
  regret: ['amount_share', 'amount'],
  largest: ['memo', 'category'],
  no_spend: ['days'],
  busiest: ['day_amount', 'weekday_amount', 'day', 'weekday'],
  memo: ['count'],
  income: ['rate'],
};

function exampleFor(groupId: string, frames: Frame[]) {
  const mine = frames.filter(f => f.group === groupId);
  for (const name of EXAMPLE_ORDER[groupKind(groupId)] ?? []) {
    const frame = mine.find(f => f.id === `${groupId}.${name}`);
    if (frame) return frame.text;
  }
  return undefined;
}

/** facts를 묶음별로 쓴다. 묶음 id와 키 설명이 있어야 모델이 키를 엉뚱한 사실에 붙이지 않는다(PRD 10장) */
function user(keyed: KeyedFacts, version: 'v1' | 'v2', frames: Frame[]) {
  const seen = new Set<string>();
  const groups = keyed.groups.map(g => {
    const lines = [
      `[${g.id}] ${g.title}`,
      ...g.facts.map(
        f => `{${f.key}} = ${f.value} // ${f.kind === 'predicate' ? '서술어. ' : ''}${f.note}`,
      ),
    ];
    if (version === 'v2' && !seen.has(groupKind(g.id))) {
      seen.add(groupKind(g.id));
      const example = exampleFor(g.id, frames);
      if (example) lines.push(`예: ${example}`);
    }
    return lines.join('\n');
  });
  const period = keyed.kind === 'weekly' ? '이번 주' : '이번 달';
  // v2는 "기간:" 줄을 뺀다. 첫 하네스에서 EXAONE이 headline을 "기간은 …"으로 옮겨 썼다
  const head = version === 'v1' ? `기간: ${keyed.period}\n\n` : '';
  return `${head}${groups.join('\n\n')}\n\n${period} 회고를 JSON으로 써 줘.`;
}

/** v3: 문장은 코드가 이미 썼다. LLM은 어떤 문장을 어떤 순서로 보일지 고르고 제안 한 문장만 쓴다 */
function frameSystem(kind: KeyedFacts['kind']) {
  return `너는 가계부 앱에서 한 ${unit(kind)}의 소비 회고를 엮는 담백한 분석가다. 회고에 쓸 문장은 앱이 이미 써 두었다. 너는 그중 무엇을 어떤 순서로 보여 줄지 고르고, 제안 한 문장만 직접 쓴다.

규칙:
- headline에는 이번 ${unit(kind)}에 가장 눈에 띄는 사실의 문장 id를 하나 쓴다. "headline 후보"에서 고른다.
- insights에는 headline과 다른 묶음의 문장 id를 2~4개, 중요한 것부터 쓴다. 묶음([ ] 안)마다 하나만 고른다.
- suggestion은 고른 사실에 근거해 다음 ${unit(kind)}에 할 수 있는 일 하나를 권하는 한 문장이다. 해요체로 쓰고, 훈계하거나 과장하지 않는다.
- suggestion에는 숫자를 쓸 수 없다. 카테고리·태그 이름과 메모는 "이름 키"의 {키}로 쓰고, {키} 바로 뒤에 조사를 쓸 때는 {이/가}, {을/를}, {은/는}, {와/과}, {으로/로} 중 하나를 쓴다.
- JSON만 출력한다.

출력 예(다른 facts로 쓴 예라 id는 그대로 쓰지 않는다):
{"headline": "category.9.change", "insights": ["category.9.amount_share", "tag.8.amount_share", "budget.usage_balance"], "suggestion": "다음 ${unit(kind)}에는 {category.9.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;
}

function frameUser(keyed: KeyedFacts, frames: Frame[], names: string[]) {
  const values = factValues(keyed);
  const filled = (text: string) => render(text, values);
  const groups = keyed.groups
    .map(g => {
      const mine = frames.filter(f => f.group === g.id);
      if (!mine.length) return '';
      return [`[${g.id}] ${g.title}`, ...mine.map(f => `${f.id}: ${filled(f.text)}`)].join('\n');
    })
    .filter(Boolean);
  const headlines = headlineFrames(frames, filled).map(f => f.id);
  const nameLine = names.map(key => `{${key}} = ${values[key]}`).join(', ');
  const period = keyed.kind === 'weekly' ? '이번 주' : '이번 달';
  return `문장(id: 문장)\n\n${groups.join('\n\n')}\n\nheadline 후보: ${headlines.join(', ')}\n\n이름 키: ${nameLine}\n\n${period} 회고를 JSON으로 써 줘.`;
}

export function buildMessages(
  keyed: KeyedFacts,
  version: PromptVersion = PROMPT_VERSION,
  frames: Frame[] = [],
  names: string[] = [],
): Message[] {
  if (version === 'v3') {
    return [
      { role: 'system', content: frameSystem(keyed.kind) },
      { role: 'user', content: frameUser(keyed, frames, names) },
    ];
  }
  return [
    { role: 'system', content: system(keyed.kind, version) },
    { role: 'user', content: user(keyed, version, frames) },
  ];
}
