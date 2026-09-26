import type { KeyedFacts } from './keys';

/** 회고 스냅샷에 함께 저장한다(PRD 6장). 프롬프트나 문법을 바꾸면 올린다 */
export const PROMPT_VERSION = 'v1';

export type Message = { role: 'system' | 'user'; content: string };

const unit = (kind: KeyedFacts['kind']) => (kind === 'weekly' ? '주' : '달');

function system(kind: KeyedFacts['kind']) {
  return `너는 가계부 앱에서 한 ${unit(kind)}의 소비 회고를 쓰는 담백한 분석가다. 주어진 facts만 근거로 쓴다.

규칙:
- 숫자를 쓸 수 없다. 금액, 비율, 횟수, 날짜, 증감, 카테고리와 태그 이름, 메모는 facts의 {키}로 가리킨다. 앱이 {키}를 값으로 바꾼다.
- 값에는 단위가 들어 있다. {키} 뒤에 원, %, 번 같은 단위를 붙이지 않는다.
- "서술어"라고 적힌 키는 "늘었어요", "남았어요"처럼 문장을 끝내는 말이다. 문장 끝에 쓴다.
- {키} 바로 뒤에 조사를 쓸 때는 {이/가}, {을/를}, {은/는}, {와/과}, {으로/로}, {이에요/예요}, {이었어요/였어요} 중 하나를 쓴다. 앱이 알맞은 조사를 고른다.
- insight마다 facts 묶음 하나를 골라 about에 [ ] 안의 묶음 id를 쓰고, text에는 그 묶음의 키만 쓴다.
- headline은 가장 눈에 띄는 사실 한 문장, insights는 서로 다른 사실 2~4개, suggestion은 다음 ${unit(kind)}를 위한 제안 한 문장이다.
- 해요체로 쓰고, 훈계하거나 과장하지 않는다.
- JSON만 출력한다.

출력 예(다른 facts로 쓴 예라 키는 그대로 쓰지 않는다):
{"headline": "{category.9.name} 지출이 {category.9.change_phrase}.", "insights": [{"about": "category.9", "text": "{category.9.name}{이/가} 변동비의 {category.9.share}{을/를} 차지했어요."}, {"about": "tag.8", "text": "{tag.8.name} 태그가 붙은 지출은 {tag.8.amount}{이었어요/였어요}."}], "suggestion": "다음 ${unit(kind)}에는 {category.9.name} 지출 전에 꼭 필요한지 생각해 보세요."}`;
}

/** facts를 묶음별로 쓴다. 묶음 id와 키 설명이 있어야 모델이 키를 엉뚱한 사실에 붙이지 않는다(PRD 10장) */
function user(keyed: KeyedFacts) {
  const groups = keyed.groups.map(g =>
    [
      `[${g.id}] ${g.title}`,
      ...g.facts.map(
        f => `{${f.key}} = ${f.value} (${f.kind === 'predicate' ? '서술어, ' : ''}${f.note})`,
      ),
    ].join('\n'),
  );
  const period = keyed.kind === 'weekly' ? '이번 주' : '이번 달';
  return `기간: ${keyed.period}\n\n${groups.join('\n\n')}\n\n${period} 회고를 JSON으로 써 줘.`;
}

export function buildMessages(keyed: KeyedFacts): Message[] {
  return [
    { role: 'system', content: system(keyed.kind) },
    { role: 'user', content: user(keyed) },
  ];
}
