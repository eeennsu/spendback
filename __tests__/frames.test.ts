import { sampleFacts, sampleNames } from '../jest/facts';
import { SNAPSHOTS } from '../scripts/eval/snapshots';
import { checkSentence } from '../src/retro/check';
import { fakeGenerate } from '../src/retro/fake';
import { buildFrames, frameFormat, headlineFrames, nameKeys } from '../src/retro/frames';
import { buildFrameGrammar } from '../src/retro/grammar';
import { factValues, keyFacts } from '../src/retro/keys';
import { type Sentence, narrate } from '../src/retro/narrate';
import { buildMessages } from '../src/retro/prompt';
import { JOSA_PAIRS, render } from '../src/retro/render';

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

  test('v1 문법 안에서도 쓸 수 있다: 플레이스홀더 사이에 낱말, 다음 낱말은 단위 글자로 시작하지 않는다', () => {
    const josa = new RegExp(
      `\\{(?:${JOSA_PAIRS.map(p => p.replace('/', '\\/')).join('|')})\\}`,
      'g',
    );
    for (const snapshot of SNAPSHOTS) {
      for (const frame of buildFrames(keyedOf(snapshot))) {
        const text = frame.text.replace(josa, '');
        expect([
          frame.id,
          /\}(?:[가-힣]*)?\s*\{/.test(text.replace(/\}(?:의|도|만|에|에서)/g, '}')),
        ]).toEqual([frame.id, false]);
        expect([frame.id, /\}\s+[개건배번원일퍼회]/.test(text)]).toEqual([frame.id, false]);
      }
    }
  });

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

describe('v3 문장 틀', () => {
  const keyed = keyFacts(sampleFacts, sampleNames);
  const frames = buildFrames(keyed);

  test('문법은 headline·insight에 틀 id만, 제안에는 이름 키만 연다', () => {
    const grammar = buildFrameGrammar(
      ['total.change'],
      ['total.change', 'tag.2.amount_share'],
      nameKeys(keyed),
    );
    expect(grammar).toContain('headline ::= "\\"total.change\\""');
    expect(grammar).toContain('"category.3.name"');
    expect(grammar).not.toContain('"category.3.share"');
  });

  test('프롬프트는 채운 문장과 id를 보여 준다', () => {
    const [, user] = buildMessages(keyed, 'v3', frames, nameKeys(keyed));
    expect(user.content).toContain('category.3.change: 배달 지출이 지난주보다 29,000원 늘었어요.');
    expect(user.content).toContain('{category.3.name} = 배달');
  });

  test('같은 틀을 두 번 고르면 뒤의 것을 버린다', () => {
    const format = frameFormat(keyed, frames);
    const output = format.parse(
      JSON.stringify({
        headline: 'total.change',
        insights: ['total.change', 'category.3.amount_share', 'tag.2.amount_share'],
        suggestion: '다음 주에는 {category.3.name} 지출 전에 꼭 필요한지 생각해 보세요.',
      }),
    );
    expect(output?.insights.map(i => i.about)).toEqual(['category.3', 'tag.2']);
  });

  test('제안에 값 키를 쓰면 걸린다', () => {
    const format = frameFormat(keyed, frames);
    expect(
      format.check({ field: 'suggestion', text: '다음 주에는 {category.3.amount}만 써 보세요.' }),
    ).toEqual(['unknown-key']);
  });

  test('narrate가 id를 문장으로 펼쳐 내보낸다', async () => {
    const fake = fakeGenerate([
      JSON.stringify({
        headline: 'total.change',
        insights: ['category.3.change_share', 'tag.2.amount_share'],
        suggestion: '다음 주에는 {category.3.name} 지출 전에 꼭 필요한지 생각해 보세요.',
      }),
    ]);
    const sentences: string[] = [];
    const result = await narrate({
      facts: sampleFacts,
      names: sampleNames,
      generate: fake.generate,
      seed: 1,
      version: 'v3',
      onSentence: (s: Sentence) => sentences.push(s.rendered),
    });
    expect(result).toMatchObject({ status: 'done', attempts: 1 });
    expect(sentences).toEqual([
      '변동비가 지난주보다 32,400원 늘었어요.',
      '배달 지출이 지난주보다 29,000원 늘었어요. 변동비의 36%를 차지했어요.',
      '충동 태그가 붙은 지출은 54,000원으로 변동비의 29%였어요.',
      '다음 주에는 배달 지출 전에 꼭 필요한지 생각해 보세요.',
    ]);
    expect(fake.calls[0].grammar).toContain('frame ::=');
  });
});
