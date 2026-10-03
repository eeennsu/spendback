import { daysInMonth } from '../domain/date';

/**
 * 카드 알림 읽기(PRD 4.9). 금액·가맹점·날짜·승인/취소는 코드가 카드 앱마다 정한 형식으로 읽는다. LLM은 쓰지 않는다
 * (PRD 13장). 형식에 맞지 않는 알림은 버리지 않고 "읽지 못한 알림"으로 보여 준다. 카드사가 문구를 바꾸면 바로 드러난다.
 *
 * 카드사 형식은 사용자의 실제 알림 샘플을 받아 FORMATS에 더한다(PRD 11장). 지금은 adb로 흉내 내는 개발용 형식만 있다.
 */

/** 네이티브 서비스가 대기열에 적은 원문 */
export type RawNotification = { app: string; title: string; text: string; postedAt: number };
export type CardNotification =
  | { kind: 'approval' | 'cancel'; amount: number; merchant: string; date: string }
  | { kind: 'unreadable' };

/** 형식이 읽은 값. 연도는 알림에 없어 받은 시각으로 정한다 */
type Read = {
  kind: 'approval' | 'cancel';
  amount: string;
  merchant: string;
  month: string;
  day: string;
};
type Format = { name: string; read: (title: string, text: string) => Read | undefined };

/**
 * adb `cmd notification post`로 흉내 낸 알림(PRD 9장). 개발 빌드만 받는다(watchedApps).
 *   adb shell cmd notification post -t 테스트카드 card1 "승인 12,300원 10/03 14:22 스타벅스 역삼점"
 */
export const DEV_APP = 'com.android.shell';
const DEV_FORMAT = /^(승인|취소) ([\d,]+)원 (\d{1,2})\/(\d{1,2}) \d{1,2}:\d{2} (.+)$/;

/** 카드 앱(패키지명)마다 형식 */
const FORMATS: Record<string, Format> = {
  [DEV_APP]: {
    name: '테스트카드',
    read: (_title, text) => {
      const m = DEV_FORMAT.exec(text.trim());
      return m
        ? {
            kind: m[1] === '승인' ? 'approval' : 'cancel',
            amount: m[2],
            merchant: m[5],
            month: m[3],
            day: m[4],
          }
        : undefined;
    },
  },
};

/** 네이티브 서비스가 알림을 여는 앱. 나머지 앱의 알림은 내용을 읽지 않는다 */
export function watchedApps(dev: boolean) {
  return Object.keys(FORMATS).filter(app => dev || app !== DEV_APP);
}

/** 카드 앱의 이름. 모르는 앱이면 패키지명 */
export const cardAppName = (app: string) => FORMATS[app]?.name ?? app;

const pad = (n: number) => String(n).padStart(2, '0');

/** 알림의 월·일에 받은 시각의 연도를 붙인다. 받은 달보다 뒤의 달이면 지난해다(12월 31일 결제를 1월 1일에 받음) */
function dateOf(month: number, day: number, postedAt: number) {
  const posted = new Date(postedAt);
  const year = posted.getFullYear() - (month > posted.getMonth() + 1 ? 1 : 0);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(`${year}-${pad(month)}`))
    return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseCardNotification(raw: RawNotification): CardNotification {
  const read = FORMATS[raw.app]?.read(raw.title, raw.text);
  if (!read) return { kind: 'unreadable' };
  const amount = Number(read.amount.replace(/,/g, ''));
  const date = dateOf(Number(read.month), Number(read.day), raw.postedAt);
  const merchant = read.merchant.trim();
  if (!Number.isSafeInteger(amount) || amount <= 0 || !date || !merchant)
    return { kind: 'unreadable' };
  return { kind: read.kind, amount, merchant, date };
}
