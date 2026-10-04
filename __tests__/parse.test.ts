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
    expect(parseCardNotification(dev('승인 거절 · 한도를 확인하세요'))).toEqual({
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

/** 신한 SOL페이 앱 푸시(2026-10-04 실제 알림). 이름, 카드번호, 누적금액은 바꿨다 */
const SHINHAN = 'com.shcard.smartpay';
const shinhan = (text: string, postedAt = at(2026, 10, 4)) => ({
  app: SHINHAN,
  title: '[신한카드]',
  text,
  postedAt,
});
const SHINHAN_APPROVAL = `[신한카드(1234)승인] 홍*동
- 승인금액: 8,400원(일시불)
- 승인일시: 10/04 13:45
- 가맹점명: 비바리퍼블리카
- 누적금액: 123,456원

[신한카드 1544-7000]`;

describe('신한카드', () => {
  test('승인 알림에서 금액, 가맹점, 날짜를 읽는다. 누적금액은 결제 금액이 아니다', () => {
    expect(parseCardNotification(shinhan(SHINHAN_APPROVAL))).toEqual({
      kind: 'approval',
      amount: 8400,
      merchant: '비바리퍼블리카',
      date: '2026-10-04',
    });
  });

  test('지켜보는 앱이다', () => {
    expect(watchedApps(false)).toContain(SHINHAN);
  });

  test('승인·취소 낱말이 있는데 형식에 맞지 않으면 읽지 못한 알림이다(아직 샘플이 없는 취소)', () => {
    const cancel = '[신한카드(1234)취소] 홍*동\n- 취소 형식은 아직 모른다';
    expect(parseCardNotification(shinhan(cancel))).toEqual({ kind: 'unreadable' });
  });
});

describe('결제가 아닌 알림', () => {
  test('(광고)로 시작하는 알림은 버린다', () => {
    const ad =
      '(광고)[신한카드]11번가에서 3,000원 캐시백 받으셔야죠~! (Feat. MySHOP) (※수신거부:설정> 알림 > 이벤트ㆍ혜택 알림 설정)';
    expect(parseCardNotification(shinhan(ad))).toEqual({ kind: 'ignored' });
  });

  test('승인·취소 낱말이 없는 알림은 버린다', () => {
    expect(parseCardNotification(shinhan('이번 달 명세서가 발송되었어요'))).toEqual({
      kind: 'ignored',
    });
    expect(parseCardNotification(dev('이번 달 결제 예정 금액을 확인하세요'))).toEqual({
      kind: 'ignored',
    });
  });
});
