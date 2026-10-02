import { sampleFacts, sampleNames } from '../jest/facts';
import { buildFrames, nameKeys } from '../src/retro/frames';
import { buildGrammar } from '../src/retro/grammar';
import { keyFacts } from '../src/retro/keys';
import { buildMessages } from '../src/retro/prompt';

const grammar = buildGrammar(
  ['total.change'],
  ['total.change', 'category.3.change_share', 'tag.2.amount_share'],
  ['category.3.name', 'tag.2.name'],
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
  test('headline은 headline 후보에서, insight는 모든 틀에서 id만 고른다', () => {
    expect(rule('headline')).toBe('"\\"total.change\\""');
    expect(rule('frame')).toBe(
      '"\\"total.change\\"" | "\\"category.3.change_share\\"" | "\\"tag.2.amount_share\\""',
    );
  });

  test('insights는 2~4개다', () => {
    expect(rule('root')).toContain('frame (ws "," ws frame){1,3}');
  });

  test('제안은 이름 키만 2개까지 쓸 수 있다', () => {
    expect(rule('suggestion')).toBe(
      'seg end | (seg " ")? nph (gap after " " nph)? (gap after end)?',
    );
    expect(rule('nph')).toBe('"{" ("category.3.name" | "tag.2.name") "}" (josa | particle)? end?');
  });

  test('이름 키가 없으면 제안은 낱말로만 쓴다', () => {
    const plain = buildGrammar(['total.change'], ['total.change'], []);
    expect(rule('suggestion', plain)).toBe('seg end');
    expect(plain).not.toContain('nph');
  });

  test('낱말은 공백·쉼표로 잇고 마침표·물음표로 끝낸다', () => {
    expect(rule('gap')).toBe('" " | ", "');
    expect(rule('end')).toBe('[.?]');
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

  test('채운 문장을 묶음별로 id와 함께 쓰고, headline 후보와 이름 키를 적는다', () => {
    const [, user] = buildMessages(keyed, frames, nameKeys(keyed));
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

  test('월간은 한 달을 말한다', () => {
    const [system] = buildMessages({ ...keyed, kind: 'monthly' }, frames, []);
    expect(system.content).toContain('한 달의 소비 회고');
    expect(system.content).toContain('다음 달');
  });
});
