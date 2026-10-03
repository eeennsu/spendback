import { knownMerchants } from '../src/cards/merchant';
import { findSimilar } from '../src/cards/similar';

const known = (...rows: Array<[string, number]>) =>
  knownMerchants(rows.map(([merchant, categoryId]) => ({ merchant, categoryId })));

describe('findSimilar', () => {
  test('흔한 조각(지점명)보다 드문 조각이 겹친 가맹점이 가깝다', () => {
    // 겹친 조각을 그냥 세면 "스타벅스 역삼점"(역삼, 삼점)이 "BBQ치킨"(치킨)보다 가깝다
    const corpus = known(
      ['스타벅스 역삼점', 2],
      ['GS25 역삼점', 2],
      ['올리브영 역삼점', 5],
      ['다이소 역삼점', 6],
      ['BBQ치킨', 3],
    );
    expect(findSimilar('교촌치킨 역삼점', corpus)[0]).toMatchObject({
      name: 'BBQ치킨',
      categoryId: 3,
    });
  });

  test('겹친 조각이 없는 가맹점은 내지 않는다', () => {
    expect(findSimilar('세븐일레븐', known(['GS25 역삼점', 2], ['CU 강남점', 2]))).toEqual([]);
  });

  test('점수가 높은 순으로 k곳까지 낸다', () => {
    const corpus = known(
      ['스타필드', 5],
      ['스타벅스리저브', 2],
      ['벅스뮤직', 8],
      ['스타벅스 역삼점', 2],
    );
    const found = findSimilar('스타벅스 강남점', corpus, 2);
    expect(found.map(m => m.name)).toEqual(['스타벅스 역삼점', '스타벅스리저브']);
    expect(found[0].score).toBeGreaterThan(found[1].score);
  });

  test('점수가 같으면 앞(최근) 가맹점이 먼저다', () => {
    const corpus = known(['치킨마루', 3], ['치킨나라', 1]);
    expect(findSimilar('치킨', corpus).map(m => m.name)).toEqual(['치킨마루', '치킨나라']);
  });

  test('지점명만 겹치는 가맹점은 내지 않는다', () => {
    // 띄어 쓴 마지막 낱말이 점으로 끝나면 지점명이다. 짧은 이름에서는 지점명이 이름의 절반이라 가중치로도 남는다
    const corpus = known(['피자헛 강남점', 3], ['유니클로 강남점', 5], ['CGV 강남', 8]);
    expect(findSimilar('자라 강남점', corpus)).toEqual([]);
  });

  test('점수가 낮은(조각 하나가 스친) 가맹점은 내지 않는다', () => {
    const corpus = known(['서울도시가스', 7], ['서울교통공사', 4], ['강남연세내과의원', 9]);
    expect(findSimilar('서울아산병원', corpus)).toEqual([]);
  });

  test('과거 가맹점이 적어도 낱말 하나(치킨)가 겹치면 낸다', () => {
    // 과거 가맹점이 하나뿐이면 겹친 조각의 가중치가 낮아 점수가 0.19였다(에뮬레이터, 최소 점수 0.2에서 빠졌다)
    const corpus = known(['교촌치킨 역삼점', 3]);
    expect(findSimilar('BHC치킨 선릉점', corpus).map(m => m.name)).toEqual(['교촌치킨 역삼점']);
  });

  test('과거 가맹점이 없으면 빈 목록이다', () => {
    expect(findSimilar('스타벅스', [])).toEqual([]);
  });
});
