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

/**
 * 결제대행사. 카드 알림의 가맹점명이 이 이름이면 실제 가게를 알 수 없다(PRD 4.9). 신한카드 알림에서 토스 결제가
 * "비바리퍼블리카"로 왔다. 띄어쓰기를 지운 정규화 이름의 앞부분으로 본다. "토스"만으로는 보지 않는다("토스트" 가게)
 */
const PAYMENT_GATEWAYS = [
  '비바리퍼블리카',
  '토스페이',
  '네이버파이낸셜',
  '네이버페이',
  '카카오페이',
  'KG이니시스',
  '이니시스',
  'KG모빌리언스',
  'NHNKCP',
  '한국사이버결제',
  'NHN페이코',
  '페이코',
  '나이스페이',
  'NICE페이먼츠',
  '다날',
  '헥토파이낸셜',
  '쿠팡페이',
  '스마일페이',
  'SSG페이',
  '페이레터',
];

export function isPaymentGateway(name: string) {
  const compact = normalizeMerchant(name).replace(/ /g, '');
  return PAYMENT_GATEWAYS.some(gateway => compact.startsWith(gateway));
}

/**
 * 검색 자료로 쓸 가게 이름. 결제대행사면 사용자가 메모를 가게 이름으로 고쳤을 때만 그 메모다(PRD 4.9). 대행사 이름
 * 그대로 두면 토스로 낸 결제가 모두 한 가맹점으로 묶인다
 */
function storeName(merchant: string, memo: string | null | undefined) {
  if (!isPaymentGateway(merchant)) return normalizeMerchant(merchant);
  if (!memo || isPaymentGateway(memo)) return '';
  return normalizeMerchant(memo);
}

/**
 * 가맹점이 있는 과거 지출(최근 것 먼저)을 정규화한 이름마다 하나로 묶는다. 순서는 최근 거래 순이다.
 * 결제대행사 결제는 메모를 가게 이름으로 쓰고, 고치지 않았으면 뺀다
 */
export function knownMerchants(
  history: Array<{ merchant: string; memo?: string | null; categoryId: number }>,
) {
  const byName = new Map<string, Known>();
  for (const row of history) {
    const name = storeName(row.merchant, row.memo);
    if (!name) continue;
    const known = byName.get(name);
    if (known) known.count += 1;
    else byName.set(name, { name, categoryId: row.categoryId, count: 1 });
  }
  return [...byName.values()];
}
