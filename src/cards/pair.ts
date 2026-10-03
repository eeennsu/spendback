import { addDays } from '../domain/date';
import { normalizeMerchant } from './merchant';

/**
 * 결제 취소 알림과 승인 짝짓기(PRD 4.9). 정규화한 가맹점과 금액이 같아야 한다. 대기 중인 승인(같은 카드 앱)이 먼저이고,
 * 그다음 저장한 거래(취소일 전 PAIR_DAYS일 안)다. 둘 다 최근 것부터다. 짝이 없으면(부분 취소, 금액을 고친 거래,
 * 알림을 받기 전의 결제) undefined이고 사용자가 내역에서 고친다. 저장한 거래는 사용자의 확인을 받아 지운다.
 */

export type Pair = { kind: 'pending'; inboxId: number } | { kind: 'saved'; transactionId: number };

type Payment = { id: number; merchant: string; amount: number; date: string };

export const PAIR_DAYS = 90;

/** 날짜가 늦은 것, 같으면 id가 큰(나중에 받거나 쓴) 것 */
const latest = <T extends Payment>(list: T[]) =>
  list.reduce<T | undefined>(
    (best, p) =>
      !best || p.date > best.date || (p.date === best.date && p.id > best.id) ? p : best,
    undefined,
  );

/**
 * @param pending 대기 중인 승인 알림
 * @param saved 가맹점이 있는 저장한 지출
 * @param taken 다른 취소가 이미 짝지은 거래. 같은 가맹점·금액의 결제 둘을 각각 취소하면 서로 다른 거래와 짝짓는다
 */
export function pairCancel(
  cancel: { app: string; merchant: string; amount: number; date: string },
  pending: Array<Payment & { app: string }>,
  saved: Payment[],
  taken: Set<number> = new Set(),
): Pair | undefined {
  const name = normalizeMerchant(cancel.merchant);
  const same = (p: Payment) =>
    p.amount === cancel.amount && p.date <= cancel.date && normalizeMerchant(p.merchant) === name;

  const approval = latest(pending.filter(p => p.app === cancel.app && same(p)));
  if (approval) return { kind: 'pending', inboxId: approval.id };

  const from = addDays(cancel.date, -PAIR_DAYS);
  const transaction = latest(saved.filter(p => same(p) && p.date >= from && !taken.has(p.id)));
  return transaction && { kind: 'saved', transactionId: transaction.id };
}
