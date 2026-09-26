import { daysInMonth, toLocalDate } from './date';
import type { FixedCost, Transaction } from './types';

type Item = Pick<FixedCost, 'id' | 'dayOfMonth' | 'hidden' | 'createdAt'>;

/** 그 달(`YYYY-MM`)의 결제일. 그 달에 없는 날이면 말일이다(2월 30일 → 2월 28일) */
export function paymentDate(dayOfMonth: number, month: string) {
  return `${month}-${String(Math.min(dayOfMonth, daysInMonth(month))).padStart(2, '0')}`;
}

/**
 * 그 달의 고정비 체크리스트(PRD 4.4). 홈의 "5개 중 3개 기록"과 밀린 항목, 월간 회고 전 미기록 확인에 쓴다.
 * 끝난 달을 넘기면 결제일이 모두 today 이전이라 기록하지 않은 항목이 모두 overdue다.
 */
export function fixedCostChecklist<T extends Item>(
  items: T[],
  transactions: Pick<Transaction, 'date' | 'fixedCostId'>[],
  month: string,
  today: string,
) {
  const recordedIds = new Set(
    transactions.filter(tx => tx.date.startsWith(month)).map(tx => tx.fixedCostId),
  );
  const rows = items
    .filter(item => !item.hidden)
    .map(item => ({
      item,
      date: paymentDate(item.dayOfMonth, month),
      recorded: recordedIds.has(item.id),
    }))
    // 등록 전에 지난 결제일을 미기록으로 잡지 않는다. 그래도 사용자가 연결한 거래가 있으면 기록으로 센다
    .filter(row => row.recorded || row.date >= toLocalDate(new Date(row.item.createdAt)));

  return {
    total: rows.length,
    recorded: rows.filter(row => row.recorded).length,
    /** 결제일이 오늘이거나 지났는데 기록하지 않은 항목. 결제일 오름차순(오래 밀린 것 먼저) */
    overdue: rows
      .filter(row => !row.recorded && row.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => row.item),
  };
}
