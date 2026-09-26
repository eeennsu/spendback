import {
  formatDate,
  formatPercent,
  formatPeriod,
  formatWon,
  formatWonFraction,
} from '../src/domain/format';

describe('formatWon', () => {
  test.each([
    [0, '0원'],
    [999, '999원'],
    [32000, '32,000원'],
    [1200000, '1,200,000원'],
  ])('%i → %s', (amount, text) => {
    expect(formatWon(amount)).toBe(text);
  });
});

describe('formatWonFraction', () => {
  test('사용액과 전체를 나란히 쓰면 단위는 끝에 한 번 붙인다', () => {
    expect(formatWonFraction(212300, 300000)).toBe('212,300 / 300,000원');
  });
});

describe('formatPercent', () => {
  test('정수 %로 쓴다', () => {
    expect(formatPercent(788400, 1200000)).toBe('66%');
    expect(formatPercent(1218000, 1200000)).toBe('102%');
    expect(formatPercent(24, 30)).toBe('80%');
  });

  test('0.5는 올린다(사사오입)', () => {
    expect(formatPercent(7, 40)).toBe('18%');
    expect(formatPercent(1, 1000)).toBe('0%');
  });

  test('음수는 절댓값 기준으로 반올림한다', () => {
    expect(formatPercent(-7, 40)).toBe('-18%');
    expect(formatPercent(-1, 1000)).toBe('0%');
  });

  test('전체가 0이면 비율을 정할 수 없다', () => {
    expect(() => formatPercent(1, 0)).toThrow(RangeError);
  });
});

describe('formatDate', () => {
  test('월 일 요일로 쓴다(내역 날짜 머리, 회고)', () => {
    expect(formatDate('2026-09-24')).toBe('9월 24일 목요일');
    expect(formatDate('2026-10-04')).toBe('10월 4일 일요일');
  });
});

describe('formatPeriod', () => {
  test('주간은 첫날과 끝날, 끝날이 같은 달이면 달을 한 번만 쓴다', () => {
    expect(formatPeriod('weekly', '2026-09-21')).toBe('9월 21일~27일');
    expect(formatPeriod('weekly', '2026-09-28')).toBe('9월 28일~10월 4일');
  });

  test('월간은 달이다', () => {
    expect(formatPeriod('monthly', '2026-09-01')).toBe('9월');
  });
});
