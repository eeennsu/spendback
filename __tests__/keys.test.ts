import { sampleFacts as base, sampleNames as names } from '../jest/facts';
import type { Facts } from '../src/domain/facts';
import { factValues, keyFacts } from '../src/retro/keys';

const values = (facts: Facts) => factValues(keyFacts(facts, names));

test('키는 묶음 id로 시작하고 겹치지 않는다', () => {
  const keyed = keyFacts(base, names);
  const keys = keyed.groups.flatMap(g => g.facts.map(f => f.key));
  expect(new Set(keys).size).toBe(keys.length);
  for (const g of keyed.groups) {
    for (const f of g.facts) expect(f.key.startsWith(`${g.id}.`)).toBe(true);
  }
});

test('기간 이름', () => {
  expect(keyFacts(base, names).period).toBe('9월 21일~27일');
});

describe('총지출과 증감', () => {
  test('증감은 방향까지 쓴 서술어다', () => {
    const keyed = keyFacts(base, names);
    expect(values(base)).toMatchObject({
      'total.expense': '412,300원',
      'total.variable': '187,300원',
      'total.fixed': '225,000원',
      'total.change_phrase': '32,400원 늘었어요',
      'total.change_rate_phrase': '21% 늘었어요',
    });
    const phrase = keyed.groups[0].facts.find(f => f.key === 'total.change_phrase');
    expect(phrase?.kind).toBe('predicate');
  });

  test('줄었거나 같으면 그렇게 쓴다', () => {
    expect(values({ ...base, change: { previous: 50000, amount: -12300 } })).toMatchObject({
      'total.change_phrase': '12,300원 줄었어요',
      'total.change_rate_phrase': '25% 줄었어요',
    });
    const same = values({ ...base, change: { previous: 50000, amount: 0 } });
    expect(same['total.change_phrase']).toBe('같았어요');
    expect(same['total.change_rate_phrase']).toBeUndefined();
  });

  test('비교할 수 없으면 증감 키가 없다', () => {
    const v = values({ ...base, change: undefined, topCategoryChanges: undefined });
    expect(v['total.change_phrase']).toBeUndefined();
    expect(v['category.3.change_phrase']).toBeUndefined();
  });

  test('직전 금액이 0이면 증감률은 없고 증감액은 있다', () => {
    const v = values({ ...base, change: { previous: 0, amount: 5000 } });
    expect(v['total.change_phrase']).toBe('5,000원 늘었어요');
    expect(v['total.change_rate_phrase']).toBeUndefined();
  });

  test('고정비가 없으면 고정비 키가 없다', () => {
    expect(values({ ...base, fixed: 0 })['total.fixed']).toBeUndefined();
  });
});

describe('예산', () => {
  test('남았으면 남은 금액, 넘었으면 넘은 금액을 서술어로 쓴다', () => {
    expect(values(base)).toMatchObject({
      'budget.amount': '280,000원',
      'budget.usage': '67%',
      'budget.balance_phrase': '92,700원 남았어요',
      'category.1.budget_usage': '59%',
      'category.1.budget_balance_phrase': '28,800원 남았어요',
    });
    const over = values({ ...base, budget: { budget: 280000, spent: 300100, categories: [] } });
    expect(over['budget.balance_phrase']).toBe('20,100원 넘었어요');
    const exact = values({ ...base, budget: { budget: 280000, spent: 280000, categories: [] } });
    expect(exact['budget.balance_phrase']).toBe('다 썼어요');
  });

  test('예산이 없으면 예산 키가 없다', () => {
    expect(
      Object.keys(values({ ...base, budget: undefined })).some(k => k.startsWith('budget.')),
    ).toBe(false);
  });
});

describe('카테고리', () => {
  test('이름·금액·비중을 id 키로 낸다', () => {
    expect(values(base)).toMatchObject({
      'category.3.name': '배달',
      'category.3.amount': '68,000원',
      'category.3.share': '36%',
      'category.3.change_phrase': '29,000원 늘었어요',
    });
  });

  test('합계 상위 5개와 증감·예산이 있는 카테고리만 넣는다', () => {
    const ids = keyFacts(base, names)
      .groups.filter(g => g.id.startsWith('category.'))
      .map(g => g.id);
    // 6번(생활)은 6위라 빠지고, 7번(문화·여가)은 증감 상위라 들어간다
    expect(ids).toEqual([
      'category.3',
      'category.1',
      'category.2',
      'category.4',
      'category.5',
      'category.7',
    ]);
  });

  test('이번 기간에 쓰지 않은 카테고리는 이름과 증감만 있다', () => {
    const group = keyFacts(base, names).groups.find(g => g.id === 'category.7');
    expect(group?.facts.map(f => f.key)).toEqual(['category.7.name', 'category.7.change_phrase']);
  });
});

describe('나머지 묶음', () => {
  test('태그·후회·최대 지출·무지출일·가장 많이 쓴 날·반복 메모', () => {
    expect(values(base)).toMatchObject({
      'tag.2.name': '충동',
      'tag.2.share': '29%',
      'regret.amount': '47,000원',
      'largest.amount': '32,000원',
      'largest.category': '배달',
      'largest.memo': '야식 치킨',
      'largest.date': '9월 24일 목요일',
      'no_spend.days': '1일',
      'busiest.day': '9월 26일 토요일',
      'memo.1.text': '편의점 커피',
      'memo.1.count': '5번',
    });
  });

  test('0이거나 없는 값은 키를 만들지 않는다', () => {
    const v = values({
      ...base,
      regret: 0,
      noSpendDays: 0,
      largest: base.largest && { ...base.largest, memo: null },
    });
    expect(v['regret.amount']).toBeUndefined();
    expect(v['no_spend.days']).toBeUndefined();
    expect(v['largest.memo']).toBeUndefined();
  });

  test('월간은 가장 많이 쓴 요일과 수입 대비 지출률이 있다', () => {
    const v = values({
      ...base,
      kind: 'monthly',
      start: '2026-09-01',
      end: '2026-09-30',
      busiestDay: undefined,
      busiestWeekday: { weekday: 5, amount: 310000 },
      incomeRatio: { income: 3200000, expense: 2720000 },
    });
    expect(v).toMatchObject({
      'busiest.weekday': '토요일',
      'income.amount': '3,200,000원',
      'income.expense_rate': '85%',
    });
  });
});
