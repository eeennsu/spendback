import type { FollowTarget } from '../domain/follow';
import type { Output } from './check';
import { type KeyedFacts, factValues } from './keys';

/** 제안에 쓸 수 있는 이름 키(frames.ts nameKeys)와 같다 */
const NAME_KEY = /\{(category\.(\d+)\.name|tag\.(\d+)\.name|memo\.\d+\.text|largest\.memo)\}/;

/**
 * 지난달 회고의 제안이 가리키는 대상(PRD 4.6 지난달 제안 따라가기). 제안의 첫 이름 키다. 메모 키는 지난달 스냅샷의
 * 메모 글자로 바꾼다. 지난달 회고가 없거나 제안에 이름 키가 없으면 없다
 */
export function followTarget(
  previous: { facts: KeyedFacts; output: Pick<Output, 'suggestion'> } | undefined,
): FollowTarget | undefined {
  const match = previous && NAME_KEY.exec(previous.output.suggestion);
  if (!match) return undefined;
  const [, key, category, tag] = match;
  if (category) return { kind: 'category', id: Number(category) };
  if (tag) return { kind: 'tag', id: Number(tag) };
  const memo = factValues(previous.facts)[key];
  return memo ? { kind: 'memo', memo } : undefined;
}
