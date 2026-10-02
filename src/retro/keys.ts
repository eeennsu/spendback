import type { Facts } from '../domain/facts';
import {
  formatDate,
  formatPercent,
  formatPeriod,
  formatWeekday,
  formatWon,
} from '../domain/format';

/**
 * facts를 LLM이 참조할 키와 채울 값으로 바꾼다(PRD 4.6). 이 결과가 회고와 함께 저장하는 facts 스냅샷이다.
 * 키는 표시 이름이 아니라 id로 만든다. 사용자가 이름을 바꾸거나 이름에 숫자를 넣어도 키가 흔들리지 않는다(PRD 13장).
 * 데이터가 없는 값은 키를 만들지 않는다. 그러면 LLM이 그 사실을 쓸 수 없다(PRD 2장).
 * 묶음은 눈에 띄는 순서로 둔다(salience).
 *
 * 키 이름 규칙(묶음 id.이름). 서술어는 방향까지 코드가 쓴 값이고 문장을 끝낸다
 *
 * | 묶음 | 키 | 값 예 |
 * |---|---|---|
 * | total | expense, variable, fixed | 412,300원 |
 * | total | change_phrase, change_rate_phrase(서술어) | 32,400원 늘었어요, 21% 늘었어요 |
 * | budget | amount, usage | 280,000원, 67% |
 * | budget | balance_phrase(서술어) | 92,700원 남았어요, 20,100원 넘었어요 |
 * | category.<id> | name, amount, share, budget_usage | 배달, 68,000원, 36%, 71% |
 * | category.<id> | change_phrase, budget_balance_phrase(서술어) | 29,000원 늘었어요 |
 * | tag.<id> | name, amount, share | 충동, 54,000원, 29% |
 * | regret | amount, share | 47,000원, 25% |
 * | largest | amount, category, memo, date | 32,000원, 배달, 야식 치킨, 9월 24일 목요일 |
 * | no_spend | days | 하루, 5일 |
 * | busiest | day 또는 weekday, amount | 9월 26일 토요일, 71,500원 |
 * | memo.<n> | text, count, amount | 편의점 커피, 5번, 12,500원 |
 * | income | amount, expense_rate | 3,200,000원, 85% |
 * | income | balance_phrase(서술어) | 480,000원 남았어요, 214,000원 더 썼어요 |
 */

/** 명사 값 뒤에는 조사 쌍을 붙일 수 있고, 서술어 값은 문장을 끝낸다(grammar.ts) */
export type FactKind = 'noun' | 'predicate';
export type KeyedFact = { key: string; value: string; kind: FactKind; note: string };
/** insight 하나는 묶음 하나의 키만 쓴다(PRD 4.6) */
export type FactGroup = {
  id: string;
  title: string;
  facts: KeyedFact[];
  /** 이 묶음이 눈에 띄는 까닭이 된 키 이름(묶음 id를 뺀 것). headline 후보는 이 키를 쓴 틀이다(frames.ts) */
  focus?: string[];
};
export type KeyedFacts = { kind: Facts['kind']; period: string; groups: FactGroup[] };

export type Names = { categories: Map<number, string>; reasonTags: Map<number, string> };

/** 프롬프트를 줄이려고 카테고리는 합계 상위 5개와 증감·예산이 있는 것만 넣는다(PRD 10장) */
const TOP_CATEGORIES = 5;

type Entry = [name: string, value: string | undefined, note: string, kind?: FactKind];

function group(id: string, title: string, entries: Entry[]): FactGroup[] {
  const facts = entries.flatMap(([name, value, note, kind = 'noun']) =>
    value === undefined ? [] : [{ key: `${id}.${name}`, value, kind, note }],
  );
  return facts.length ? [{ id, title, facts }] : [];
}

/** 날수. "1일"은 날짜로 읽혀 하루라고 쓴다 */
const dayCount = (days: number) => (days === 1 ? '하루' : `${days}일`);

function changePhrase(amount: number) {
  if (amount === 0) return '같았어요';
  return `${formatWon(Math.abs(amount))} ${amount > 0 ? '늘었어요' : '줄었어요'}`;
}

