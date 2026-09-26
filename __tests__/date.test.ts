import { addDays, daysInMonth, toLocalDate, weekStart, weekday } from '../src/domain/date';

describe('toLocalDate', () => {
  test('UTC가 아니라 기기 로컬 시간의 날짜다', () => {
    expect(toLocalDate(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(toLocalDate(new Date(2026, 8, 25, 0, 1))).toBe('2026-09-25');
  });

  test('월과 일을 두 자리로 채운다', () => {
    expect(toLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  test('달과 해를 넘는다', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('윤년 2월 29일을 지난다', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('daysInMonth', () => {
  test.each([
    ['2026-02', 28],
    ['2028-02', 29],
    ['2026-09', 30],
    ['2026-12', 31],
  ])('%s는 %i일이다', (month, days) => {
    expect(daysInMonth(month)).toBe(days);
  });
});

describe('주는 월요일에 시작한다', () => {
  test('weekday는 월요일 0, 일요일 6이다', () => {
    expect(weekday('2026-09-28')).toBe(0);
    expect(weekday('2026-09-24')).toBe(3);
    expect(weekday('2026-09-27')).toBe(6);
  });

  test('일요일은 앞 월요일의 주다', () => {
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
  });

  test('월요일은 그 날이 주의 시작이다', () => {
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
  });

  test('두 달에 걸친 주는 앞 달의 월요일에서 시작한다', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
  });
});
