import { autoCheck } from '../scripts/eval/checks';

const output = {
  headline: '{category.3.name} 지출이 {category.3.change_phrase}.',
  insights: [
    { about: 'category.3', text: '{category.3.name} 지출이 크게 늘었어요.' },
    { about: 'category.3', text: '{category.3.share}{을/를} 차지했어요.' },
  ],
  suggestion: '다음 주에는 꼭 줄여야 해요!',
};

test('길이·문장 수·금지어·같은 묶음 반복을 센다', () => {
  const result = autoCheck(output, {
    headline: '배달 지출이 29,000원 늘었어요. 식비는 그대로였어요.',
    insights: ['배달 지출이 크게 늘었어요.', '36%를 차지했어요.'],
    suggestion:
      '다음 주에는 꼭 줄여야 해요! 배달 앱을 지우고 한 주 동안 직접 요리해 보는 건 어때요.',
  });
  expect(result.tooLong).toEqual([
    '배달 지출이 29,000원 늘었어요. 식비는 그대로였어요.',
    '다음 주에는 꼭 줄여야 해요! 배달 앱을 지우고 한 주 동안 직접 요리해 보는 건 어때요.',
  ]);
  expect(result.tooManySentences).toHaveLength(2);
  expect(result.banned).toEqual(['!', '야 해요']);
  expect(result.repeatedGroups).toBe(1);
});