function balancePhrase(budget: number, spent: number) {
  if (spent === budget) return '다 썼어요';
  return spent < budget
    ? `${formatWon(budget - spent)} 남았어요`
    : `${formatWon(spent - budget)} 넘었어요`;
}

/** 수입에서 남은 돈, 또는 수입보다 더 쓴 돈 */
function incomePhrase(income: number, expense: number) {
  if (expense === income) return '다 썼어요';
  return expense < income
    ? `${formatWon(income - expense)} 남았어요`
    : `${formatWon(expense - income)} 더 썼어요`;
}

/**
 * 묶음이 눈에 띄는 정도(0~100)와 그 까닭이 된 키(focus). 묶음을 이 순서로 프롬프트에 쓰고, headline 후보는 앞
 * 묶음에서, 그 묶음의 focus 키를 쓴 틀로 고른다(frames.ts). 2026-10-02 하네스에서 두 모델 모두 적자와 예산
 * 초과를 headline으로 거의 고르지 않았고, 배달 예산을 넘은 주에 "배달 지출이 늘었어요"를 headline으로 골라 같은
 * 묶음의 예산 초과를 말하지 못했다(PRD 11장). 값은 같은 기간의 변동비에 대한 비율로 정해 주간·월간에 같이 쓴다
 */
function salience(facts: Facts, id: string): { weight: number; focus?: string[] } {
  const variable = facts.variable;
  const part = (amount: number) => (variable > 0 ? Math.abs(amount) / variable : 0);
  const [kind, raw] = id.split('.');
  const key = Number(raw);
  /** 가장 큰 까닭 하나를 고른다. 같으면 앞의 것 */
  const strongest = (...reasons: Array<[number, string[]]>) =>
    reasons.reduce((best, reason) => (reason[0] > best[0] ? reason : best));
  switch (kind) {
    case 'income': {
      const r = facts.incomeRatio;
      if (!r) return { weight: 0 };
      const weight = r.expense > r.income ? 100 : r.expense >= r.income * 0.9 ? 75 : 40;
      return { weight, focus: ['balance_phrase'] };
    }
    case 'budget': {
      const b = facts.budget;
      if (!b) return { weight: 0 };
      const weight = b.spent > b.budget ? 95 : b.spent >= b.budget * 0.9 ? 70 : 45;
      return { weight, focus: ['balance_phrase'] };
    }
    case 'total': {
      const c = facts.change;
      // 월세처럼 고정비가 총지출의 70% 넘게 차지한 주는 그것이 그 주의 이야기다
      const fixedHeavy = facts.total > 0 && facts.fixed / facts.total >= 0.7 ? 70 : 0;
      const rate = c && c.previous > 0 ? Math.abs(c.amount) / c.previous : undefined;
      const byChange = !c
        ? 35
        : rate === undefined
          ? 40
          : rate >= 0.3
            ? 80
            : rate >= 0.15
              ? 60
              : rate >= 0.05
                ? 40
                : 25;
      const [weight, focus] = strongest(
        [byChange, c ? ['change_phrase', 'change_rate_phrase'] : ['variable']],
        [fixedHeavy, ['fixed']],
      );
      return { weight, focus };
    }
    case 'category': {
      const spent = facts.categories.find(c => c.categoryId === key)?.amount ?? 0;
      const change = facts.topCategoryChanges?.find(c => c.categoryId === key)?.change;
      const budget = facts.budget?.categories.find(c => c.categoryId === key);
      const share = part(spent);
      const [weight, focus] = strongest(
        [share >= 0.5 ? 70 : share >= 0.3 ? 45 : 15 + Math.round(share * 30), ['share']],
        [
          change === undefined ? 0 : part(change) >= 0.15 ? 65 : part(change) >= 0.08 ? 45 : 25,
          ['change_phrase'],
        ],
        [
          !budget
            ? 0
            : budget.spent > budget.budget
              ? 85
              : budget.spent >= budget.budget * 0.9
                ? 55
                : 30,
          ['budget_balance_phrase'],
        ],
      );
      return { weight, focus };
    }
    case 'tag': {
      const share = part(facts.reasonTags.find(t => t.reasonTagId === key)?.amount ?? 0);
      return { weight: share >= 0.3 ? 50 : share >= 0.15 ? 35 : 20 };
    }
    case 'regret':
      return { weight: part(facts.regret) >= 0.2 ? 55 : part(facts.regret) >= 0.1 ? 40 : 25 };
    case 'largest':
      return { weight: part(facts.largest?.amount ?? 0) >= 0.25 ? 45 : 20 };
    case 'no_spend': {
      // 한 주 7일 중 5일, 한 달 중 12일 넘게 쓰지 않았으면 그 기간의 이야기다
      const [many, some] = facts.kind === 'weekly' ? [5, 3] : [12, 8];
      return {
        weight: facts.noSpendDays >= many ? 75 : facts.noSpendDays >= some ? 50 : 15,
      };
    }
    case 'busiest':
      return { weight: facts.busiestDay && part(facts.busiestDay.amount) >= 0.4 ? 35 : 15 };
    case 'memo':
      return { weight: (facts.repeatedMemos[key - 1]?.count ?? 0) >= 5 ? 30 : 18 };
    default:
      return { weight: 0 };
  }
}

