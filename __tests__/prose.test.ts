import { keepWords } from '../src/ui/prose';

/** 낱말 안 글자 사이에만 WORD JOINER가 들어간다(docs/DESIGN.md 3.4) */
const WJ = '⁠';
const show = (text: string) => text.split(WJ).join('+');

test('낱말 안의 글자 사이에만 넣고 공백 양옆에는 넣지 않는다', () => {
  expect(show(keepWords('생각해 보세요.'))).toBe('생+각+해 보+세+요+.');
  expect(show(keepWords('39,200원 늘었어요'))).toBe('3+9+,+2+0+0+원 늘+었+어+요');
});

test('빈 문자열과 공백만 있는 문자열은 그대로다', () => {
  expect(keepWords('')).toBe('');
  expect(keepWords(' · ')).toBe(' · ');
});

test('앞 조각에 공백 없이 이어지면 첫 글자 앞에도 넣는다', () => {
  // "{category.3.name}{이/가}" → "배달" + "이 …"
  expect(show(keepWords('이 늘었어요', true))).toBe('+이 늘+었+어+요');
  expect(show(keepWords(' 지출이', true))).toBe(' 지+출+이');
});

test('글자를 빼거나 바꾸지 않는다', () => {
  const text = '다음 주에는 배달 지출 전에 꼭 필요한지 생각해 보세요.';
  expect(keepWords(text).split(WJ).join('')).toBe(text);
});
