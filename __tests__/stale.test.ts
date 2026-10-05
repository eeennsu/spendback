import { sampleFacts, sampleNames } from '../jest/facts';
import { keyFacts } from '../src/retro/keys';
import { isStale } from '../src/retro/stale';

/** 저장본의 facts 스냅샷과 지금 기록으로 만든 스냅샷을 견준다(PRD 4.6 생성 조건) */
const saved = keyFacts(sampleFacts, sampleNames);

test('지금 기록으로 만든 스냅샷이 같으면 낡지 않았다', () => {
  expect(isStale(saved, keyFacts(sampleFacts, sampleNames))).toBe(false);
});

test('저장본에 있는 값이 달라지면 낡았다', () => {
  // 회고를 만든 뒤 9월 배달 기록을 하나 더 저장했다
  const later = { ...sampleFacts, total: sampleFacts.total + 12000 };
  expect(isStale(saved, keyFacts(later, sampleNames))).toBe(true);
});

test('저장본에 있는 키가 지금 스냅샷에 없으면 낡았다', () => {
  // 후회로 고른 지출을 모두 고쳤다
  expect(isStale(saved, keyFacts({ ...sampleFacts, regret: 0 }, sampleNames))).toBe(true);
});

test('이름만 바꾸면 낡지 않았다. 저장본은 이름을 스냅샷으로 들고 있다', () => {
  const renamed = {
    ...sampleNames,
    categories: new Map([...sampleNames.categories, [3, '🛵 배달']]),
  };
  expect(isStale(saved, keyFacts(sampleFacts, renamed))).toBe(false);
});

test('지금 스냅샷에만 있는 키는 보지 않는다. 프롬프트 버전이 올라 생긴 키다', () => {
  const current = keyFacts(sampleFacts, sampleNames);
  const added = {
    ...current,
    groups: [
      ...current.groups,
      {
        id: 'follow',
        title: '지난달 제안',
        facts: [{ key: 'follow.amount', value: '1,000원', kind: 'noun' as const, note: '' }],
      },
    ],
  };
  expect(isStale(saved, added)).toBe(false);
});
