import { budgetForMonth, monthStatus, weeklyBudget } from '../src/domain/budget';
import type { Budget, Transaction } from '../src/domain/types';

type Tx = Pick<Transaction, 'type' | 'isFixed' | 'amount' | 'date' | 'categoryId'>;

function expense(date: string, amount: number, categoryId = 'food', isFixed = false): Tx {
  return { type: 'expense', isFixed, amount, date, categoryId };
}

function budget(effectiveFrom: string, total: number, categoryBudgets = {}): Budget {
  return { effectiveFrom, total, categoryBudgets };
}

describe('budgetForMonth: 예산은 이어 쓴다', () => {
  const budgets = [budget('2026-07', 1000000), budget('2026-09', 1200000)];

  test('바꾸기 전 달은 앞의 예산을 이어 쓴다', () => {
    expect(budgetForMonth(budgets, '2026-08')?.total).toBe(1000000);
  });

  test('바꾼 달부터 새 예산이다', () => {
    expect(budgetForMonth(budgets, '2026-09')?.total).toBe(1200000);
    expect(budgetForMonth(budgets, '2027-01')?.total).toBe(1200000);
  });

  test('첫 예산보다 앞선 달은 예산이 없다', () => {
    expect(budgetForMonth(budgets, '2026-06')).toBeUndefined();
  });

  test('저장 순서와 상관없이 가장 늦은 것을 고른다', () => {
    expect(budgetForMonth([...budgets].reverse(), '2026-10')?.total).toBe(1200000);
  });
});

describe('weeklyBudget: 날마다 그 달 예산 ÷ 그 달 일수를 더한다', () => {
  test('한 달 안의 주', () => {
    // 9월 30일 × 7일
    expect(weeklyBudget([budget('2026-09', 1200000)], '2026-09-14')?.total).toBe(280000);
  });

  test('두 달에 걸친 주는 달마다 일할하고 원 단위로 내린다', () => {
    // 9월 3일(1,200,000 ÷ 30) + 10월 4일(1,200,000 ÷ 31) = 274,838.7…
    expect(weeklyBudget([budget('2026-09', 1200000)], '2026-09-28')?.total).toBe(274838);
  });

  test('정확히 떨어지는 합이 부동소수 오차로 1원 모자라지 않는다', () => {
    // 7월 5일 × 1,800,000 ÷ 31 + 8월 2일 × 1,700,000 ÷ 31 = 400,000. 날마다 더하면 399,999.99…
    const budgets = [budget('2026-07', 1800000), budget('2026-08', 1700000)];
    expect(weeklyBudget(budgets, '2026-07-27')?.total).toBe(400000);
  });

  test('하루라도 예산이 없으면 주간 예산이 없다', () => {
    // 첫 예산을 10월에 정했다. 9월 28~30일에는 예산이 없다
    expect(weeklyBudget([budget('2026-10', 1200000)], '2026-09-28')).toBeUndefined();
  });

  test('카테고리 예산은 그 주의 모든 날에 있을 때만 넣는다', () => {
    const budgets = [
      budget('2026-09', 1200000, { food: 300000, cafe: 60000 }),
      budget('2026-10', 1200000, { food: 310000 }),
    ];
    // food: 9월 3일 × 10,000 + 10월 4일 × 10,000. cafe는 10월에 없다
    expect(weeklyBudget(budgets, '2026-09-28')?.categoryBudgets).toEqual({ food: 70000 });
  });
});

describe('monthStatus: 홈 예산과 소비 속도(PRD 4.3)', () => {
  const budgets = [budget('2026-09', 1200000, { food: 300000, delivery: 100000 })];

  test('사용액은 이번 달 1일부터 오늘까지의 변동비다', () => {
    const status = monthStatus(
      budgets,
      [
        expense('2026-09-01', 700000),
        expense('2026-09-24', 88400, 'delivery'),
        expense('2026-08-31', 50000), // 지난달
        expense('2026-09-25', 50000), // 내일
        expense('2026-09-05', 500000, 'rent', true), // 고정비
        {
          type: 'income',
          isFixed: false,
          amount: 3000000,
          date: '2026-09-10',
          categoryId: 'salary',
        },
      ],
      '2026-09-24',
    );
    expect(status).toMatchObject({
      total: 1200000,
      spent: 788400,
      remaining: 411600,
      remainingDays: 7,
      dailyAllowance: 58800,
      dayOfMonth: 24,
      monthDays: 30,
      fast: false,
    });
    expect(status?.categories).toEqual([
      { categoryId: 'food', budget: 300000, spent: 700000 },
      { categoryId: 'delivery', budget: 100000, spent: 88400 },
    ]);
  });

  test('하루 쓸 수 있는 금액은 원 단위로 내린다', () => {
    const status = monthStatus(budgets, [expense('2026-09-24', 788401)], '2026-09-24');
    // 411,599 ÷ 7 = 58,799.857…
    expect(status?.dailyAllowance).toBe(58799);
  });

  test('남은 일수는 오늘을 포함한다', () => {
    expect(monthStatus(budgets, [], '2026-09-30')?.remainingDays).toBe(1);
    expect(monthStatus(budgets, [], '2026-09-01')?.remainingDays).toBe(30);
  });

  test('예산을 넘으면 하루 쓸 수 있는 금액이 없다', () => {
    const status = monthStatus(budgets, [expense('2026-09-10', 1218000)], '2026-09-24');
    expect(status).toMatchObject({ remaining: -18000, dailyAllowance: undefined, fast: true });
  });

  test('예산을 딱 다 쓰면 초과가 아니다', () => {
    const status = monthStatus(budgets, [expense('2026-09-10', 1200000)], '2026-09-24');
    expect(status).toMatchObject({ remaining: 0, dailyAllowance: 0 });
  });

  test('사용률이 지난 비율보다 크면 빠르게 쓰고 있다', () => {
    // 지난 비율 24/30 = 80%. 사용률 960,000 / 1,200,000 = 80%는 빠르지 않다
    expect(monthStatus(budgets, [expense('2026-09-10', 960000)], '2026-09-24')?.fast).toBe(false);
    expect(monthStatus(budgets, [expense('2026-09-10', 960001)], '2026-09-24')?.fast).toBe(true);
  });

  test('예산이 없는 달은 상태가 없다(첫 실행)', () => {
    expect(monthStatus([], [expense('2026-09-10', 1000)], '2026-09-24')).toBeUndefined();
  });
});
