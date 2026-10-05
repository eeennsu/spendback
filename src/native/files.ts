import type { Model } from '../retro/models';
import Files from './NativeSpendbackFiles';

/** 모델 파일 경로. 앱 내부 저장소의 models 폴더다(PRD 13장) */
export const modelPath = (model: Pick<Model, 'fileName'>) =>
  `${Files.getFilesDir()}/models/${model.fileName}`;

/** 다 받은 모델인가. 크기로 본다(해시는 받을 때 확인했다) */
export const hasModel = (model: Pick<Model, 'fileName' | 'sizeBytes'>) =>
  Files.fileSize(modelPath(model)) === model.sizeBytes;

/** 이어받을 수 있게 남은 부분 파일의 크기. 없으면 0 */
export const partialBytes = (model: Pick<Model, 'fileName'>) =>
  Math.max(0, Files.fileSize(`${modelPath(model)}.part`));

/** unavailable: 서버가 파일을 내주지 않는다(HTTP 404·5xx 등). 연결 문제가 아니다 */
export type DownloadFailure =
  'no-space' | 'hash-mismatch' | 'network' | 'cancelled' | 'unavailable';

const FAILURES: DownloadFailure[] = ['no-space', 'hash-mismatch', 'cancelled', 'unavailable'];

/** 내려받기 실패 원인. 모르는 오류는 네트워크로 본다(다시 받으면 이어받는다) */
export function failureOf(error: unknown): DownloadFailure {
  const code = (error as { code?: string } | null)?.code;
  return FAILURES.find(failure => failure === code) ?? 'network';
}

export { Files };
