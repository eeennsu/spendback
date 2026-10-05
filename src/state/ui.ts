import { create } from 'zustand';

import { addMonths, daysInMonth } from '../domain/date';

/**
 * 내역 필터(PRD 4.5). 내역 화면과 필터 시트가 같이 쓰는 UI 상태라 저장소에 둔다. 앱을 다시 열면 이번 달로 돌아간다
 */
export type HistoryFilterState = {
  /** month는 한 달(내역 위의 ‹ ›로 옮긴다), custom은 직접 고른 범위 */
  period: 'month' | 'custom';
  /** period가 month일 때 보는 달("2026-09"). 비면 이번 달이라 자정을 넘겨 달이 바뀌어도 따라간다 */
  month?: string;
  /** period가 custom일 때의 범위(양 끝 포함) */
  from?: string;
  to?: string;
  type?: 'expense' | 'income';
  categoryIds: number[];
  reasonTagIds: number[];
};

export const EMPTY_FILTER: HistoryFilterState = {
  period: 'month',
  categoryIds: [],
  reasonTagIds: [],
};

export const useHistoryFilter = create<{
  filter: HistoryFilterState;
  /** 내역을 날짜별 목록으로 볼지, 카테고리 몫(도넛과 표)으로 볼지. 필터와 달은 둘이 같이 쓴다 */
  view: 'list' | 'chart';
  setView: (view: 'list' | 'chart') => void;
  apply: (filter: HistoryFilterState) => void;
  /** 이번 달, 조건 없음, 목록 보기로 돌아간다 */
  reset: () => void;
  /** 조건과 직접 고른 기간만 지운다. 보던 달은 그대로다(내역의 "초기화") */
  clear: () => void;
  /** 한 달 보기로 그 달을 연다. 이번 달이면 비운다 */
  showMonth: (month: string, today: string) => void;
}>(set => ({
  filter: EMPTY_FILTER,
  view: 'list',
  setView: view => set({ view }),
  apply: filter => set({ filter }),
  reset: () => set({ filter: EMPTY_FILTER, view: 'list' }),
  clear: () => set(({ filter }) => ({ filter: { ...EMPTY_FILTER, month: filter.month } })),
  showMonth: (month, today) =>
    set(({ filter }) => ({
      filter: {
        ...filter,
        period: 'month',
        month: month === today.slice(0, 7) ? undefined : month,
        from: undefined,
        to: undefined,
      },
    })),
}));

/** 한 달 보기에서 보는 달 */
export const viewedMonth = (filter: HistoryFilterState, today: string) =>
  filter.month ?? today.slice(0, 7);

/** 필터의 날짜 범위 */
export function filterRange(filter: HistoryFilterState, today: string) {
  if (filter.period === 'custom' && filter.from && filter.to)
    return { from: filter.from, to: filter.to };
  const month = viewedMonth(filter, today);
  return { from: `${month}-01`, to: `${month}-${daysInMonth(month)}` };
}

/** 달 이름. 올해면 "9월", 아니면 "2025년 12월" */
export function monthLabel(month: string, today: string) {
  const name = `${Number(month.slice(5, 7))}월`;
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${month.slice(0, 4)}년 ${name}`;
}

/** 기간 이름. 달이면 "9월", 직접 고른 범위면 "9.1~9.15" */
export function rangeLabel(filter: HistoryFilterState, today: string) {
  if (filter.period !== 'custom') return monthLabel(viewedMonth(filter, today), today);
  const { from, to } = filterRange(filter, today);
  const md = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;
  return `${md(from)}~${md(to)}`;
}

/** 지난 달("지난 달 보기") */
export const previousMonth = (filter: HistoryFilterState, today: string) =>
  addMonths(viewedMonth(filter, today), -1);

/**
 * 조건이나 직접 고른 기간이 걸려 있는가. 내역 위의 조건 요약과 "초기화"를 보일지 정한다. 달을 옮기는 것은 ‹ ›가 맡아
 * 필터로 치지 않는다
 */
export const isFiltered = (filter: HistoryFilterState) =>
  filter.period === 'custom' ||
  filter.type !== undefined ||
  filter.categoryIds.length > 0 ||
  filter.reasonTagIds.length > 0;
