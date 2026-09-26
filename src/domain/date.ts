/**
 * 날짜는 기기 로컬 시간 기준 `YYYY-MM-DD`, 달은 `YYYY-MM` 문자열이다. 한 주는 월요일에 시작한다(PRD 7장).
 * 더하고 빼는 계산은 UTC 자정으로 옮겨서 한다. 로컬 Date로 하면 서머타임이 있는 시간대에서 하루가 23·25시간이 된다.
 */

const DAY_MS = 86_400_000;

function toUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** 기기 로컬 시간의 날짜. "오늘"은 `toLocalDate(new Date())`다 */
export function toLocalDate(at: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function addDays(date: string, days: number) {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysInMonth(month: string) {
  const [year, m] = month.split('-').map(Number);
  // 다음 달의 0일은 이번 달 말일이다
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** 월요일 0 … 일요일 6 */
export function weekday(date: string) {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

/** 그 날이 속한 주의 월요일 */
export function weekStart(date: string) {
  return addDays(date, -weekday(date));
}
