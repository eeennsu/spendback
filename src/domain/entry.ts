import { addDays } from './date';
import { formatDate } from './format';

/**
 * 입력 폼과 목록이 쓰는 표시 규칙(docs/DESIGN.md 3.8, 4.3).
 */

/** 원 단위 금액 칸의 자릿수 상한. 999,999,999원 */
export const AMOUNT_DIGITS = 9;

const onlyDigits = (text: string) => text.replace(/\D/g, '').replace(/^0+/, '');

/** 금액 칸에 보이는 값(천 단위 쉼표) */
export const amountText = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 금액 칸이 바뀐 값을 숫자로 읽는다. 쉼표 바로 뒤에서 지우면 쉼표만 지워지고 서식이 다시 붙여 아무 일도 없던 것처럼
 * 보인다(에뮬레이터 확인, docs/DESIGN.md 1.6의 17번). 그때는 쉼표 앞 숫자를 지운다
 */
export function editAmount(previous: string, next: string) {
  const digits = onlyDigits(next);
  const shown = amountText(previous);
  if (digits === previous && next.length < shown.length) {
    let i = 0;
    while (i < next.length && next[i] === shown[i]) i++;
    const before = onlyDigits(shown.slice(0, i)).length;
    return onlyDigits(previous.slice(0, before - 1) + previous.slice(before));
  }
  return digits.slice(0, AMOUNT_DIGITS);
}

/** "오늘", "어제", 그 전은 "9월 22일"(올해가 아니면 "2025년 9월 22일") */
export function relativeDate(date: string, today: string) {
  if (date === today) return '오늘';
  if (date === addDays(today, -1)) return '어제';
  const day = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;
  return date.slice(0, 4) === today.slice(0, 4) ? day : `${date.slice(0, 4)}년 ${day}`;
}

type Dated = { date: string; type: 'expense' | 'income'; amount: number };

/** 내역의 날짜별 묶음(docs/DESIGN.md 4.4). 입력 순서(최근 날짜 먼저)를 지킨다 */
export function groupByDate<T extends Dated>(rows: T[]) {
  const sections: Array<{ date: string; expense: number; income: number; data: T[] }> = [];
  for (const row of rows) {
    let section = sections[sections.length - 1];
    if (section?.date !== row.date) {
      section = { date: row.date, expense: 0, income: 0, data: [] };
      sections.push(section);
    }
    section.data.push(row);
    if (row.type === 'expense') section.expense += row.amount;
    else section.income += row.amount;
  }
  return sections;
}

/** 날짜 묶음 머리("9월 24일 목요일 · 23,400원"). 수입만 있는 날은 "+"를 붙인다 */
export function sectionTitle(section: { date: string; expense: number; income: number }) {
  const amount =
    section.expense > 0
      ? amountText(String(section.expense))
      : `+${amountText(String(section.income))}`;
  return `${formatDate(section.date)} · ${amount}원`;
}
