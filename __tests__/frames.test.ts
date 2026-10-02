import { sampleFacts, sampleNames } from '../jest/facts';
import { SNAPSHOTS } from '../scripts/eval/snapshots';
import { checkSentence } from '../src/retro/check';
import { buildFrames, frameFormat, headlineFrames } from '../src/retro/frames';
import { factValues, keyFacts } from '../src/retro/keys';
import { render } from '../src/retro/render';

const keyedOf = (s: (typeof SNAPSHOTS)[number]) => keyFacts(s.facts, s.names);

describe('buildFrames', () => {
  test.each(SNAPSHOTS.map(s => [s.id, s] as const))(
    '%s: 틀은 사후 검사를 통과하고 채운 뒤 insight 한도(60자, 두 문장) 안이다',
    (_, snapshot) => {
      const keyed = keyedOf(snapshot);
      const values = factValues(keyed);
      for (const frame of buildFrames(keyed)) {
        const keys = new Set(keyed.groups.find(g => g.id === frame.group)?.facts.map(f => f.key));
        expect([frame.id, checkSentence(frame.text, keys, true)]).toEqual([frame.id, []]);
        const text = render(frame.text, values);
        expect(text).not.toMatch(/\{/);
        expect(text.length).toBeLessThanOrEqual(60);
        expect((text.match(/[.?]/g) ?? []).length).toBeLessThanOrEqual(2);
      }
    },
  );

  test('증감이 0이면 "지난주와 같았어요"로 쓴다', () => {
    const same = SNAPSHOTS.find(s => s.id === 'week-same');
    if (!same) throw new Error('week-same');
    const keyed = keyedOf(same);
    const frame = buildFrames(keyed).find(f => f.id === 'total.change');
    expect(render(frame?.text ?? '', factValues(keyed))).toBe('변동비가 지난주와 같았어요.');
  });

  test('예산을 넘으면 "예산을 …넘었어요"로 쓴다', () => {
    const over = SNAPSHOTS.find(s => s.id === 'week-over');
    if (!over) throw new Error('week-over');
    const keyed = keyedOf(over);
    const values = factValues(keyed);
    const texts = buildFrames(keyed)
      .filter(f => f.group === 'budget')
      .map(f => render(f.text, values));
    expect(texts).toEqual(['예산을 33,600원 넘었어요.', '예산의 112%를 써서 33,600원 넘었어요.']);
  });

  test('headline 후보는 채운 뒤 30자 안의 한 문장이다', () => {
    const keyed = keyFacts(sampleFacts, sampleNames);
    const values = factValues(keyed);
    const ids = headlineFrames(buildFrames(keyed), t => render(t, values)).map(f => f.id);
    expect(ids).toContain('total.change');
    expect(ids).not.toContain('category.3.change_share');
  });
});

describe('frameFormat', () => {
  const keyed = keyFacts(sampleFacts, sampleNames);
  const format = frameFormat(keyed, buildFrames(keyed));
  const json = (headline: string, insights: string[]) =>
    JSON.stringify({ headline, insights, suggestion: '다음 주에는 꼭 확인해 보세요.' });

  test('headline이나 앞 insight와 같은 묶음의 틀은 버린다', () => {
    const abouts = (headline: string, insights: string[]) =>
      format.parse(json(headline, insights))?.insights.map(i => i.about);
    expect(
      abouts('total.change', ['total.change', 'category.3.amount_share', 'tag.2.amount_share']),
    ).toEqual(['category.3', 'tag.2']);
    expect(
      abouts('budget.balance', [
        'budget.usage_balance',
        'category.3.change',
        'category.3.amount_share',
        'tag.2.amount_share',
      ]),
    ).toEqual(['category.3', 'tag.2']);
    // 버리고 남은 insight가 2개보다 적으면 읽기 실패다
    expect(abouts('budget.balance', ['budget.usage_balance', 'category.3.change'])).toBeUndefined();
  });

  test('id를 플레이스홀더 문장으로 펼친다', () => {
    expect(format.parse(json('total.change', ['category.3.change', 'tag.2.amount_share']))).toEqual(
      {
        headline: '변동비가 지난주보다 {total.change_phrase}.',
        insights: [
          {
            about: 'category.3',
            text: '{category.3.name} 지출이 지난주보다 {category.3.change_phrase}.',
          },
          {
            about: 'tag.2',
            text: '{tag.2.name} 태그가 붙은 지출은 {tag.2.amount}{으로/로} 변동비의 {tag.2.share}{이었어요/였어요}.',
          },
        ],
        suggestion: '다음 주에는 꼭 확인해 보세요.',
      },
    );
  });

  test('Qwen의 빈 think 블록을 떼고 읽는다', () => {
    const raw = `<think>\n\n</think>\n\n${json('total.change', ['category.3.change', 'tag.2.amount_share'])}`;
    expect(format.parse(raw)?.headline).toBe('변동비가 지난주보다 {total.change_phrase}.');
  });

  test('모양이 틀리거나 끊긴 출력은 읽지 않는다', () => {
    const good = json('total.change', ['category.3.change', 'tag.2.amount_share']);
    expect(format.parse(good.slice(0, -5))).toBeUndefined();
    expect(format.parse('null')).toBeUndefined();
    expect(
      format.parse(
        JSON.stringify({ headline: 'total.change', insights: [1, 2], suggestion: '좋아요.' }),
      ),
    ).toBeUndefined();
  });

  test('모르는 틀 id는 빈 문장으로 펼치고 검사에서 걸린다', () => {
    const output = format.parse(json('total.change', ['category.3.change', 'tag.2.nope']));
    expect(output?.insights[1]).toEqual({ about: 'tag.2.nope', text: '' });
    expect(format.check({ field: 'insight', index: 1, about: 'tag.2.nope', text: '' })).toEqual([
      'unknown-key',
    ]);
  });

  test('제안에 값 키를 쓰면 걸린다', () => {
    expect(
      format.check({ field: 'suggestion', text: '다음 주에는 {category.3.amount}만 써 보세요.' }),
    ).toEqual(['unknown-key']);
  });
});
