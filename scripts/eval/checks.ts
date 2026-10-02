import type { Output } from '../../src/retro/check';
import type { KeyedFacts } from '../../src/retro/keys';

/**
 * 하네스 자동 점검(PRD 6장). 앱의 사후 검사(src/retro/check.ts: 스키마, 모르는 키, 숫자·수사, 단위 중복, 방향 직접
 * 쓰기)를 통과한 출력에 더 보는 것들이다.
 * 길이 한도와 금지어는 첫 하네스 결과를 보고 조정한다.
 */

/** 채운 뒤 길이 한도(공백 포함). S24+ 본문 한 줄이 약 22자다 */
export const LIMITS = { headline: 30, insight: 60, suggestion: 45 };
/** 문장 수 한도 */
const SENTENCES = { headline: 1, insight: 2, suggestion: 1 };

export const BANNED = [
  '!',
  '안녕하세요',
  '여러분',
  '고객님',
  '항상',
  '절대',
  '완벽',
  '최고',
  '최악',
  '대박',
  '심각',
  '낭비',
  '과소비',
  '한심',
  '반성',
  // PRD 초안의 '해야 해요'를 넓혔다. '줄여야 해요', '써야 해요'도 같은 훈계다
  '야 해요',
  '것 같아요',
  '나 봐요',
  '듯해요',
];

/**
 * 문장 품질 휴리스틱(PRD 11장 비교). 첫 하네스의 실패 문장에서 뽑은 유형이다. 사람 채점 전에 세어 보는 용도라
 * 넘치거나 모자랄 수 있다. raw는 플레이스홀더를 채우기 전, text는 채운 뒤다
 */
type Line = { raw: string; text: string };
const plainOf = (raw: string) => raw.replace(/\{[^{}]+\}/g, ' ');
const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

export const QUALITY = {
  /** 문법이 막은 증감 낱말을 띄어 쓰거나 깨뜨려 우회했다("늘 었어요", "줄여었어요") */
  brokenDirection: ({ raw }: Line) =>
    /(?:^|[^가-힣])(?:늘|줄) [가-힣]/.test(plainOf(raw)) ||
    /줄여었|줄이에요|줄여어|줄이었/.test(raw),
  /** 사후 검사 밖의 증감 낱말("상승했어요", "급증") */
  directionSynonym: ({ raw }: Line) =>
    /상승|급증|증대|성장세|성장했|변동했|달라졌|불어났|치솟|많아지/.test(plainOf(raw)),
  /** 사후 검사를 통과한 한글 수사("삼분의 일", "석 달", "엿새", "한천원") */
  numeralLeak: ({ raw }: Line) =>
    /분의 [가-힣]|팔할|석 달|엿새|반백|배로|두 배|석삼십|한천원/.test(plainOf(raw)),
  /** 프롬프트를 옮겨 썼다("기간은 …", "서술어") */
  promptLeak: ({ raw }: Line) =>
    /^기간|서술어|나눈 몫|일수로 나눈|날수로|예시|회고 보고서|데이터 클래스/.test(
      plainOf(raw).trim(),
    ),
  /** 해요체가 아닌 문장이 있다(습니다체, 반말, 명사형, 값으로 끝남) */
  notPolite: ({ text }: Line) => sentencesOf(text).some(s => !/요[.?!]?$/.test(s)),
  /** 사용자 대신 다짐하거나 묻는다("줄이겠어요", "~할게요", "~할까요?") */
  vowOrQuestion: ({ text }: Line) => /겠어요|겠습니다|할게요|볼게요|까요|\?/.test(text),
  /** 같은 낱말을 세 번 넘게 잇는다("이다 이다 이다") */
  wordRepeat: ({ raw }: Line) => /(?:^|\s)(\S{1,8}) \1 \1/.test(raw),
  /** 띄어쓰기 없이 뭉친 여덟 글자 넘는 낱말("다시한번생각해보고") */
  glued: ({ raw }: Line) => /[가-힣]{8,}/.test(plainOf(raw)),
};
export type QualityName = keyof typeof QUALITY;

