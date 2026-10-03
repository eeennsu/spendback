import { DEV_APP, parseCardNotification, watchedApps } from '../src/cards/parse';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 14, 30).getTime();
const dev = (text: string, postedAt = at(2026, 10, 3)) => ({
  app: DEV_APP,
  title: '테스트카드',
  text,
  postedAt,
});

describe('parseCardNotification', () => {
  test('승인 알림에서 종류, 금액, 가맹점, 날짜를 읽는다', () => {
    expect(parseCardNotification(dev('승인 12,300원 10/03 14:22 스타벅스 역삼점'))).toEqual({
      kind: 'approval',
      amount: 12300,
      merchant: '스타벅스 역삼점',
      date: '2026-10-03',
    });
  });

  test('취소 알림을 읽는다', () => {
    expect(parseCardNotification(dev('취소 4,500원 10/02 09:10 GS25 역삼점'))).toMatchObject({
      kind: 'cancel',
      amount: 4500,
      date: '2026-10-02',
    });
  });

  test('받은 달보다 뒤의 달이면 지난해다', () => {
    const parsed = parseCardNotification(dev('승인 9,000원 12/31 23:50 편의점', at(2027, 1, 1)));
    expect(parsed).toMatchObject({ date: '2026-12-31' });
  });

  test('형식에 맞지 않으면 읽지 못한 알림이다', () => {
    expect(parseCardNotification(dev('이번 달 결제 예정 금액을 확인하세요'))).toEqual({
      kind: 'unreadable',
    });
  });

  test('없는 날짜와 0원은 읽지 못한 알림이다', () => {
    expect(parseCardNotification(dev('승인 9,000원 02/30 12:00 편의점'))).toEqual({
      kind: 'unreadable',
    });
    expect(parseCardNotification(dev('승인 0원 10/03 12:00 편의점'))).toEqual({
      kind: 'unreadable',
    });
  });

  test('형식을 모르는 앱의 알림은 읽지 못한 알림이다', () => {
    expect(
      parseCardNotification({ ...dev('승인 12,300원 10/03 14:22 스타벅스'), app: 'com.example' }),
    ).toEqual({
      kind: 'unreadable',
    });
  });
});

describe('watchedApps', () => {
  test('개발 빌드만 adb로 흉내 낸 알림(com.android.shell)을 받는다', () => {
    expect(watchedApps(true)).toContain(DEV_APP);
    expect(watchedApps(false)).not.toContain(DEV_APP);
  });
});
