import { fixedCostChecklist, paymentDate } from '../src/domain/fixedCost';
import type { FixedCost, Transaction } from '../src/domain/types';

type Item = Pick<FixedCost, 'id' | 'dayOfMonth' | 'hidden' | 'createdAt'>;

/** 등록일은 기기 로컬 시간이다 */
const registered = (month: number, day: number) => new Date(2026, month - 1, day, 15).getTime();

function item(id: string, dayOfMonth: number, overrides: Partial<Item> = {}): Item {
  return { id, dayOfMonth, hidden: false, createdAt: registered(1, 1), ...overrides };
}

function linked(fixedCostId: string, date: string): Pick<Transaction, 'date' | 'fixedCostId'> {
  return { fixedCostId, date };
}

describe('paymentDate', () => {
  test('그 달에 없는 결제일은 말일로 본다', () => {
    expect(paymentDate(31, '2026-09')).toBe('2026-09-30');
    expect(paymentDate(30, '2026-02')).toBe('2026-02-28');
    expect(paymentDate(30, '2028-02')).toBe('2028-02-29');
  });

  test('있는 날은 그대로다', () => {
    expect(paymentDate(5, '2026-09')).toBe('2026-09-05');
  });
});

describe('fixedCostChecklist(PRD 4.4)', () => {
  const items = [item('rent', 25), item('phone', 21), item('netflix', 17), item('music', 3)];

  test('그 달에 연결된 거래가 있으면 기록한 것이다', () => {
    const list = fixedCostChecklist(
      items,
      [linked('rent', '2026-09-25'), linked('music', '2026-09-02'), linked('phone', '2026-08-21')],
      '2026-09',
      '2026-09-24',
    );
    expect(list.total).toBe(4);
    expect(list.recorded).toBe(2);
  });

  test('결제일이 오늘이거나 지났는데 기록하지 않은 항목을 오래 밀린 것부터 준다', () => {
    const list = fixedCostChecklist(items, [], '2026-09', '2026-09-21');
    expect(list.overdue.map(i => i.id)).toEqual(['music', 'netflix', 'phone']);
  });

  test('숨긴 항목은 확인하지 않는다', () => {
    const list = fixedCostChecklist(
      [...items, item('gym', 1, { hidden: true })],
      [],
      '2026-09',
      '2026-09-24',
    );
    expect(list.total).toBe(4);
    expect(list.overdue.map(i => i.id)).not.toContain('gym');
  });

  describe('등록한 날(당일 포함) 이후의 결제일부터 확인한다', () => {
    const late = [
      item('before', 5, { createdAt: registered(9, 10) }),
      item('sameDay', 10, { createdAt: registered(9, 10) }),
    ];

    test('등록한 달에 이미 지난 결제일은 확인하지 않는다', () => {
      const list = fixedCostChecklist(late, [], '2026-09', '2026-09-24');
      expect(list.total).toBe(1);
      expect(list.overdue.map(i => i.id)).toEqual(['sameDay']);
    });

    test('다음 달부터는 확인한다', () => {
      expect(fixedCostChecklist(late, [], '2026-10', '2026-10-24').total).toBe(2);
    });

    test('등록 전 결제일이라도 연결한 거래가 있으면 기록으로 센다', () => {
      const list = fixedCostChecklist(
        late,
        [linked('before', '2026-09-05')],
        '2026-09',
        '2026-09-24',
      );
      expect(list).toMatchObject({ total: 2, recorded: 1 });
    });
  });

  test('끝난 달은 기록하지 않은 항목이 모두 밀린 것이다(월간 회고 전 확인)', () => {
    const list = fixedCostChecklist(items, [linked('rent', '2026-08-25')], '2026-08', '2026-09-24');
    expect(list.overdue.map(i => i.id)).toEqual(['music', 'netflix', 'phone']);
  });
});
