import {
  amountText,
  editAmount,
  groupByDate,
  relativeDate,
  sectionTitle,
} from '../src/domain/entry';
import { isOngoing, periodLabel, periodOf, periodsSince } from '../src/domain/periods';

describe('editAmount', () => {
  test('숫자만 남기고 앞의 0을 뗀다', () => {
    expect(editAmount('', '09,500')).toBe('9500');
    expect(editAmount('9500', '9,5001')).toBe('95001');
  });

  test('쉼표 바로 뒤에서 지우면 그 앞 숫자를 지운다', () => {
    // "12,500"에서 쉼표를 지우면 "12500"이 오고 숫자는 그대로다
    expect(editAmount('12500', '12500')).toBe('1500');
    expect(editAmount('1234567', '1,234567')).toBe('123567');
  });

  test('끝에서 지우면 마지막 숫자가 지워진다', () => {
    expect(editAmount('12500', '12,50')).toBe('1250');
  });

  test('아홉 자리까지만 받는다', () => {
    expect(editAmount('999999999', '9,999,999,999')).toBe('999999999');
  });

  test('보이는 값은 천 단위 쉼표다', () => {
    expect(amountText('1234567')).toBe('1,234,567');
    expect(amountText('')).toBe('');
  });
});

describe('relativeDate', () => {
  test('오늘, 어제, 그 전', () => {
    expect(relativeDate('2026-10-02', '2026-10-02')).toBe('오늘');
    expect(relativeDate('2026-10-01', '2026-10-02')).toBe('어제');
    expect(relativeDate('2026-09-22', '2026-10-02')).toBe('9월 22일');
    expect(relativeDate('2025-12-31', '2026-01-02')).toBe('2025년 12월 31일');
  });
});

describe('groupByDate', () => {
  const tx = (date: string, amount: number, type: 'expense' | 'income' = 'expense') => ({
    date,
    amount,
    type,
  });

  test('날짜마다 묶고 지출·수입을 따로 더한다', () => {
    const sections = groupByDate([
      tx('2026-09-24', 9500),
      tx('2026-09-24', 13900),
      tx('2026-09-24', 30000, 'income'),
      tx('2026-09-23', 4500),
    ]);
    expect(sections.map(s => [s.date, s.expense, s.income, s.data.length])).toEqual([
      ['2026-09-24', 23400, 30000, 3],
      ['2026-09-23', 4500, 0, 1],
    ]);
    expect(sectionTitle(sections[0])).toBe('9월 24일 목요일 · 23,400원');
    expect(sectionTitle({ date: '2026-09-25', expense: 0, income: 3200000 })).toBe(
      '9월 25일 금요일 · +3,200,000원',
    );
  });
});

describe('periods', () => {
  test('그 날이 든 주(월~일)와 달', () => {
    expect(periodOf('weekly', '2026-09-24')).toEqual({
      kind: 'weekly',
      start: '2026-09-21',
      end: '2026-09-27',
    });
    expect(periodOf('monthly', '2026-02-14')).toEqual({
      kind: 'monthly',
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  test('첫 기록일부터 오늘까지 최근 먼저', () => {
    expect(periodsSince('weekly', '2026-09-10', '2026-09-24').map(p => p.start)).toEqual([
      '2026-09-21',
      '2026-09-14',
      '2026-09-07',
    ]);
    expect(periodsSince('monthly', '2026-08-31', '2026-10-02').map(p => p.start)).toEqual([
      '2026-10-01',
      '2026-09-01',
      '2026-08-01',
    ]);
    expect(periodsSince('weekly', undefined, '2026-09-24')).toEqual([]);
  });

  test('진행 중인 기간', () => {
    expect(isOngoing(periodOf('weekly', '2026-09-24'), '2026-09-27')).toBe(true);
    expect(isOngoing(periodOf('weekly', '2026-09-24'), '2026-09-28')).toBe(false);
  });

  test('기간 이름. 주는 목요일이 든 달의 몇째 주다', () => {
    expect(periodLabel(periodOf('weekly', '2026-09-24'), '2026-10-02')).toBe('9월 4주 · 9.21~9.27');
    // 8월 31일(월)~9월 6일(일)은 목요일이 9월 3일이라 9월 1주다
    expect(periodLabel(periodOf('weekly', '2026-09-01'), '2026-10-02')).toBe('9월 1주 · 8.31~9.6');
    expect(periodLabel(periodOf('monthly', '2026-09-24'), '2026-10-02')).toBe('9월');
    expect(periodLabel(periodOf('monthly', '2025-12-24'), '2026-01-02')).toBe('2025년 12월');
  });
});
