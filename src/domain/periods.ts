import { addDays, daysInMonth } from './date';

/**
 * 회고 기간(PRD 4.6). 달력 월 하나다. 주간 회고는 2026-10-05에 뺐다(PRD 13장). 연간 회고를 더하면 여기에 종류를
 * 더한다(PRD 3장 2단계)
 */
export type PeriodKind = 'monthly';
export type PeriodRef = { kind: PeriodKind; start: string; end: string };

export function periodEnd(_kind: PeriodKind, start: string) {
  const month = start.slice(0, 7);
  return `${month}-${daysInMonth(month)}`;
}

/** 그 날이 든 기간 */
export function periodOf(kind: PeriodKind, date: string): PeriodRef {
  const start = `${date.slice(0, 7)}-01`;
  return { kind, start, end: periodEnd(kind, start) };
}

/** 바로 앞 기간의 시작 */
export function previousStart(_kind: PeriodKind, start: string) {
  return `${addDays(start, -1).slice(0, 7)}-01`;
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

/** 회고 목록의 기간 이름(docs/DESIGN.md 4.4). 올해가 아니면 연도를 붙인다("2025년 12월") */
export function periodLabel(period: PeriodRef, today: string) {
  const year =
    period.start.slice(0, 4) === today.slice(0, 4) ? '' : `${period.start.slice(0, 4)}년 `;
  return `${year}${Number(period.start.slice(5, 7))}월`;
}
