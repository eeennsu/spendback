import type { Frame } from './frames';
import { type KeyedFacts, factValues } from './keys';
import { render } from './render';

/**
 * 회고 스냅샷에 함께 저장한다(PRD 6장). 프롬프트나 문법을 바꾸면 올린다.
 * v3는 문장 틀, v4는 v3에 사실 순서·headline 후보·제안 모양을 더한 것이다(PRD 11장). v5는 v4에서 총지출 묶음을
 * insight에서 빼고(headline 후보로만 쓴다) 총예산 틀을 "전체 예산"으로 바꾼 것이다(PRD 4.6). v1(LLM이 플레이스홀더로
 * 문장을 씀)·v2(묶음별 예시)·v3·v4 코드는 걷어 냈다. 결과는 scripts/eval/README.md에 있다. v6는 v5에서 headline
 * 전용 묶음 안내를 user 메시지로 옮겨 지시문을 늘 같게 한 것이다. 지시문 처리 결과를 세션 파일로 다시 쓴다(PRD 6장).
 * 하네스로 프롬프트를 비교할 때는 버전을 더하고 --prompt로 고른다(narrate.ts FORMATS)
 */
export const PROMPT_VERSIONS = ['v5', 'v6'] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
export const PROMPT_VERSION: PromptVersion = 'v6';

export type Message = { role: 'system' | 'user'; content: string };

const unit = (_kind: KeyedFacts['kind']) => '달';
/** 제안의 첫머리. 문법이 강제한다(grammar.ts) */
const next = (kind: KeyedFacts['kind']) => `다음 ${unit(kind)}에는`;

/** headline으로만 쓰는 묶음(총지출, frames.ts insightFrames)의 안내. 없으면 빈 글이다 */
const headlineOnlyRule = (headlineOnly: string[]) =>
  headlineOnly.length
    ? `${headlineOnly.map(g => `[${g}]`).join(', ')} 묶음은 앱 화면이 따로 보여 줘서 headline으로만 쓴다. insights에는 쓰지 않는다.`
    : '';

/**
 * 문장은 코드가 이미 썼다. LLM은 어떤 문장을 어떤 순서로 보일지 고르고 제안 한 문장만 쓴다.
 * only는 지시문에 넣는 headline 전용 묶음 안내다(v5). v6는 비워 지시문을 늘 같게 둔다
 */
function system(kind: KeyedFacts['kind'], only: string) {
  return `너는 가계부 앱에서 한 ${unit(kind)}의 소비 회고를 엮는 담백한 분석가다. 회고에 쓸 문장은 앱이 이미 써 두었다. 너는 그중 무엇을 어떤 순서로 보여 줄지 고르고, 제안 한 문장만 직접 쓴다.

규칙:
- 문장은 묶음([ ] 안)별로 적었고, 묶음은 눈에 띄는 것부터 적었다.
- headline에는 이번 ${unit(kind)}에 가장 눈에 띄는 사실의 문장 id를 하나 쓴다. "headline 후보"에서 고른다.
- insights에는 headline과 다른 묶음의 문장 id를 2~4개, 중요한 것부터 쓴다. 묶음마다 하나만 고른다.${only && `\n- ${only}`}
- suggestion은 headline이나 insights에서 고른 사실 하나에 맞춰 다음 ${unit(kind)}에 할 수 있는 일 하나를 권하는 한 문장이다. "${next(kind)}"으로 시작해 "해 보세요.", "확인하세요."처럼 "세요."로 끝낸다. 훈계하거나 과장하지 않고, 낱말은 띄어 쓴다.
- 제안 예: "${next(kind)} {category.9.name} 예산을 주 단위로 나눠 보세요.", "${next(kind)} 지출이 없는 날을 하루 더 만들어 보세요.", "${next(kind)} {memo.2.text}{을/를} 집에서 준비해 보세요." 예를 그대로 옮기지 말고 이번 사실에 맞게 쓴다.
- suggestion에는 숫자를 쓸 수 없다. 카테고리·태그 이름과 메모는 "이름 키"의 {키}로 쓰고, {키} 바로 뒤에 조사를 쓸 때는 {이/가}, {을/를}, {은/는}, {와/과}, {으로/로} 중 하나를 쓴다.
- JSON만 출력한다.

출력 예(다른 facts로 쓴 예라 id는 그대로 쓰지 않는다):
{"headline": "category.9.change", "insights": ["budget.usage_balance", "tag.8.amount_share", "regret.amount_share"], "suggestion": "${next(kind)} {category.9.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;
}

/**
 * 묶음마다 채운 문장을 id와 함께 쓴다. headline 후보와 제안에 쓸 이름 키를 따로 적는다. headline으로도 insight로도
 * 고를 수 없는 문장(headline 후보가 아닌 총지출 틀)은 쓰지 않는다
 */
function user(
  keyed: KeyedFacts,
  frames: Frame[],
  headlines: Frame[],
  names: string[],
  insights: Frame[],
  only: string,
) {
  const values = factValues(keyed);
  const filled = (text: string) => render(text, values);
  const usable = new Set([...headlines, ...insights].map(f => f.id));
  const groups = keyed.groups
    .map(g => {
      const mine = frames.filter(f => f.group === g.id && usable.has(f.id));
      if (!mine.length) return '';
      return [`[${g.id}] ${g.title}`, ...mine.map(f => `${f.id}: ${filled(f.text)}`)].join('\n');
    })
    .filter(Boolean);
  const nameLine = names.map(key => `{${key}} = ${values[key]}`).join(', ');
  const period = '이번 달';
  const candidates = `headline 후보: ${headlines.map(f => f.id).join(', ')}${only && `\n${only}`}`;
  return `문장(id: 문장)\n\n${groups.join('\n\n')}\n\n${candidates}\n\n이름 키: ${nameLine}\n\n${period} 회고를 JSON으로 써 줘.`;
}

/** insights는 insight로 고를 수 있는 틀이다(frames.ts insightFrames). 주지 않으면 모든 틀이다 */
export function buildMessages(
  keyed: KeyedFacts,
  frames: Frame[],
  headlines: Frame[],
  names: string[],
  insights: Frame[] = frames,
  version: PromptVersion = PROMPT_VERSION,
): Message[] {
  const insightGroups = new Set(insights.map(f => f.group));
  const only = headlineOnlyRule(
    [...new Set(headlines.map(f => f.group))].filter(g => !insightGroups.has(g)),
  );
  // v6는 묶음마다 달라지는 안내를 user 메시지에 써서 지시문을 늘 같게 둔다
  const inSystem = version === 'v5';
  return [
    { role: 'system', content: system(keyed.kind, inSystem ? only : '') },
    {
      role: 'user',
      content: user(keyed, frames, headlines, names, insights, inSystem ? '' : only),
    },
  ];
}
