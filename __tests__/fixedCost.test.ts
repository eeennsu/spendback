import { fixedCostChecklist, paymentDate } from '../src/domain/fixedCost';
import type { FixedCost, Transaction } from '../src/domain/types';

type Item = Pick<FixedCost, 'id' | 'name' | 'dayOfMonth' | 'hidden' | 'createdAt'>;

/** 등록일은 기기 로컬 시간이다 */
const registered = (month: number, day: number) => new Date(2026, month - 1, day, 15).getTime();

let seq = 0;
function item(name: string, dayOfMonth: number, overrides: Partial<Item> = {}): Item {
  seq += 1;
  return { id: seq, name, dayOfMonth, hidden: false, createdAt: registered(1, 1), ...overrides };
}

function linked(to: Item, date: string): Pick<Transaction, 'date' | 'fixedCostId'> {
  return { fixedCostId: to.id, date };
}

const names = (items: Item[]) => items.map(i => i.name);

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
  const rent = item('월세', 25);
  const phone = item('휴대폰 요금', 21);
  const netflix = item('넷플릭스', 17);
  const music = item('음악 구독', 3);
  const items = [rent, phone, netflix, music];

  test('그 달에 연결된 거래가 있으면 기록한 것이다', () => {
    const list = fixedCostChecklist(
      items,
      [linked(rent, '2026-09-25'), linked(music, '2026-09-02'), linked(phone, '2026-08-21')],
      '2026-09',
      '2026-09-24',
    );
    expect(list.total).toBe(4);
    expect(list.recorded).toBe(2);
  });

  test('결제일이 오늘이거나 지났는데 기록하지 않은 항목을 오래 밀린 것부터 준다', () => {
    const list = fixedCostChecklist(items, [], '2026-09', '2026-09-21');
    expect(names(list.overdue)).toEqual(['음악 구독', '넷플릭스', '휴대폰 요금']);
  });

  test('숨긴 항목은 확인하지 않는다', () => {
    const gym = item('헬스장', 1, { hidden: true });
    const list = fixedCostChecklist([...items, gym], [], '2026-09', '2026-09-24');
    expect(list.total).toBe(4);
    expect(names(list.overdue)).not.toContain('헬스장');
  });

  describe('등록한 날(당일 포함) 이후의 결제일부터 확인한다', () => {
    const before = item('등록 전 결제', 5, { createdAt: registered(9, 10) });
    const sameDay = item('등록일 결제', 10, { createdAt: registered(9, 10) });
    const late = [before, sameDay];

    test('등록한 달에 이미 지난 결제일은 확인하지 않는다', () => {
      const list = fixedCostChecklist(late, [], '2026-09', '2026-09-24');
      expect(list.total).toBe(1);
      expect(names(list.overdue)).toEqual(['등록일 결제']);
    });

    test('다음 달부터는 확인한다', () => {
      expect(fixedCostChecklist(late, [], '2026-10', '2026-10-24').total).toBe(2);
    });

    test('등록 전 결제일이라도 연결한 거래가 있으면 기록으로 센다', () => {
      const list = fixedCostChecklist(
        late,
        [linked(before, '2026-09-05')],
        '2026-09',
        '2026-09-24',
      );
      expect(list).toMatchObject({ total: 2, recorded: 1 });
    });
  });

  test('끝난 달은 기록하지 않은 항목이 모두 밀린 것이다(월간 회고 전 확인)', () => {
    const list = fixedCostChecklist(items, [linked(rent, '2026-08-25')], '2026-08', '2026-09-24');
    expect(names(list.overdue)).toEqual(['음악 구독', '넷플릭스', '휴대폰 요금']);
  });
});
