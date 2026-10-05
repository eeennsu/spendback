import { type KeyedFacts, factValues } from './keys';

/**
 * 카테고리·이유 태그 이름이 든 키(가장 큰 지출의 카테고리 포함). 저장본은 이름을 스냅샷으로 들고 있어 이름을 바꿔도
 * 문장이 그대로다
 */
const NAME = /\.name$|^largest\.category$/;

/**
 * 저장한 회고가 낡았는가(PRD 4.6 생성 조건). 저장본 스냅샷의 값 키 중 지금 기록으로 만든 스냅샷에 없거나 값이 다른
 * 것이 있으면 회고를 만든 뒤 기록이 바뀐 것이다. 지금 스냅샷에만 있는 키는 보지 않는다. 프롬프트 버전이 올라 새로
 * 생긴 키 때문에 옛 회고가 모두 낡은 것으로 보이지 않게 한다
 */
export function isStale(saved: KeyedFacts, current: KeyedFacts) {
  const now = factValues(current);
  return Object.entries(factValues(saved)).some(
    ([key, value]) => !NAME.test(key) && now[key] !== value,
  );
}
