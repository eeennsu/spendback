import { render, renderParts } from '../src/retro/render';

describe('render: 플레이스홀더를 값으로 채운다', () => {
  test('키를 값으로 바꾼다', () => {
    const values = { 'category.3.name': '배달', 'category.3.share': '18%' };
    expect(render('{category.3.name} 지출이 {category.3.share}를 차지했어요.', values)).toBe(
      '배달 지출이 18%를 차지했어요.',
    );
  });
});

describe('조사는 채운 값의 마지막 글자 받침으로 고른다', () => {
  const fill = (value: string, pair: string) => render(`{v}{${pair}}`, { v: value });

  test.each([
    ['배달', '이/가', '배달이'],
    ['카페·간식', '이/가', '카페·간식이'],
    ['식비', '을/를', '식비를'],
    ['교통', '은/는', '교통은'],
    ['쇼핑', '와/과', '쇼핑과'],
    ['생활', '와/과', '생활과'],
    ['기타', '와/과', '기타와'],
    ['교통', '으로/로', '교통으로'],
    ['생활', '으로/로', '생활로'], // ㄹ 받침은 로
    ['배달', '으로/로', '배달로'],
    ['기타', '으로/로', '기타로'],
    ['54,000원', '이었어요/였어요', '54,000원이었어요'],
    ['토요일', '이에요/예요', '토요일이에요'],
    ['5번', '이에요/예요', '5번이에요'],
  ])('%s + {%s} → %s', (value, pair, text) => {
    expect(fill(value, pair)).toBe(text);
  });

  test.each([
    ['18%', '이에요/예요', '18%예요'], // 퍼센트
    ['GS25', '이/가', 'GS25가'], // 오
    ['2010', '은/는', '2010은'], // 십
    ['1,000', '이/가', '1,000이'], // 천
    ['300', '을/를', '300을'], // 백
    ['20000', '이/가', '20000이'], // 만
    ['7', '으로/로', '7로'], // 칠(ㄹ)
    ['3', '와/과', '3과'], // 삼
    ['0', '이/가', '0이'], // 영
  ])('숫자는 읽는 소리로 판단한다: %s + {%s} → %s', (value, pair, text) => {
    expect(fill(value, pair)).toBe(text);
  });

  test.each([
    ['Netflix', '을/를', 'Netflix를'],
    ['Google', '으로/로', 'Google로'],
    ['Steam', '이/가', 'Steam이'],
    ['카페(스타벅스)', '은/는', '카페(스타벅스)는'], // 괄호는 건너뛴다
  ])('영문과 기호: %s + {%s} → %s', (value, pair, text) => {
    expect(fill(value, pair)).toBe(text);
  });
});

test('채운 값과 나머지를 조각으로 나눈다', () => {
  expect(
    renderParts('{category.3.name} 지출이 {category.3.change_phrase}.', {
      'category.3.name': '배달',
      'category.3.change_phrase': '29,000원 늘었어요',
    }),
  ).toEqual([
    { text: '배달', value: true },
    { text: ' 지출이 ', value: false },
    { text: '29,000원 늘었어요', value: true },
    { text: '.', value: false },
  ]);
});

test('서술어 값은 앞 숫자만 값 조각이다', () => {
  const values = {
    'category.3.name': '배달',
    'category.3.change_phrase': '29,000원 늘었어요',
    'total.change_phrase': '같았어요',
  };
  const predicates = new Set(['category.3.change_phrase', 'total.change_phrase']);
  expect(
    renderParts('{category.3.name} 지출이 {category.3.change_phrase}.', values, predicates),
  ).toEqual([
    { text: '배달', value: true },
    { text: ' 지출이 ', value: false },
    { text: '29,000원', value: true },
    { text: ' 늘었어요.', value: false },
  ]);
  // 숫자가 없는 서술어는 강조하지 않는다
  expect(renderParts('변동비가 지난주와 {total.change_phrase}.', values, predicates)).toEqual([
    { text: '변동비가 지난주와 같았어요.', value: false },
  ]);
});
