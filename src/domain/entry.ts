import { addDays } from './date';
import { formatDate } from './format';

/**
 * 입력 폼과 목록이 쓰는 표시 규칙(docs/DESIGN.md 3.8, 4.3).
 */

/**
 * 이유·만족도를 몰아 고르는 첫 날(PRD 4.5). 편한가계부에서 옮긴 기록(2026-10-05까지)은 둘이 비어 있어, 사용자가 10월부터만
 * 고르기로 했다(2026-10-17)
 */
export const TAGGING_FROM = '2026-10-01';

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

/**
 * 카테고리별 합계(내역의 카테고리 보기, docs/DESIGN.md 4.4). 큰 것부터 limit개를 두고 나머지는 others로 묶는다.
 * 회고 도넛과 같이 상위 5개다. 금액이 같으면 카테고리 id 순서라 그릴 때마다 순서가 같다
 */
export function categoryShares<T extends { categoryId: number; amount: number }>(
  rows: T[],
  limit = 5,
) {
  const sums = new Map<number, number>();
  for (const row of rows) sums.set(row.categoryId, (sums.get(row.categoryId) ?? 0) + row.amount);
  const sorted = [...sums]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount || a.categoryId - b.categoryId);
  return { top: sorted.slice(0, limit), others: sorted.slice(limit) };
}

type Section = { date: string; expense: number; income: number };

/** 날짜 묶음의 합계("23,400원"). 수입만 있는 날은 "+"를 붙인다 */
export function sectionAmount(section: Section) {
  return section.expense > 0
    ? `${amountText(String(section.expense))}원`
    : `+${amountText(String(section.income))}원`;
}

/** 날짜 묶음 머리를 한 줄로 읽은 것("9월 24일 목요일 · 23,400원"). 화면은 날짜와 합계를 양 끝에 나눠 둔다 */
export function sectionTitle(section: Section) {
  return `${formatDate(section.date)} · ${sectionAmount(section)}`;
}

// 그림 문자: 기호·딩뱃(2600~27BF), 기술 기호(2300~23FF), 화살표·별(2B00~2BFF), 그림 문자 판(1F000~1FAFF)
const isPictograph = (cp: number) =>
  (cp >= 0x2300 && cp <= 0x23ff) ||
  (cp >= 0x2600 && cp <= 0x27bf) ||
  (cp >= 0x2b00 && cp <= 0x2bff) ||
  (cp >= 0x1f000 && cp <= 0x1faff);
// 앞 글자에 붙는 것: 이모지 표시(FE0F), 키캡(20E3), 피부색(1F3FB~1F3FF), 태그(E0020~E007F)
const isModifier = (cp: number) =>
  cp === 0xfe0f ||
  cp === 0x20e3 ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
  (cp >= 0xe0020 && cp <= 0xe007f);

/**
 * 이름 맨 앞의 이모지를 떼어 낸다("💰 개인 용돈" → 💰, "개인 용돈"). 내역 줄이 카테고리 이모지를 왼쪽 칸에 따로 세운다
 * (docs/DESIGN.md 4.4). ZWJ로 이은 이모지(👨‍👩‍👧)는 하나로 본다. 이모지뿐인 이름은 떼지 않는다.
 * Hermes의 정규식 유니코드 속성(p{...}) 지원을 믿지 않고 코드 포인트로 본다
 */
export function leadingEmoji(name: string): { emoji?: string; rest: string } {
  const chars = Array.from(name);
  const cp = (i: number) => chars[i]?.codePointAt(0) ?? 0;
  if (!isPictograph(cp(0))) return { rest: name };
  let end = 1;
  while (end < chars.length) {
    if (isModifier(cp(end))) end += 1;
    else if (cp(end) === 0x200d && isPictograph(cp(end + 1))) end += 2;
    else break;
  }
  const rest = chars.slice(end).join('').trim();
  return rest === '' ? { rest: name } : { emoji: chars.slice(0, end).join(''), rest };
}
