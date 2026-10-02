import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { setBudget } from '../db/budgets';
import { addFixedCost, allFixedCosts } from '../db/lists';
import { fixedCosts } from '../db/schema';
import { type TransactionInput, addTransaction } from '../db/transactions';
import { addDays } from '../domain/date';
import { paymentDate } from '../domain/fixedCost';

/**
 * 개발 빌드의 샘플 데이터(설정 → 개발). 지난 두 달 남짓의 한 사람 기록을 만든다. 화면 확인과 시연에 쓴다.
 * 카테고리·태그 id는 기본값 마이그레이션(0001_seed.sql)의 순서다. 같은 오늘이면 같은 기록이 나온다
 */
export async function insertSample(db: Db, today: string) {
  let seed = Number(today.replace(/-/g, '')) % 2147483647;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const won = (min: number, max: number) => Math.round((min + random() * (max - min)) / 100) * 100;

  const items = [
    {
      name: '월세',
      amount: 550000,
      categoryId: 7,
      dayOfMonth: 25,
      paymentMethod: 'transfer' as const,
    },
    {
      name: '휴대폰 요금',
      amount: 55000,
      categoryId: 7,
      dayOfMonth: 21,
      paymentMethod: 'card' as const,
    },
    {
      name: '넷플릭스',
      amount: 13500,
      categoryId: 8,
      dayOfMonth: 5,
      paymentMethod: 'card' as const,
    },
    {
      name: '헬스장',
      amount: 60000,
      categoryId: 9,
      dayOfMonth: 10,
      paymentMethod: 'card' as const,
    },
  ];
  for (const item of items) await addFixedCost(db, item);
  const fixed = (await allFixedCosts(db)).slice(-items.length);
  const start = addDays(today, -65);
  // 두 달 전부터 쓰던 항목이다. 등록 전 결제일은 체크리스트가 보지 않는다(PRD 4.4)
  for (const item of fixed) {
    await db
      .update(fixedCosts)
      .set({ createdAt: Date.parse(`${start}T00:00:00`) })
      .where(eq(fixedCosts.id, item.id));
  }

  await setBudget(db, start.slice(0, 7), 1200000, [
    { categoryId: 1, amount: 300000 },
    { categoryId: 3, amount: 120000 },
  ]);

  const tx = (
    input: Partial<TransactionInput> & Pick<TransactionInput, 'amount' | 'date' | 'categoryId'>,
  ) =>
    addTransaction(db, {
      type: 'expense',
      reasonTagId: null,
      satisfaction: null,
      memo: null,
      paymentMethod: 'card',
      isFixed: false,
      fixedCostId: null,
      ...input,
    });

  for (let date = start; date <= today; date = addDays(date, 1)) {
    const day = Number(date.slice(8));
    if (random() < 0.12) continue; // 쓰지 않은 날
    if (random() < 0.8) {
      await tx({
        amount: won(8000, 12000),
        date,
        categoryId: 1,
        memo: pick(['점심 순대국', '점심 김밥', '점심 도시락', '점심 국수']),
        reasonTagId: 1,
      });
    }
    if (random() < 0.55) {
      await tx({
        amount: pick([1800, 2500, 4500]),
        date,
        categoryId: 2,
        memo: '편의점 커피',
        reasonTagId: 5,
      });
    }
    if (random() < 0.22) {
      await tx({
        amount: won(18000, 32000),
        date,
        categoryId: 3,
        memo: pick(['야식 치킨', '떡볶이', '피자']),
        reasonTagId: pick([2, 3]),
        satisfaction: random() < 0.5 ? 'regret' : 'neutral',
      });
    }
    if (random() < 0.3) {
      await tx({
        amount: pick([1450, 1450, 12800, 15600]),
        date,
        categoryId: 4,
        memo: random() < 0.7 ? '버스' : '택시',
      });
    }
    if (random() < 0.08) {
      await tx({
        amount: won(15000, 70000),
        date,
        categoryId: 5,
        memo: pick(['다이소 수납함', '운동화', '셔츠']),
        reasonTagId: pick([1, 2]),
        satisfaction: pick(['satisfied', 'regret', 'neutral'] as const),
      });
    }
    if (random() < 0.1) {
      await tx({
        amount: won(9000, 40000),
        date,
        categoryId: 6,
        memo: pick(['세제', '휴지', '전구']),
        reasonTagId: 1,
      });
    }
    if (random() < 0.06) {
      await tx({
        amount: won(30000, 60000),
        date,
        categoryId: 10,
        memo: '친구 생일 선물',
        reasonTagId: 6,
      });
    }
    if (day === 25) {
      await tx({
        type: 'income',
        amount: 3200000,
        date,
        categoryId: 12,
        memo: '급여',
        paymentMethod: 'transfer',
      });
    }
  }

  // 지난달까지의 고정비는 기록하고, 이번 달은 결제일이 지난 것 하나를 남겨 홈에서 알린다
  for (
    let month = start.slice(0, 7);
    month <= today.slice(0, 7);
    month = addDays(`${month}-28`, 7).slice(0, 7)
  ) {
    for (const [i, item] of fixed.entries()) {
      const date = paymentDate(item.dayOfMonth, month);
      if (date < start || date > today) continue;
      if (month === today.slice(0, 7) && i === 1) continue;
      await tx({
        amount: item.amount + (i === 1 ? won(-3000, 3000) : 0),
        date,
        categoryId: item.categoryId,
        memo: item.name,
        paymentMethod: item.paymentMethod,
        isFixed: true,
        fixedCostId: item.id,
      });
    }
  }
}
