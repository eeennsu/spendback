import { addMonths, daysInMonth, toLocalDate } from './date';
import type { FixedCost, Transaction } from './types';

type Item = Pick<
  FixedCost,
  'id' | 'dayOfMonth' | 'hidden' | 'createdAt' | 'installmentMonths' | 'installmentStart'
>;

/** 할부 개월 수의 범위(PRD 4.4). 1개월은 일시불이다 */
export const INSTALLMENT_MONTHS = { min: 2, max: 36 };

/** 무이자 할부의 월 납부액은 총액 ÷ 개월 수를 원 단위로 내리고, 나머지 원은 1회차에 붙인다(PRD 4.4) */
export function splitInstallment(total: number, months: number) {
  const monthly = Math.floor(total / months);
  return { monthly, first: total - monthly * (months - 1) };
}

/** 할부의 마지막 달(YYYY-MM). 할부가 아니면 없다 */
export function installmentEnd(item: Span) {
  return item.installmentStart !== null && item.installmentMonths !== null
    ? addMonths(item.installmentStart, item.installmentMonths - 1)
    : undefined;
}

type Span = Pick<FixedCost, 'installmentMonths' | 'installmentStart'>;

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

/** 그 달이 몇 회차인가. 시작 달이 1회차다. 할부가 아니면 없다 */
export function installmentRound(item: Span, month: string) {
  return item.installmentStart === null
    ? undefined
    : monthIndex(month) - monthIndex(item.installmentStart) + 1;
}

/** 마지막 달이 그 달보다 앞인가(끝난 할부). 할부가 아니면 끝나지 않는다 */
export function installmentOver(item: Span, month: string) {
  const end = installmentEnd(item);
  return end !== undefined && end < month;
}

/** 그 달에 확인할 항목인가. 할부는 시작 달부터 마지막 달까지만이다 */
function dueIn(item: Item, month: string) {
  const end = installmentEnd(item);
  return end === undefined || (item.installmentStart! <= month && month <= end);
}

/** 할부의 진행. 연결된 거래로 센다(고친 금액도 그대로 반영된다) */
export function installmentProgress(
  item: Pick<FixedCost, 'installmentTotal' | 'installmentMonths'>,
  linked: Pick<Transaction, 'amount'>[],
) {
  const paidAmount = linked.reduce((sum, tx) => sum + tx.amount, 0);
  return { paid: linked.length, remaining: Math.max(0, (item.installmentTotal ?? 0) - paidAmount) };
}

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
    .filter(item => !item.hidden && dueIn(item, month))
    .map(item => ({
      item,
      date: paymentDate(item.dayOfMonth, month),
      recorded: recordedIds.has(item.id),
    }))
    // 등록 전에 지난 결제일을 미기록으로 잡지 않는다. 그래도 사용자가 연결한 거래가 있으면 기록으로 센다.
    // 할부는 시작 달부터 확인하므로(dueIn) 지난 날짜로 뒤늦게 입력해도 등록일 전 회차를 확인한다
    .filter(
      row =>
        row.recorded ||
        row.item.installmentStart !== null ||
        row.date >= toLocalDate(new Date(row.item.createdAt)),
    );

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
