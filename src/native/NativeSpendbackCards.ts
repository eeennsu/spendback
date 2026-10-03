import { type CodegenTypes, type TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * 카드 알림 받기(PRD 4.9). 앱 전용 Turbo Native Module(android/app/.../cards)이다. NotificationListenerService가
 * 지켜보는 앱(setWatchedApps)의 알림 원문을 앱 내부 저장소의 대기열 파일에 적기만 한다. 다른 앱의 알림은 내용을 읽지
 * 않는다. 읽기·짝짓기·추천은 JS(src/cards)가 한다.
 */
export type QueuedNotification = {
  /** 대기열 안에서만 쓰는 id. ackInbox로 지울 때 쓴다 */
  id: string;
  /** 카드 앱 패키지명 */
  app: string;
  title: string;
  text: string;
  /** 알림이 올라온 시각(epoch ms) */
  postedAt: CodegenTypes.Double;
};

/** 앱이 떠 있을 때 새 알림이 대기열에 들어왔다 */
export type QueuedSignal = { app: string };

export interface Spec extends TurboModule {
  /** 이 앱이 알림 접근을 허용받았는가 */
  isListenerEnabled(): boolean;
  /** 시스템의 알림 접근 화면을 연다. Android 11 이상은 이 앱의 토글로 바로 간다 */
  openListenerSettings(): void;
  /**
   * 알림을 여는 앱(src/cards/parse.ts watchedApps). 앱이 시작할 때 정한다. 서비스는 앱이 꺼져 있어도 이 목록을 쓴다.
   * 리스너가 끊겨 있으면 다시 잇기를 요청한다(삼성 절전, PRD 10장)
   */
  setWatchedApps(apps: string[]): void;
  /** 대기열의 원문. 받은 순서다 */
  readInbox(): Promise<QueuedNotification[]>;
  /** 대기열에서 지운다. DB에 넣은 뒤에 부른다 */
  ackInbox(ids: string[]): Promise<void>;
  readonly onQueued: CodegenTypes.EventEmitter<QueuedSignal>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SpendbackCards');
