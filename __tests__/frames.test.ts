import { sampleFacts, sampleNames } from '../jest/facts';
import { SNAPSHOTS } from '../scripts/eval/snapshots';
import { checkSentence } from '../src/retro/check';
import {
  type Frame,
  buildFrames,
  frameFormat,
  headlineFrames,
  insightFrames,
  pickFrames,
} from '../src/retro/frames';
import { type FactGroup, type KeyedFacts, factValues, keyFacts } from '../src/retro/keys';
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

  test('총예산을 넘으면 "전체 예산을 …넘었어요"로 쓴다', () => {
    const over = SNAPSHOTS.find(s => s.id === 'week-over');
    if (!over) throw new Error('week-over');
    const keyed = keyedOf(over);
    const values = factValues(keyed);
    const texts = buildFrames(keyed)
      .filter(f => f.group === 'budget')
      .map(f => render(f.text, values));
    expect(texts).toEqual([
      '전체 예산을 33,600원 넘었어요.',
      '전체 예산의 112%를 써서 33,600원 넘었어요.',
    ]);
  });

  test('headline 후보는 채운 뒤 30자 안의 한 문장이고, 눈에 띄는 앞 묶음 셋에서만 고른다', () => {
    const keyed = keyFacts(sampleFacts, sampleNames);
    const values = factValues(keyed);
    const ids = headlineFrames(keyed, buildFrames(keyed), t => render(t, values)).map(f => f.id);
    expect(ids).toContain('total.change');
    expect(ids).not.toContain('category.3.change_share');
    expect([...new Set(ids.map(id => id.split('.').slice(0, -1).join('.')))]).toEqual([
      'category.3',
      'category.7',
      'total',
    ]);
  });

  test.each([
    ['week-base', 'budget.balance', '전체 예산이 92,700원 남았어요.'],
    ['week-base', 'no_spend.days', '지출이 없는 날이 하루 있었어요.'],
    ['week-no-spend', 'no_spend.days', '지출이 없는 날이 5일 있었어요.'],
    ['week-base', 'busiest.day_amount', '9월 26일 토요일에 71,500원으로 가장 많이 썼어요.'],
    ['month-base', 'income.balance', '수입에서 1,236,000원 남았어요.'],
    ['month-base', 'income.rate', '수입 3,200,000원 중 61%를 썼어요.'],
    ['month-deficit', 'income.balance', '수입보다 214,000원 더 썼어요.'],
    ['month-deficit', 'income.rate', '지출이 수입 1,750,000원의 112%였어요.'],
  ])('%s %s: %s', (id, frameId, text) => {
    const snapshot = SNAPSHOTS.find(s => s.id === id);
    if (!snapshot) throw new Error(id);
    const keyed = keyedOf(snapshot);
    const frame = buildFrames(keyed).find(f => f.id === frameId);
    expect(render(frame?.text ?? '', factValues(keyed))).toBe(text);
  });

  test.each([
    ['week-over', 'budget'],
    ['week-category-over', 'category.3'],
    ['month-deficit', 'income'],
    ['month-no-income', 'budget'],
  ])('%s: 눈에 띄는 사실(%s)이 headline 후보의 맨 앞이다', (id, group) => {
    const snapshot = SNAPSHOTS.find(s => s.id === id);
    if (!snapshot) throw new Error(id);
    const keyed = keyedOf(snapshot);
    const values = factValues(keyed);
    const [first] = headlineFrames(keyed, buildFrames(keyed), t => render(t, values));
    expect(first.group).toBe(group);
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

describe('headline 후보의 초점', () => {
  const candidates = (id: string) => {
    const snapshot = SNAPSHOTS.find(s => s.id === id);
    if (!snapshot) throw new Error(id);
    const keyed = keyedOf(snapshot);
    const values = factValues(keyed);
    return headlineFrames(keyed, buildFrames(keyed), t => render(t, values)).map(f => f.id);
  };

  test('카테고리 예산을 넘으면 그 카테고리는 예산 틀만 headline 후보다', () => {
    const ids = candidates('week-category-over');
    expect(ids).toContain('category.3.budget');
    expect(ids).not.toContain('category.3.change');
  });

  test('고정비가 큰 주는 고정비 틀이 headline 후보다', () => {
    expect(candidates('week-fixed-heavy')).toContain('total.fixed');
  });

  test('무지출일이 많은 주는 무지출일이 headline 후보다', () => {
    expect(candidates('week-no-spend')).toContain('no_spend.days');
  });
});

describe('insightFrames', () => {
  const frame = (id: string): Frame => ({
    id,
    group: id.split('.').slice(0, -1).join('.'),
    text: '',
  });

  test('총지출 묶음은 insight 후보에서 뺀다', () => {
    const keyed = keyFacts(sampleFacts, sampleNames);
    const frames = buildFrames(keyed);
    expect(frames.some(f => f.group === 'total')).toBe(true);
    expect(insightFrames(frames).some(f => f.group === 'total')).toBe(false);
  });

  test('총지출을 뺀 묶음이 셋보다 적으면 그대로 둔다', () => {
    const few = ['total.change', 'category.1.change', 'largest.memo'].map(frame);
    expect(insightFrames(few)).toEqual(few);
    const enough = [...few, frame('no_spend.days')];
    expect(insightFrames(enough).map(f => f.id)).toEqual([
      'category.1.change',
      'largest.memo',
      'no_spend.days',
    ]);
  });
});

describe('pickFrames(폴백)', () => {
  test.each(SNAPSHOTS.map(s => [s.id, s] as const))(
    '%s: headline 후보의 첫 틀과 다른 묶음의 틀 3개까지, 총지출은 insight에 없다',
    (_, snapshot) => {
      const keyed = keyedOf(snapshot);
      const values = factValues(keyed);
      const frames = buildFrames(keyed);
      const picked = pickFrames(keyed);
      const [first] = headlineFrames(keyed, frames, t => render(t, values));
      expect(picked?.headline).toBe(first.text);
      const abouts = picked?.insights.map(i => i.about) ?? [];
      expect(abouts.length).toBeGreaterThanOrEqual(2);
      expect(abouts.length).toBeLessThanOrEqual(3);
      expect(new Set(abouts).size).toBe(abouts.length);
      expect(abouts).not.toContain(first.group);
      expect(abouts).not.toContain('total');
      // 스냅샷마다 종류가 넉넉해 insight의 종류가 서로 다르고 headline과도 다르다. 후회와 태그는 한 종류다
      const kind = (id: string) => (id.startsWith('regret') ? 'tag' : id.split('.')[0]);
      const kinds = abouts.map(kind);
      expect(new Set(kinds).size).toBe(kinds.length);
      expect(kinds).not.toContain(kind(first.group));
    },
  );

  describe('종류가 같은 묶음', () => {
    const category = (id: number, name: string, change: string): FactGroup => ({
      id: `category.${id}`,
      title: '카테고리',
      facts: [
        { key: `category.${id}.name`, value: name, kind: 'noun', note: '' },
        { key: `category.${id}.change_phrase`, value: change, kind: 'predicate', note: '' },
      ],
      focus: ['change_phrase'],
    });
    const regret: FactGroup = {
      id: 'regret',
      title: '후회한 지출',
      facts: [
        { key: 'regret.amount', value: '47,000원', kind: 'noun', note: '' },
        { key: 'regret.share', value: '25%', kind: 'noun', note: '' },
      ],
    };
    const noSpend: FactGroup = {
      id: 'no_spend',
      title: '무지출일',
      facts: [{ key: 'no_spend.days', value: '하루', kind: 'noun', note: '' }],
    };
    const keyed = (groups: FactGroup[]): KeyedFacts => ({
      kind: 'weekly',
      period: '9월 3주',
      groups,
    });
    const categories = [
      category(1, '식비', '5,000원 늘었어요'),
      category(2, '배달', '4,000원 늘었어요'),
      category(3, '쇼핑', '3,000원 늘었어요'),
      category(4, '생활', '2,000원 늘었어요'),
    ];

    test('다른 종류를 먼저 고른 뒤에 채우고, 눈에 띄는 순서로 보인다', () => {
      const picked = pickFrames(keyed([...categories, regret, noSpend]));
      expect(picked?.headline).toContain('{category.1.change_phrase}');
      expect(picked?.insights.map(i => i.about)).toEqual(['category.2', 'regret', 'no_spend']);
    });

    test('후회한 지출과 이유 태그는 문장 모양이 같아 한 종류로 본다', () => {
      const tag: FactGroup = {
        id: 'tag.1',
        title: '이유 태그',
        facts: [
          { key: 'tag.1.name', value: '충동', kind: 'noun', note: '' },
          { key: 'tag.1.amount', value: '54,000원', kind: 'noun', note: '' },
          { key: 'tag.1.share', value: '29%', kind: 'noun', note: '' },
        ],
      };
      const largest: FactGroup = {
        id: 'largest',
        title: '가장 큰 지출 한 건',
        facts: [
          { key: 'largest.amount', value: '32,000원', kind: 'noun', note: '' },
          { key: 'largest.category', value: '배달', kind: 'noun', note: '' },
        ],
      };
      const picked = pickFrames(keyed([categories[0], regret, tag, noSpend, largest]));
      expect(picked?.insights.map(i => i.about)).toEqual(['regret', 'no_spend', 'largest']);
    });

    test('다른 종류가 모자라면 같은 종류로 채운다', () => {
      expect(pickFrames(keyed(categories))?.insights.map(i => i.about)).toEqual([
        'category.2',
        'category.3',
        'category.4',
      ]);
    });
  });

  test('insight는 눈에 띄는 순서이고, 묶음의 까닭을 쓴 틀을 고른다', () => {
    const snapshot = SNAPSHOTS.find(s => s.id === 'week-category-over');
    if (!snapshot) throw new Error('week-category-over');
    const keyed = keyedOf(snapshot);
    const picked = pickFrames(keyed);
    const order = keyed.groups.map(g => g.id);
    const abouts = picked?.insights.map(i => i.about) ?? [];
    expect([...abouts].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(abouts);
    // 카테고리 예산을 넘은 주는 그 카테고리의 예산 틀이 headline이다
    expect(picked?.headline).toContain('{category.3.budget_balance_phrase}');
  });

  test('제안은 없다', () => {
    expect(pickFrames(keyFacts(sampleFacts, sampleNames))).not.toHaveProperty('suggestion');
  });
});

test('제안이 채운 뒤 45자를 넘으면 걸린다', () => {
  const keyed = keyFacts(sampleFacts, sampleNames);
  const format = frameFormat(keyed, buildFrames(keyed));
  expect(
    format.check({
      field: 'suggestion',
      text: '다음 주에는 {category.3.name} 지출을 줄이면서 편의점 커피도 줄이고 다른 습관을 만들어 꾸준히 이어 가 보세요.',
    }),
  ).toEqual(['too-long']);
  expect(
    format.check({
      field: 'suggestion',
      text: '다음 주에는 {category.3.name} 지출을 줄여 보세요.',
    }),
  ).toEqual([]);
});
