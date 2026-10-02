import { create } from 'zustand';

import { addDays, daysInMonth } from '../domain/date';

/**
 * 내역 필터(PRD 4.5). 내역 화면과 필터 시트가 같이 쓰는 UI 상태라 저장소에 둔다. 앱을 다시 열면 이번 달로 돌아간다
 */
export type HistoryFilterState = {
  period: 'thisMonth' | 'lastMonth' | 'custom';
  /** period가 custom일 때의 범위(양 끝 포함) */
  from?: string;
  to?: string;
  type?: 'expense' | 'income';
  categoryIds: number[];
  reasonTagIds: number[];
};

export const EMPTY_FILTER: HistoryFilterState = {
  period: 'thisMonth',
  categoryIds: [],
  reasonTagIds: [],
};

export const useHistoryFilter = create<{
  filter: HistoryFilterState;
  apply: (filter: HistoryFilterState) => void;
  reset: () => void;
}>(set => ({
  filter: EMPTY_FILTER,
  apply: filter => set({ filter }),
  reset: () => set({ filter: EMPTY_FILTER }),
}));

const monthRange = (month: string) => ({
  from: `${month}-01`,
  to: `${month}-${daysInMonth(month)}`,
});

/** 필터의 날짜 범위 */
export function filterRange(filter: HistoryFilterState, today: string) {
  if (filter.period === 'custom' && filter.from && filter.to)
    return { from: filter.from, to: filter.to };
  const month = today.slice(0, 7);
  if (filter.period === 'lastMonth') return monthRange(addDays(`${month}-01`, -1).slice(0, 7));
  return monthRange(month);
}

/** 기간 이름. 달이면 "9월", 직접 고른 범위면 "9.1~9.15" */
export function rangeLabel(filter: HistoryFilterState, today: string) {
  const { from, to } = filterRange(filter, today);
  if (filter.period !== 'custom') return `${Number(from.slice(5, 7))}월`;
  const md = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;
  return `${md(from)}~${md(to)}`;
}

/** 기본(이번 달, 조건 없음)이 아닌가. 내역 위의 "초기화"를 보일지 정한다 */
export const isFiltered = (filter: HistoryFilterState) =>
  filter.period !== 'thisMonth' ||
  filter.type !== undefined ||
  filter.categoryIds.length > 0 ||
  filter.reasonTagIds.length > 0;
