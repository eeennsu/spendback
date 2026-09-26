import { buildGrammar } from '../src/retro/grammar';
import type { KeyedFacts } from '../src/retro/keys';
import { buildMessages } from '../src/retro/prompt';

const keyed: KeyedFacts = {
  kind: 'weekly',
  period: '9월 21일~27일',
  groups: [
    {
      id: 'total',
      title: '총지출',
      facts: [
        { key: 'total.variable', value: '187,300원', kind: 'noun', note: '변동비' },
        {
          key: 'total.change_phrase',
          value: '32,400원 늘었어요',
          kind: 'predicate',
          note: '지난주보다',
        },
      ],
    },
    {
      id: 'category.3',
      title: '카테고리',
      facts: [
        { key: 'category.3.name', value: '배달', kind: 'noun', note: '이름' },
        { key: 'category.3.share', value: '36%', kind: 'noun', note: '비중' },
      ],
    },
  ],
};

const grammar = buildGrammar(keyed);
const rule = (name: string) =>
  grammar
    .split('\n')
    .find(line => line.startsWith(`${name} ::=`))
    ?.slice(name.length + 5) ?? '';
const keysIn = (text: string) => [...text.matchAll(/"([a-z_]+(?:\.[a-z0-9_]+)+)"/g)].map(m => m[1]);
/** 문자 집합 규칙이 그 글자를 받는가 */
const accepts = (charClass: string, ch: string) => {
  const code = ch.charCodeAt(0);
  return [...charClass.matchAll(/\\u([0-9A-F]{4})-\\u([0-9A-F]{4})/g)].some(
    ([, lo, hi]) => code >= parseInt(lo, 16) && code <= parseInt(hi, 16),
  );
};

describe('buildGrammar', () => {
  test('insight는 about에 쓴 묶음의 키만 쓸 수 있다', () => {
    expect(rule('ins-1')).toContain('"\\"category.3\\""');
    expect(rule('ins-1')).toContain('s-1');
    expect(keysIn(rule('ph-1'))).toEqual(['category.3.name', 'category.3.share']);
    expect(keysIn(rule('ph-0'))).toEqual(['total.variable', 'total.change_phrase']);
  });

  test('headline과 suggestion도 묶음 하나의 문장이다', () => {
    expect(rule('headline')).toBe('s-0 | s-1');
    expect(rule('suggestion')).toBe('seg end | s-0 | s-1');
  });

  test('플레이스홀더는 1~3개이고 앞뒤에 공백·쉼표가 온다', () => {
    expect(rule('s-0')).toBe('(seg " ")? ph-0 (gap after " " ph-0){0,2} (gap after end)?');
    expect(rule('gap')).toBe('" " | ", "');
    expect(rule('end')).toBe('[.?]');
  });

  test('서술어 뒤에는 조사를 붙일 수 없고 마침표가 온다', () => {
    const [noun, predicate] = rule('ph-0').split(' | "{"');
    expect(noun).toContain('(josa | particle)?');
    expect(predicate).not.toContain('josa');
    expect(predicate.endsWith('"}" "."')).toBe(true);
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

  test('insights는 2~4개다', () => {
    expect(rule('root')).toContain('ins (ws "," ws ins){1,3}');
  });
});

describe('buildMessages', () => {
  test('facts를 묶음 id와 함께 쓰고 서술어를 표시한다', () => {
    const [, user] = buildMessages(keyed);
    expect(user.content).toContain('[category.3] 카테고리\n{category.3.name} = 배달 // 이름');
    expect(user.content).toContain(
      '{total.change_phrase} = 32,400원 늘었어요 // 서술어. 지난주보다',
    );
    expect(user.content).toContain('기간: 9월 21일~27일');
  });

  test('월간은 한 달을 말한다', () => {
    const [system] = buildMessages({ ...keyed, kind: 'monthly', period: '9월' });
    expect(system.content).toContain('한 달의 소비 회고');
    expect(system.content).toContain('다음 달');
  });
});
