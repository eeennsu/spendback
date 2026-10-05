import { failureOf } from '../src/native/files';

/**
 * 내려받기 실패 원인(PRD 4.7). 네이티브가 거부한 code로 고른다. 저장소가 사라졌거나(HTTP 404) 서버 오류면 연결을
 * 탓하지 않는다. 모르는 오류는 네트워크로 본다(다시 받으면 이어받는다)
 */
test.each([
  ['no-space', 'no-space'],
  ['hash-mismatch', 'hash-mismatch'],
  ['cancelled', 'cancelled'],
  ['unavailable', 'unavailable'],
  ['network', 'network'],
  ['io', 'network'],
])('%s → %s', (code, failure) => {
  expect(failureOf(Object.assign(new Error(code), { code }))).toBe(failure);
});
