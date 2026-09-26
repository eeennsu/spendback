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

describe('buildGrammar', () => {
  test('insight는 about에 쓴 묶음의 키만 쓸 수 있다', () => {
    expect(rule('ins-1')).toContain('"\\"category.3\\""');
    expect(keysIn(rule('ph-1'))).toEqual(['category.3.name', 'category.3.share']);
    expect(keysIn(rule('ph-0'))).toEqual(['total.variable', 'total.change_phrase']);
  });

  test('headline은 모든 키 중 하나 이상을 쓴다', () => {
    expect(rule('headline')).toContain('ph-all');
    expect(keysIn(rule('ph-all'))).toHaveLength(4);
  });

  test('서술어 뒤에는 조사를 붙일 수 없다', () => {
    const [noun, predicate] = rule('ph-0').split(' | "{"');
    expect(noun).toContain('(josa | particle)?');
    expect(predicate).not.toContain('josa');
  });

  test('플레이스홀더 바로 뒤에는 한글이 올 수 없다(경계 문자가 먼저 온다)', () => {
    expect(rule('tail-0')).toBe('(b c{0,40} (ph-0 tail-0)?)?');
    expect(rule('b')).not.toMatch(/uAC00/);
  });

  test('문장 문자는 한글 음절과 일부 문장부호뿐이다', () => {
    expect(rule('c')).toBe('[\\uAC00-\\uD7A3 .,!?·~()-]');
  });

  test('insights는 2~4개다', () => {
    expect(rule('root')).toContain('ins (ws "," ws ins){1,3}');
  });

  test('조사 쌍은 렌더러가 아는 것만 쓴다', () => {
    expect(rule('josa')).toBe(
      '"{이/가}" | "{을/를}" | "{은/는}" | "{와/과}" | "{으로/로}" | "{이에요/예요}" | "{이었어요/였어요}"',
    );
  });
});

describe('buildMessages', () => {
  test('facts를 묶음 id와 함께 쓰고 서술어를 표시한다', () => {
    const [, user] = buildMessages(keyed);
    expect(user.content).toContain('[category.3] 카테고리\n{category.3.name} = 배달 (이름)');
    expect(user.content).toContain(
      '{total.change_phrase} = 32,400원 늘었어요 (서술어, 지난주보다)',
    );
    expect(user.content).toContain('기간: 9월 21일~27일');
  });

  test('월간은 한 달을 말한다', () => {
    const [system] = buildMessages({ ...keyed, kind: 'monthly', period: '9월' });
    expect(system.content).toContain('한 달의 소비 회고');
    expect(system.content).toContain('다음 달');
  });
});
