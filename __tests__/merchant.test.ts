import {
  isPaymentGateway,
  knownMerchants,
  nameGrams,
  normalizeMerchant,
} from '../src/cards/merchant';

describe('normalizeMerchant', () => {
  test('앞뒤 공백을 지우고 사이 공백을 하나로 줄인다', () => {
    expect(normalizeMerchant('  스타벅스   역삼점 ')).toBe('스타벅스 역삼점');
  });

  test('영문은 대문자로 쓴다', () => {
    expect(normalizeMerchant('bbq치킨')).toBe('BBQ치킨');
  });

  test('전각 영문·숫자는 보통 글자로 바꾼다', () => {
    expect(normalizeMerchant('ＧＳ２５ 역삼점')).toBe('GS25 역삼점');
  });

  test('법인 표기를 지운다', () => {
    expect(normalizeMerchant('(주)우아한형제들')).toBe('우아한형제들');
    expect(normalizeMerchant('㈜비지에프리테일')).toBe('비지에프리테일');
    expect(normalizeMerchant('주식회사 컬리')).toBe('컬리');
    expect(normalizeMerchant('쿠팡 ( 주 )')).toBe('쿠팡');
  });

  test('지점명은 남긴다', () => {
    expect(normalizeMerchant('교촌치킨 역삼점')).toBe('교촌치킨 역삼점');
  });
});

describe('nameGrams', () => {
  test('글자 두 개씩 자르고 띄어쓰기를 넘지 않는다', () => {
    expect(nameGrams('교촌치킨 역삼점')).toEqual(['교촌', '촌치', '치킨', '역삼', '삼점']);
  });

  test('한 글자 낱말은 그 글자 하나다', () => {
    expect(nameGrams('GS 마트 C')).toEqual(['GS', '마트', 'C']);
  });

  test('한 이름 안에서 같은 조각은 한 번만 센다', () => {
    expect(nameGrams('하하하')).toEqual(['하하']);
  });

  test('정규화한 이름으로 자른다', () => {
    expect(nameGrams('(주)bbq치킨')).toEqual(['BB', 'BQ', 'Q치', '치킨']);
  });
});

describe('knownMerchants', () => {
  test('정규화한 이름마다 하나로 묶고, 카테고리는 가장 최근 거래의 것이다', () => {
    const known = knownMerchants([
      { merchant: '스타벅스 역삼점', categoryId: 2 },
      { merchant: 'GS25 역삼점', categoryId: 2 },
      { merchant: '스타벅스  역삼점', categoryId: 1 },
    ]);
    expect(known).toEqual([
      { name: '스타벅스 역삼점', categoryId: 2, count: 2 },
      { name: 'GS25 역삼점', categoryId: 2, count: 1 },
    ]);
  });

  test('빈 이름은 뺀다', () => {
    expect(knownMerchants([{ merchant: ' (주) ', categoryId: 1 }])).toEqual([]);
  });
});

describe('isPaymentGateway', () => {
  test('결제대행사 이름이면 참이다. 법인 표기·띄어쓰기·대소문자는 보지 않는다', () => {
    for (const name of [
      '비바리퍼블리카',
      '(주)비바리퍼블리카',
      '네이버파이낸셜',
      '카카오페이',
      'KG이니시스',
      'nhn kcp',
      // 법인 등기명 한글 표기와 옛 이름. 신한은 토스를 법인명으로 보냈다
      '엔에이치엔케이씨피 주식회사',
      '(주)케이지이니시스',
      '케이지모빌리언스',
      'NHN한국사이버결제',
      '엔에이치엔페이코',
      '토스페이먼츠',
    ]) {
      expect(isPaymentGateway(name)).toBe(true);
    }
  });

  test('가게 이름이면 거짓이다', () => {
    for (const name of ['스타벅스 역삼점', '교촌치킨', '쿠팡'])
      expect(isPaymentGateway(name)).toBe(false);
  });
});

describe('knownMerchants와 결제대행사', () => {
  test('가맹점이 결제대행사면 사용자가 고친 메모를 가게 이름으로 쓰고, 고치지 않았으면 뺀다', () => {
    const known = knownMerchants([
      { merchant: '비바리퍼블리카', memo: '교보문고', categoryId: 8 },
      { merchant: '비바리퍼블리카', memo: '비바리퍼블리카', categoryId: 1 },
      { merchant: '카카오페이', memo: null, categoryId: 2 },
      { merchant: '스타벅스 역삼점', memo: '커피', categoryId: 2 },
    ]);
    expect(known).toEqual([
      { name: '교보문고', categoryId: 8, count: 1 },
      { name: '스타벅스 역삼점', categoryId: 2, count: 1 },
    ]);
  });
});
