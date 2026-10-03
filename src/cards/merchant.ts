/**
 * 가맹점 이름(PRD 4.9). 거래에는 알림의 원문을 저장하고, 비교할 때 여기서 정규화한다. 규칙을 바꿔도 다시 계산된다.
 */

/** 법인 표기. NFKC가 ㈜를 (주)로 바꾼 뒤에 지운다 */
const CORPORATE = /\(\s*주\s*\)|주식회사/g;

/**
 * 정확 일치와 검색에 쓰는 이름. NFKC(전각 영문·숫자, ㈜를 보통 글자로), 법인 표기 지우기, 영문 대문자, 공백 정리.
 * 지점명은 지우지 않는다. "역삼점"을 떼는 규칙은 "할인점" 같은 이름을 깨뜨리고, 검색의 가중치가 흔한 지점명을 낮춘다
 */
export function normalizeMerchant(name: string) {
  return name.normalize('NFKC').replace(CORPORATE, ' ').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * 검색에 쓰는 이름 조각. 정규화한 이름을 낱말마다 글자 두 개씩 자른다. 띄어쓰기를 넘지 않아 "치킨 역삼점"의
 * "킨역" 같은 조각이 생기지 않는다. 한 글자 낱말은 그 글자 하나이고, 한 이름 안의 같은 조각은 한 번만 센다
 */
export function nameGrams(name: string) {
  const grams = new Set<string>();
  for (const word of normalizeMerchant(name).split(' ')) {
    const chars = Array.from(word);
    if (chars.length === 1) grams.add(word);
    for (let i = 0; i + 1 < chars.length; i++) grams.add(chars[i] + chars[i + 1]);
  }
  return [...grams];
}

/** 사용자가 전에 적은 가맹점. name은 정규화한 이름, categoryId는 가장 최근 거래의 카테고리, count는 거래 수다 */
export type Known = { name: string; categoryId: number; count: number };

/** 가맹점이 있는 과거 지출(최근 것 먼저)을 정규화한 이름마다 하나로 묶는다. 순서는 최근 거래 순이다 */
export function knownMerchants(history: Array<{ merchant: string; categoryId: number }>) {
  const byName = new Map<string, Known>();
  for (const row of history) {
    const name = normalizeMerchant(row.merchant);
    if (!name) continue;
    const known = byName.get(name);
    if (known) known.count += 1;
    else byName.set(name, { name, categoryId: row.categoryId, count: 1 });
  }
  return [...byName.values()];
}
