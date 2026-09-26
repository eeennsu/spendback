import { checkField, checkSentence, parseOutput } from '../src/retro/check';
import type { KeyedFacts } from '../src/retro/keys';

const keys = new Set(['category.3.name', 'category.3.amount']);
const problems = (text: string, require = true) => checkSentence(text, keys, require);

describe('checkSentence', () => {
  test('통과하는 문장', () => {
    expect(problems('{category.3.name}{이/가} {category.3.amount}{이었어요/였어요}.')).toEqual([]);
  });

  test('플레이스홀더가 없으면 걸린다. 조사 쌍은 플레이스홀더로 치지 않는다', () => {
    expect(problems('지출이 많았어요.')).toEqual(['no-placeholder']);
    expect(problems('지출{이/가} 많았어요.')).toEqual(['no-placeholder']);
    expect(problems('지출이 많았어요.', false)).toEqual([]);
  });

  test('facts에 없는 키는 걸린다', () => {
    expect(problems('{category.4.name} 지출')).toEqual(['unknown-key']);
  });

  test.each(['3만 원', '۱۱۲원', '⅔', 'ㄴ만 원', 'coffee', '"따옴표"', ')),', '(서술어)'])(
    '화이트리스트 밖의 문자는 걸린다: %s',
    text => {
      expect(problems(`{category.3.name} ${text}`)).toContain('invalid-char');
    },
  );

  test.each(['삼만 원', '만 원을 넘었어요', '두 배', '세 번', '다섯 잔', '이십 퍼센트', '열 번'])(
    '한글 수사와 단위는 걸린다: %s',
    text => {
      expect(problems(`{category.3.name} 지출이 ${text}`)).toContain('numeral');
    },
  );

  test.each([
    '이번 주에는',
    '이건 필요했어요',
    '열심히 아꼈어요',
    '세금',
    '한 번 더 생각해 보세요',
    '한번 줄여 보세요',
  ])('수사가 아닌 말은 통과한다: %s', text => {
    expect(problems(`{category.3.name} ${text}`)).toEqual([]);
  });

  test.each(['지출이  원 늘었어요', '{category.3.amount} 번 샀어요', '{category.3.share} 퍼센트'])(
    '숫자 없이 남은 단위는 걸린다: %s',
    text => {
      expect(problems(`{category.3.name} ${text}`)).toContain('dangling-unit');
    },
  );

  test.each([
    '{category.3.amount} 원의 지출',
    '{category.3.amount} 원이에요',
    '{category.3.amount} 일 동안',
  ])('플레이스홀더 뒤에 단위를 또 쓰면 걸린다: %s', text => {
    expect(problems(text)).toContain('dangling-unit');
  });

  test.each(['{category.3.name} 원하는 만큼 썼어요', '{category.3.amount} 일주일 동안'])(
    '단위로 시작하는 낱말은 통과한다: %s',
    text => {
      expect(problems(text)).toEqual([]);
    },
  );

  test.each(['지난주보다 늘었어요', '크게 줄었어요', '지출이 증가했어요'])(
    '방향을 직접 쓰면 걸린다: %s',
    text => {
      expect(problems(`{category.3.name} ${text}`)).toEqual(['direction']);
    },
  );

  test('같은 글자를 세 번 넘게 이으면 걸린다', () => {
    expect(problems('{category.3.name} 지출이 많았어요요요요.')).toEqual(['repetition']);
    expect(problems('{category.3.name} 하하 웃었어요.')).toEqual([]);
  });

  test('알려진 오탐: 사원(社員)은 수사+원으로 걸린다. 회고에 드문 말이라 재생성으로 받아들인다', () => {
    expect(problems('{category.3.name} 사원 식당')).toContain('numeral');
  });
});

const keyed: KeyedFacts = {
  kind: 'weekly',
  period: '9월 21일~27일',
  groups: [
    {
      id: 'total',
      title: '총지출',
      facts: [{ key: 'total.variable', value: '187,300원', kind: 'noun', note: '' }],
    },
    {
      id: 'category.3',
      title: '카테고리',
      facts: [{ key: 'category.3.name', value: '배달', kind: 'noun', note: '' }],
    },
  ],
};

describe('checkField', () => {
  test('insight는 about에 쓴 묶음의 키만 쓸 수 있다', () => {
    const insight = (about: string, text: string) =>
      checkField(keyed, { field: 'insight', index: 0, about, text });
    expect(insight('category.3', '{category.3.name} 지출')).toEqual([]);
    expect(insight('category.3', '{total.variable} 지출')).toEqual(['unknown-key']);
    expect(insight('category.9', '{category.3.name} 지출')).toEqual(['unknown-group']);
  });

  test('headline은 어느 묶음이든 한 묶음의 키만 쓰고, suggestion은 플레이스홀더가 없어도 된다', () => {
    expect(checkField(keyed, { field: 'headline', text: '{total.variable} 썼어요.' })).toEqual([]);
    expect(
      checkField(keyed, { field: 'headline', text: '{category.3.name} 지출이 {total.variable}' }),
    ).toEqual(['unknown-key']);
    expect(checkField(keyed, { field: 'headline', text: '지출이 많았어요.' })).toEqual([
      'no-placeholder',
    ]);
    expect(checkField(keyed, { field: 'suggestion', text: '천천히 써 보세요.' })).toEqual([]);
  });
});

describe('parseOutput', () => {
  const json =
    '{"headline": "h", "insights": [{"about": "a", "text": "t"}, {"about": "b", "text": "u"}], "suggestion": "s"}';

  test('Qwen의 빈 think 블록을 떼고 읽는다', () => {
    expect(parseOutput(`<think>\n\n</think>\n\n${json}`)?.headline).toBe('h');
  });

  test('모양이 틀리거나 끊긴 출력은 읽지 않는다', () => {
    expect(parseOutput(json.slice(0, -5))).toBeUndefined();
    expect(
      parseOutput(
        '{"headline": "h", "insights": [{"about": "a", "text": "t"}], "suggestion": "s"}',
      ),
    ).toBeUndefined();
  });
});