export function keyFacts(facts: Facts, names: Names): KeyedFacts {
  const before = facts.kind === 'weekly' ? '지난주보다' : '지난달보다';
  const whole = facts.variable;
  const share = (amount: number) =>
    amount > 0 && whole > 0 ? formatPercent(amount, whole) : undefined;
  const won = (amount: number) => (amount > 0 ? formatWon(amount) : undefined);

  const change = facts.change;
  const rate =
    change && change.previous > 0 && change.amount !== 0
      ? `${formatPercent(Math.abs(change.amount), change.previous)} ${change.amount > 0 ? '늘었어요' : '줄었어요'}`
      : undefined;

  const budget = facts.budget && facts.budget.budget > 0 ? facts.budget : undefined;

  const changes = new Map((facts.topCategoryChanges ?? []).map(c => [c.categoryId, c]));
  const categoryBudgets = new Map((budget?.categories ?? []).map(c => [c.categoryId, c]));
  const amounts = new Map(facts.categories.map(c => [c.categoryId, c.amount]));
  const shownCategories = [
    ...new Set([
      ...facts.categories.slice(0, TOP_CATEGORIES).map(c => c.categoryId),
      ...changes.keys(),
      ...categoryBudgets.keys(),
    ]),
  ];

  const largest = facts.largest;

  const groups: FactGroup[] = [
    ...group('total', '총지출', [
      ['expense', formatWon(facts.total), '고정비를 포함한 전체 지출'],
      ['variable', formatWon(facts.variable), '변동비(고정비를 뺀 지출)'],
      ['fixed', won(facts.fixed), '고정비'],
      ['change_phrase', change && changePhrase(change.amount), `변동비가 ${before}`, 'predicate'],
      ['change_rate_phrase', rate, `변동비가 ${before}`, 'predicate'],
    ]),
    ...(budget
      ? group('budget', '예산', [
          [
            'amount',
            formatWon(budget.budget),
            facts.kind === 'weekly' ? '이번 주 예산(월 예산을 날수로 나눈 몫)' : '이번 달 예산',
          ],
          ['usage', formatPercent(budget.spent, budget.budget), '예산 사용률(변동비)'],
          ['balance_phrase', balancePhrase(budget.budget, budget.spent), '예산에서', 'predicate'],
        ])
      : []),
    ...shownCategories.flatMap(id => {
      const amount = amounts.get(id) ?? 0;
      const categoryChange = changes.get(id);
      const categoryBudget = categoryBudgets.get(id);
      return group(`category.${id}`, '카테고리', [
        ['name', names.categories.get(id) ?? '카테고리', '카테고리 이름'],
        ['amount', won(amount), '이 카테고리의 변동비 지출'],
        ['share', share(amount), '변동비 중 비중'],
        [
          'change_phrase',
          categoryChange && changePhrase(categoryChange.change),
          `이 카테고리 지출이 ${before}`,
          'predicate',
        ],
        [
          'budget_usage',
          categoryBudget && categoryBudget.budget > 0
            ? formatPercent(categoryBudget.spent, categoryBudget.budget)
            : undefined,
          '카테고리 예산 사용률',
        ],
        [
          'budget_balance_phrase',
          categoryBudget && balancePhrase(categoryBudget.budget, categoryBudget.spent),
          '카테고리 예산에서',
          'predicate',
        ],
      ]);
    }),
    ...facts.reasonTags.flatMap(t =>
      group(`tag.${t.reasonTagId}`, '이유 태그', [
        ['name', names.reasonTags.get(t.reasonTagId) ?? '태그', '이유 태그 이름'],
        ['amount', formatWon(t.amount), '이 태그가 붙은 지출'],
        ['share', share(t.amount), '변동비 중 비중'],
      ]),
    ),
    ...group('regret', '후회한 지출', [
      ['amount', won(facts.regret), '만족도를 "후회"로 고른 지출 합계'],
      ['share', share(facts.regret), '변동비 중 비중'],
    ]),
    ...(largest
      ? group('largest', '가장 큰 지출 한 건', [
          ['amount', formatWon(largest.amount), '금액'],
          ['category', names.categories.get(largest.categoryId), '카테고리 이름'],
          ['memo', largest.memo || undefined, '메모'],
          ['date', formatDate(largest.date), '날짜'],
        ])
      : []),
    ...group('no_spend', '무지출일', [
      [
        'days',
        facts.noSpendDays > 0 ? dayCount(facts.noSpendDays) : undefined,
        '변동비를 쓰지 않은 날 수',
      ],
    ]),
    ...(facts.busiestDay
      ? group('busiest', '가장 많이 쓴 날', [
          ['day', formatDate(facts.busiestDay.date), '날짜'],
          ['amount', formatWon(facts.busiestDay.amount), '그날 변동비 지출'],
        ])
      : []),
    ...(facts.busiestWeekday
      ? group('busiest', '가장 많이 쓴 요일', [
          ['weekday', formatWeekday(facts.busiestWeekday.weekday), '요일'],
          ['amount', formatWon(facts.busiestWeekday.amount), '그 요일들의 변동비 지출 합계'],
        ])
      : []),
    ...facts.repeatedMemos.flatMap((m, i) =>
      group(`memo.${i + 1}`, '반복된 메모', [
        ['text', m.memo, '메모'],
        ['count', `${m.count}번`, '같은 메모로 쓴 횟수'],
        ['amount', formatWon(m.amount), '합계'],
      ]),
    ),
    ...(facts.incomeRatio
      ? group('income', '수입', [
          ['amount', formatWon(facts.incomeRatio.income), '이번 달 수입'],
          [
            'expense_rate',
            formatPercent(facts.incomeRatio.expense, facts.incomeRatio.income),
            '수입 대비 지출(고정비 포함)',
          ],
          [
            'balance_phrase',
            incomePhrase(facts.incomeRatio.income, facts.incomeRatio.expense),
            '수입에서(고정비 포함)',
            'predicate',
          ],
        ])
      : []),
  ];
  const scored = groups.map(g => ({ ...salience(facts, g.id), group: g }));

  return {
    kind: facts.kind,
    period: formatPeriod(facts.kind, facts.start),
    // 같은 값이면 원래 순서다(Array.prototype.sort는 안정 정렬)
    groups: scored
      .sort((a, b) => b.weight - a.weight)
      .map(({ group, focus }) => (focus ? { ...group, focus } : group)),
  };
}

/** 렌더러가 쓰는 키 → 값 */
export function factValues(keyed: KeyedFacts) {
  return Object.fromEntries(keyed.groups.flatMap(g => g.facts.map(f => [f.key, f.value])));
}
