import { pairCancel } from '../src/cards/pair';

const cancel = { app: 'card.a', merchant: '스타벅스 역삼점', amount: 4500, date: '2026-10-03' };
const approval = (id: number, over: object = {}) => ({
  id,
  ...cancel,
  date: '2026-10-03',
  ...over,
});
const saved = (id: number, date: string, over: object = {}) => ({
  id,
  merchant: '스타벅스 역삼점',
  amount: 4500,
  date,
  ...over,
});

describe('pairCancel', () => {
  test('대기 중인 승인과 짝이 맞으면 저장한 거래보다 먼저 고른다', () => {
    expect(pairCancel(cancel, [approval(7)], [saved(1, '2026-10-03')])).toEqual({
      kind: 'pending',
      inboxId: 7,
    });
  });

  test('대기 중인 승인은 같은 카드 앱이어야 한다', () => {
    expect(pairCancel(cancel, [approval(7, { app: 'card.b' })], [])).toBeUndefined();
  });

  test('저장한 거래와 짝이 맞으면 최근 거래부터 고른다', () => {
    const pair = pairCancel(
      cancel,
      [],
      [saved(1, '2026-09-20'), saved(2, '2026-09-28'), saved(3, '2026-09-28')],
    );
    expect(pair).toEqual({ kind: 'saved', transactionId: 3 });
  });

  test('가맹점은 정규화해 비교한다', () => {
    expect(
      pairCancel(cancel, [], [saved(1, '2026-10-01', { merchant: '스타벅스  역삼점 ' })]),
    ).toEqual({
      kind: 'saved',
      transactionId: 1,
    });
  });

  test('금액이 다르면(부분 취소) 짝이 없다', () => {
    expect(
      pairCancel({ ...cancel, amount: 2000 }, [approval(7)], [saved(1, '2026-10-01')]),
    ).toBeUndefined();
  });

  test('취소일 전 90일 안의 거래만 짝짓는다', () => {
    // 2026-10-03의 90일 전은 2026-07-05다
    expect(pairCancel(cancel, [], [saved(1, '2026-07-05')])).toEqual({
      kind: 'saved',
      transactionId: 1,
    });
    expect(pairCancel(cancel, [], [saved(1, '2026-07-04')])).toBeUndefined();
    expect(pairCancel(cancel, [], [saved(1, '2026-10-04')])).toBeUndefined();
    expect(pairCancel(cancel, [approval(7, { date: '2026-10-04' })], [])).toBeUndefined();
  });

  test('다른 취소가 이미 짝지은 거래는 건너뛴다', () => {
    const pair = pairCancel(
      cancel,
      [],
      [saved(1, '2026-10-01'), saved(2, '2026-10-02')],
      new Set([2]),
    );
    expect(pair).toEqual({ kind: 'saved', transactionId: 1 });
  });
});
