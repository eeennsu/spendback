import { sampleFacts, sampleNames } from '../jest/facts';
import { buildFrames, headlineFrames, nameKeys } from '../src/retro/frames';
import { buildGrammar } from '../src/retro/grammar';
import { factValues, keyFacts } from '../src/retro/keys';
import { buildMessages } from '../src/retro/prompt';
import { render } from '../src/retro/render';

const choice = (id: string) => ({ id, group: id.split('.').slice(0, -1).join('.') });
const FRAMES = ['total.change', 'total.rate', 'category.3.change_share', 'tag.2.amount_share'].map(
  choice,
);
const grammar = buildGrammar(
  [choice('total.change'), choice('category.3.change')],
  FRAMES,
  ['category.3.name', 'tag.2.name'],
  'weekly',
);
const rule = (name: string, text = grammar) =>
  text
    .split('\n')
    .find(line => line.startsWith(`${name} ::=`))
    ?.slice(name.length + 5) ?? '';
/** 문자 집합 규칙이 그 글자를 받는가 */
const accepts = (charClass: string, ch: string) => {
  const code = ch.charCodeAt(0);
  return [...charClass.matchAll(/\\u([0-9A-F]{4})-\\u([0-9A-F]{4})/g)].some(
    ([, lo, hi]) => code >= parseInt(lo, 16) && code <= parseInt(hi, 16),
  );
};

describe('buildGrammar', () => {
  test('headline은 후보에서 고르고, insight는 headline과 다른 묶음의 틀에서 고른다', () => {
    expect(rule('root')).toContain('(head-0 | head-1)');
    expect(rule('head-0')).toMatch(/^\("\\"total\.change\\""\) ws/);
    expect(rule('ins-0')).toBe('"\\"category.3.change_share\\"" | "\\"tag.2.amount_share\\""');
    expect(rule('head-1')).toMatch(/^\("\\"category\.3\.change\\""\) ws/);
    expect(rule('ins-1')).toBe(
      '"\\"total.change\\"" | "\\"total.rate\\"" | "\\"tag.2.amount_share\\""',
    );
  });

  test('insights는 2~4개다', () => {
    expect(rule('head-0')).toContain('ins-0 (ws "," ws ins-0){1,3}');
  });

  test('다른 묶음이 없으면 insight는 모든 틀에서 고른다', () => {
    const one = buildGrammar([choice('total.change')], [choice('total.change')], [], 'weekly');
    expect(rule('ins-0', one)).toBe('"\\"total.change\\""');
  });

  test('제안은 "다음 주에는"으로 시작해 "세요."로 끝나고 이름 키만 2개까지 쓴다', () => {
    expect(rule('suggestion')).toBe('"다음 주에는 " sbody "세요."');
    expect(rule('sbody').split(' | ')).toHaveLength(3);
    expect(rule('sbody')).toContain('nph gap (wa gap');
    expect((rule('sbody').match(/nph/g) ?? []).length).toBe(3);
    expect(rule('nph')).toBe('"{" ("category.3.name" | "tag.2.name") "}" (josa | particle)?');
    const monthly = buildGrammar([choice('total.change')], FRAMES, [], 'monthly');
    expect(rule('suggestion', monthly)).toBe('"다음 달에는 " sbody "세요."');
  });

  test('이름 키가 없으면 제안은 낱말로만 쓴다', () => {
    const plain = buildGrammar([choice('total.change')], FRAMES, [], 'weekly');
    expect(rule('sbody', plain)).toBe('(w gap){0,11} stem');
    expect(plain).not.toContain('nph');
  });

  test('낱말은 공백·쉼표로 잇고 여섯 글자까지다', () => {
    expect(rule('gap')).toBe('" " | ", "');
    expect(rule('rest')).toBe('[\\uAC00-\\uD7A3]{0,5}');
  });

  test('플레이스홀더 다음 낱말은 단위 글자로 시작할 수 없다', () => {
    const first = rule('wa').split(' ')[0];
    for (const unit of ['원', '번', '일', '개']) expect(accepts(first, unit)).toBe(false);
    expect(accepts(first, '가')).toBe(true);
  });

  test('낱말은 증감을 직접 쓰는 말로 시작할 수 없다', () => {
    const w = rule('w');
    for (const head of ['늘', '줄', '증', '감']) expect(accepts(w.split(' ')[0], head)).toBe(false);
    // 늘·줄 뒤에는 제안에 쓰는 늘려·줄여·줄이만
    expect(w).toContain('"늘" ([려] rest)?');
    expect(w).toContain('"줄" ([여이] rest)?');
    // 증·감 뒤에는 가·소만 뺀다
    const afterGam = w.split('"감" (')[1].split(' rest')[0];
    expect(accepts(afterGam, '소')).toBe(false);
    expect(accepts(afterGam, '사')).toBe(true);
  });

  test('조사 쌍은 렌더러가 아는 것만 쓴다', () => {
    expect(rule('josa')).toBe(
      '"{이/가}" | "{을/를}" | "{은/는}" | "{와/과}" | "{으로/로}" | "{이에요/예요}" | "{이었어요/였어요}"',
    );
  });
});

describe('buildMessages', () => {
  const keyed = keyFacts(sampleFacts, sampleNames);
  const frames = buildFrames(keyed);
  const values = factValues(keyed);
  const headlines = headlineFrames(keyed, frames, t => render(t, values));

  test('채운 문장을 묶음별로 id와 함께 쓰고, headline 후보와 이름 키를 적는다', () => {
    const [, user] = buildMessages(keyed, frames, headlines, nameKeys(keyed));
    expect(user.content).toContain('category.3.change: 배달 지출이 지난주보다 29,000원 늘었어요.');
    expect(user.content).toMatch(/headline 후보: [^\n]*total\.change/);
    expect(user.content).toContain('{category.3.name} = 배달');
    // 문장은 값을 채워 보여 준다. 플레이스홀더는 이름 키 줄에만 있다
    const sentences = user.content
      .split('\n')
      .filter(line => /^[a-z_]+(?:\.\d+)?\.[a-z_]+: /.test(line));
    expect(sentences).toHaveLength(frames.length);
    for (const line of sentences) expect(line).not.toContain('{');
  });

  test('묶음은 눈에 띄는 순서로 쓴다', () => {
    const [, user] = buildMessages(keyed, frames, headlines, []);
    const order = [...user.content.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1]);
    expect(order.slice(0, 3)).toEqual(['category.3', 'category.7', 'total']);
  });

  test('월간은 한 달을 말하고 제안은 "다음 달에는"으로 시작한다', () => {
    const [system] = buildMessages({ ...keyed, kind: 'monthly' }, frames, headlines, []);
    expect(system.content).toContain('한 달의 소비 회고');
    expect(system.content).toContain('"다음 달에는"으로 시작해');
  });
});

describe('제안의 끝', () => {
  test('마지막 낱말은 "세요"로 끝나고 그 앞은 네 글자까지다(보세요, 확인하세요)', () => {
    expect(rule('sbody')).toMatch(/stem$/);
    expect(rule('stem').endsWith('{1,4}')).toBe(true);
  });
});
