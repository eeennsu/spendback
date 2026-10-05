import { type CodegenTypes, type TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * 앱 전용 Turbo Native Module(android/app/.../files). 모델 파일 내려받기(PRD 4.7)와 백업 파일 주고받기(PRD 4.8)를
 * 맡는다. 경로는 모두 앱 내부 저장소(files, cache) 안이다. 외부 저장소는 다른 주체가 만든 폴더를 앱이 읽지 못했다
 * (PRD 13장).
 */
export type DownloadProgress = {
  id: string;
  received: CodegenTypes.Double;
  total: CodegenTypes.Double;
};

export interface Spec extends TurboModule {
  /** 앱 내부 저장소(Context.filesDir) */
  getFilesDir(): string;
  /** 앱 캐시(Context.cacheDir). 공유할 백업 파일을 여기에 쓴다 */
  getCacheDir(): string;
  /** 앱 내부 저장소가 있는 볼륨의 남은 바이트 */
  getFreeBytes(): CodegenTypes.Double;
  /** 파일 크기. 없으면 -1 */
  fileSize(path: string): CodegenTypes.Double;
  deleteFile(path: string): boolean;
  /** from을 to로 옮긴다. to가 있으면 한 번에 바꾼다(rename). 옮기지 못하면 false */
  moveFile(from: string, to: string): boolean;
  /**
   * url을 path로 내려받는다. 받는 중에는 `${path}.part`에 쓰고, 그 파일이 있으면 Range로 이어받는다. 받으면서
   * SHA-256을 계산해 sha256과 같을 때만 path로 옮긴다. 실패하면 code가 no-space · hash-mismatch · unavailable(HTTP 오류) · network ·
   * cancelled인 오류로 거부한다(네트워크 오류에는 .part를 남겨 이어받는다)
   */
  download(
    id: string,
    url: string,
    path: string,
    sha256: string,
    size: CodegenTypes.Double,
  ): Promise<void>;
  cancelDownload(id: string): void;
  writeTextFile(path: string, content: string): Promise<void>;
  readTextFile(path: string): Promise<string>;
  /** Android 공유 시트로 파일을 보낸다(FileProvider) */
  shareFile(path: string, mimeType: string, title: string): Promise<void>;
  /** 문서 선택기로 고른 파일을 문자열로 읽는다. 취소하면 null */
  pickTextFile(): Promise<string | null>;
  readonly onDownloadProgress: CodegenTypes.EventEmitter<DownloadProgress>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SpendbackFiles');
