import { addDays, weekday } from './date';

/**
 * 금액은 어디서나 `32,000원`, 비율은 정수 %다(PRD 4.6). 금액은 원 단위 정수로 받는다.
 * 원 단위로 내리는 것(PRD 4.3)은 계산하는 쪽의 일이다.
 */

// Intl 대신 직접 묶는다. Hermes의 Intl 지원과 Jest(Node)의 결과가 같다는 보장이 없다
function groupDigits(amount: number) {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatWon(amount: number) {
  return `${groupDigits(amount)}원`;
}

/** 사용액과 전체를 나란히 쓸 때는 단위를 끝에 한 번 붙인다(docs/DESIGN.md 3.4) */
export function formatWonFraction(part: number, whole: number) {
  return `${groupDigits(part)} / ${formatWon(whole)}`;
}

/**
 * part ÷ whole을 사사오입한 정수 %. 비율 대신 두 정수를 받아 `0.285 * 100 = 28.499…` 같은 부동소수 오차를 피한다.
 * 음수는 절댓값 기준으로 반올림한다(-17.5% → -18%). Math.round만 쓰면 -17이 된다.
 */
export function formatPercent(part: number, whole: number) {
  if (whole === 0) throw new RangeError('전체가 0이면 비율을 정할 수 없다');
  const percent = (part * 100) / whole;
  // -0은 템플릿 문자열에서 "0"이 된다
  return `${Math.sign(percent) * Math.round(Math.abs(percent))}%`;
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

/** 요일 이름. 월요일 0 … 일요일 6(date.ts weekday) */
export const formatWeekday = (index: number) => `${WEEKDAYS[index]}요일`;

/** 9월 24일 목요일 */
export function formatDate(date: string) {
  return `${monthDay(date)} ${formatWeekday(weekday(date))}`;
}

/** 주간은 9월 21일~27일(달을 넘으면 9월 28일~10월 4일), 월간은 9월 */
export function formatPeriod(kind: 'weekly' | 'monthly', start: string) {
  if (kind === 'monthly') return `${Number(start.slice(5, 7))}월`;
  const end = addDays(start, 6);
  return `${monthDay(start)}~${end.slice(5, 7) === start.slice(5, 7) ? `${Number(end.slice(8))}일` : monthDay(end)}`;
}
