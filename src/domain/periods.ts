import { addDays, daysInMonth, weekStart } from './date';

/** 회고 기간(PRD 4.6). 주간은 월~일, 월간은 달력 월이다 */
export type PeriodKind = 'weekly' | 'monthly';
export type PeriodRef = { kind: PeriodKind; start: string; end: string };

export function periodEnd(kind: PeriodKind, start: string) {
  if (kind === 'weekly') return addDays(start, 6);
  const month = start.slice(0, 7);
  return `${month}-${daysInMonth(month)}`;
}

/** 그 날이 든 기간 */
export function periodOf(kind: PeriodKind, date: string): PeriodRef {
  const start = kind === 'weekly' ? weekStart(date) : `${date.slice(0, 7)}-01`;
  return { kind, start, end: periodEnd(kind, start) };
}

/** 바로 앞 기간의 시작 */
export function previousStart(kind: PeriodKind, start: string) {
  return kind === 'weekly' ? addDays(start, -7) : `${addDays(start, -1).slice(0, 7)}-01`;
}

/** 첫 기록일이 든 기간부터 오늘이 든 기간까지, 최근 먼저. 기록이 없으면 빈 목록이다 */
export function periodsSince(kind: PeriodKind, firstDate: string | undefined, today: string) {
  if (!firstDate) return [];
  const first = periodOf(kind, firstDate).start;
  const periods: PeriodRef[] = [];
  for (
    let start = periodOf(kind, today).start;
    start >= first;
    start = previousStart(kind, start)
  ) {
    periods.push({ kind, start, end: periodEnd(kind, start) });
  }
  return periods;
}

/** 끝나지 않은 기간. 회고는 끝난 기간만 만든다(PRD 4.6) */
export const isOngoing = (period: PeriodRef, today: string) => today <= period.end;

const md = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;

/**
 * 회고 목록의 기간 이름(docs/DESIGN.md 4.4). 주는 목요일이 든 달의 몇째 주로 센다("9월 3주 · 9.14~9.20").
 * 올해가 아니면 연도를 붙인다
 */
export function periodLabel(period: PeriodRef, today: string) {
  const year = (date: string) =>
    date.slice(0, 4) === today.slice(0, 4) ? '' : `${date.slice(0, 4)}년 `;
  if (period.kind === 'monthly') {
    return `${year(period.start)}${Number(period.start.slice(5, 7))}월`;
  }
  const thursday = addDays(period.start, 3);
  const week = Math.ceil(Number(thursday.slice(8)) / 7);
  return `${year(thursday)}${Number(thursday.slice(5, 7))}월 ${week}주 · ${md(period.start)}~${md(period.end)}`;
}
