import type { Transaction } from './types';

/**
 * 지난달 회고의 제안이 가리키는 대상(PRD 4.6 지난달 제안 따라가기). 제안의 첫 이름 키에서 고른다(src/retro/follow.ts).
 * 메모는 완전 일치로 찾는다
 */
export type FollowTarget =
  { kind: 'category'; id: number } | { kind: 'tag'; id: number } | { kind: 'memo'; memo: string };

type Tx = Pick<Transaction, 'categoryId' | 'reasonTagId' | 'memo'>;

/** 대상에 드는 거래 */
export const followed = (target: FollowTarget) => (tx: Tx) =>
  target.kind === 'category'
    ? tx.categoryId === target.id
    : target.kind === 'tag'
      ? tx.reasonTagId === target.id
      : tx.memo === target.memo;