/** 묶음 id → 카테고리·태그 이름. 일반 낱말과 겹치는 이름은 뺀다 */
const COMMON_WORDS = new Set(['필요', '선물', '생활', '기타', '습관']);
export function namesOf(keyed: KeyedFacts) {
  const names = new Map<string, string>();
  for (const g of keyed.groups) {
    const name = g.facts.find(f => f.key === `${g.id}.name`)?.value;
    if (name && /^(?:category|tag)\./.test(g.id) && !COMMON_WORDS.has(name)) names.set(g.id, name);
  }
  return names;
}

/** headline·insight가 다른 묶음의 이름을 글자로 썼다("식비 지출이 {total.change_rate_phrase}") */
function misattributed(raw: string, group: string | undefined, names: Map<string, string>) {
  if (!group) return false;
  const plain = plainOf(raw);
  return [...names].some(([id, name]) => id !== group && plain.includes(name));
}

const groupOf = (raw: string) => /\{((?:category|tag|memo)\.\d+|[a-z_]+)\.[a-z_]+\}/.exec(raw)?.[1];

const sentenceCount = (text: string) => Math.max(1, (text.match(/[.?!](?=\s|$)/g) ?? []).length);

export type Rendered = { headline: string; insights: string[]; suggestion: string };

/**
 * 눈에 띄는 사실을 다뤘는가(PRD 11장 사실 고르기). salient는 그 스냅샷이 꼭 말해야 할 키의 앞부분이다
 * (snapshots.ts). headline·insight가 그 키를 쓰면 다룬 것이다. hit은 첫 사실을 headline으로 골랐는가다
 */
function coverage(output: Output, salient: string[] | undefined) {
  if (!salient?.length) return undefined;
  const mentions = (raw: string, prefix: string) => raw.includes(`{${prefix}`);
  const said = [output.headline, ...output.insights.map(i => i.text)];
  return {
    missed: salient.filter(prefix => !said.some(raw => mentions(raw, prefix))),
    headline: mentions(output.headline, salient[0]),
  };
}

export function autoCheck(
  output: Output,
  rendered: Rendered,
  keyed?: KeyedFacts,
  salient?: string[],
) {
  const lines = [
    { field: 'headline' as const, raw: output.headline, text: rendered.headline },
    ...output.insights.map((insight, i) => ({
      field: 'insight' as const,
      raw: insight.text,
      text: rendered.insights[i],
      about: insight.about,
    })),
    { field: 'suggestion' as const, raw: output.suggestion, text: rendered.suggestion },
  ];
  const abouts = output.insights.map(i => i.about);
  const names = keyed ? namesOf(keyed) : new Map<string, string>();
  const quality = Object.fromEntries(
    (Object.keys(QUALITY) as QualityName[]).map(name => [
      name,
      lines.filter(l => QUALITY[name](l)).map(l => l.text),
    ]),
  ) as Record<QualityName, string[]>;
  return {
    tooLong: lines.filter(l => l.text.length > LIMITS[l.field]).map(l => l.text),
    tooManySentences: lines
      .filter(l => sentenceCount(l.text) > SENTENCES[l.field])
      .map(l => l.text),
    banned: [...new Set(lines.flatMap(l => BANNED.filter(word => l.text.includes(word))))],
    repeatedGroups: abouts.length - new Set(abouts).size,
    misattributed: lines
      .filter(
        l =>
          l.field !== 'suggestion' &&
          misattributed(l.raw, 'about' in l ? l.about : groupOf(l.raw), names),
      )
      .map(l => l.text),
    quality,
    salient: coverage(output, salient),
  };
}

export type AutoCheck = ReturnType<typeof autoCheck>;

/** 자동 점검에 하나도 걸리지 않은 회고 */
export function isClean(auto: AutoCheck) {
  return (
    auto.tooLong.length === 0 &&
    auto.tooManySentences.length === 0 &&
    auto.banned.length === 0 &&
    auto.repeatedGroups === 0 &&
    auto.misattributed.length === 0 &&
    Object.values(auto.quality).every(list => list.length === 0)
  );
}
