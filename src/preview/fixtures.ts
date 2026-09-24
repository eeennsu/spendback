/**
 * 디자인 시안용 가짜 데이터(2026-09-24 목요일 기준). DB와 계산기가 없으므로 표시 문자열을 미리 적는다.
 * 실제 화면에서는 금액·비율·일수를 코드가 계산한다(PRD 2장). 12장 6번에서 지운다.
 */

export const EXPENSE_CATEGORIES = [
  '식비',
  '카페·간식',
  '배달',
  '교통',
  '쇼핑',
  '생활',
  '주거·통신',
  '문화·여가',
  '의료·건강',
  '경조사·선물',
  '기타',
] as const;

export const INCOME_CATEGORIES = ['급여', '부수입', '기타'] as const;

export const REASON_TAGS = ['필요', '충동', '보상·스트레스', '약속·사교', '습관', '선물'] as const;

export const SATISFACTION = ['후회', '보통', '만족'] as const;

export const PAYMENT_METHODS = ['카드', '현금', '계좌이체'] as const;

/** 변동비 예산. 1,200,000원 중 788,400원 사용(66%), 9월 30일 중 24일 지남(80%) */
export const budget = {
  title: '9월 남은 예산',
  remaining: '411,600원',
  over: false,
  used: '788,400원 사용 · 66%',
  total: '예산 1,200,000원',
  // 게이지의 세로선이 무엇인지 화면 글자로도 적는다(색·모양만으로 뜻을 전하지 않는다)
  today: '세로선은 오늘이에요 · 이번 달 80% 지남',
  ratio: 0.657,
  elapsed: 0.8,
  valueText: '예산의 66% 사용, 기간의 80% 지남',
  // 소비 속도 계산식은 PRD 11장 미결이다. 시안은 "남은 예산 ÷ 남은 일수" 후보로 그렸다.
  pace: '남은 6일 · 하루 68,600원까지 쓸 수 있어요',
};

/** 총예산을 넘은 달. 1,218,000원 사용(102%), 같은 날(80% 지남) */
export const budgetOver: typeof budget = {
  title: '9월 예산',
  remaining: '18,000원 초과',
  over: true,
  used: '1,218,000원 사용 · 102%',
  total: '예산 1,200,000원',
  today: '세로선은 오늘이에요 · 이번 달 80% 지남',
  ratio: 1.015,
  elapsed: 0.8,
  valueText: '예산을 18,000원 넘었어요, 기간의 80% 지남',
  pace: '남은 6일 · 지금부터 쓰는 만큼 초과가 늘어요',
};

/** 등록한 고정비 항목. 입력 시트에서 고정비를 켜면 이 중 하나에 연결한다(PRD 4.4) */
export const fixedCostItems = ['월세', '휴대폰 요금', '인터넷', '넷플릭스', '음악 구독'] as const;

export const fixedCosts = {
  progress: '5개 중 3개 기록',
  overdue: [
    { name: '넷플릭스', detail: '17일 결제 · 예상 17,000원' },
    { name: '휴대폰 요금', detail: '21일 결제 · 예상 55,000원' },
  ],
};

export const categoryBudgets = [
  { name: '식비', amount: '212,300 / 300,000원', ratio: 0.708, valueText: '식비 예산의 71% 사용' },
  {
    name: '배달',
    amount: '118,000 / 100,000원 · 18,000원 초과',
    ratio: 1.18,
    valueText: '배달 예산 18,000원 초과',
  },
  {
    name: '카페·간식',
    amount: '46,500 / 80,000원',
    ratio: 0.581,
    valueText: '카페·간식 예산의 58% 사용',
  },
];

export const recentExpenses = [
  { id: '1', memo: '점심 순대국', meta: '식비 · 오늘', amount: '9,500원' },
  { id: '2', memo: '아메리카노', meta: '카페·간식 · 오늘', amount: '4,300원' },
  { id: '3', memo: '택시', meta: '교통 · 어제', amount: '12,800원' },
  { id: '4', memo: '치킨', meta: '배달 · 어제', amount: '23,900원' },
  { id: '5', memo: '다이소 수납함', meta: '생활 · 9월 22일', amount: '7,000원' },
];

export const memoSuggestions = ['점심 순대국', '점심 김치찌개'];
