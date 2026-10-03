import { knownMerchants } from '../src/cards/merchant';
import { categoryGrammar, categoryMessages, representatives } from '../src/cards/prompt';
import { suggestCategory } from '../src/cards/suggest';
import { fakeGenerate } from '../src/retro/fake';

const CATEGORIES = [
  { id: 1, name: '식비' },
  { id: 2, name: '카페·간식' },
  { id: 3, name: '배달' },
  { id: 6, name: '생활' },
];

const KNOWN = knownMerchants([
  { merchant: 'BBQ치킨', categoryId: 3 },
  { merchant: 'GS25 역삼점', categoryId: 2 },
  { merchant: 'CU 역삼점', categoryId: 2 },
  { merchant: 'GS25 역삼점', categoryId: 2 },
  { merchant: '다이소 역삼점', categoryId: 6 },
  { merchant: '김밥천국', categoryId: 1 },
]);

describe('categoryGrammar', () => {
  test('보이는 카테고리 이름 하나만 쓸 수 있다', () => {
    expect(categoryGrammar(CATEGORIES)).toBe('root ::= "식비" | "카페·간식" | "배달" | "생활"');
  });

  test('이름 안의 따옴표와 숫자는 글자 그대로다', () => {
    expect(categoryGrammar([{ id: 9, name: '2차 "회식"' }])).toBe('root ::= "2차 \\"회식\\""');
  });
});

describe('categoryMessages', () => {
  test('카테고리 목록과 비슷한 가맹점의 카테고리를 예시로 쓴다', () => {
    const [system, user] = categoryMessages('교촌치킨 역삼점', CATEGORIES, {
      similar: [{ name: 'BBQ치킨', categoryId: 3, count: 1, score: 0.3 }],
    });
    expect(system.role).toBe('system');
    expect(user.content).toContain('카테고리: 식비, 카페·간식, 배달, 생활');
    expect(user.content).toContain('- BBQ치킨 → 배달');
    expect(user.content).toMatch(/가맹점: 교촌치킨 역삼점$/);
  });

  test('예시가 없으면 예시 절을 쓰지 않는다', () => {
    const [, user] = categoryMessages('교촌치킨', CATEGORIES, { similar: [] });
    expect(user.content).not.toContain('→');
  });

  test('카테고리별 대표 가맹점을 주면 함께 쓴다', () => {
    const [, user] = categoryMessages('세븐일레븐', CATEGORIES, {
      similar: [],
      representatives: representatives(KNOWN, CATEGORIES),
    });
    expect(user.content).toContain('- 카페·간식: GS25 역삼점, CU 역삼점');
    expect(user.content).toContain('- 배달: BBQ치킨');
  });
});

describe('representatives', () => {
  test('카테고리마다 거래가 많은 가맹점부터 정해진 수까지, 가맹점이 없는 카테고리는 뺀다', () => {
    expect(representatives(KNOWN, CATEGORIES, 1)).toEqual([
      { categoryId: 1, names: ['김밥천국'] },
      { categoryId: 2, names: ['GS25 역삼점'] },
      { categoryId: 3, names: ['BBQ치킨'] },
      { categoryId: 6, names: ['다이소 역삼점'] },
    ]);
  });
});

describe('suggestCategory', () => {
  test('전에 적은 가맹점이면 LLM을 부르지 않고 가장 최근 거래의 카테고리를 쓴다', async () => {
    const fake = fakeGenerate(['식비']);
    const suggestion = await suggestCategory({
      merchant: 'gs25  역삼점',
      known: KNOWN,
      categories: CATEGORIES,
      generate: fake.generate,
    });
    expect(suggestion).toEqual({ categoryId: 2, source: 'exact' });
    expect(fake.calls).toHaveLength(0);
  });

  test('처음 보는 가맹점은 LLM이 고른 이름을 id로 바꾼다', async () => {
    const fake = fakeGenerate(['배달']);
    const suggestion = await suggestCategory({
      merchant: '교촌치킨 역삼점',
      known: KNOWN,
      categories: CATEGORIES,
      generate: fake.generate,
    });
    expect(suggestion).toEqual({ categoryId: 3, source: 'llm' });
    expect(fake.calls[0].grammar).toBe(categoryGrammar(CATEGORIES));
    expect(fake.calls[0].messages[1].content).toContain('- BBQ치킨 → 배달');
  });

  test('분류라 온도 0으로 고른다', async () => {
    const fake = fakeGenerate(['배달']);
    await suggestCategory({
      merchant: '교촌치킨',
      known: KNOWN,
      categories: CATEGORIES,
      generate: fake.generate,
    });
    expect(fake.calls[0].temperature).toBe(0);
  });

  test('숨긴 카테고리는 정확 일치로 쓰지 않고 예시에도 넣지 않는다', async () => {
    const fake = fakeGenerate(['식비']);
    const visible = CATEGORIES.filter(c => c.id !== 3);
    const suggestion = await suggestCategory({
      merchant: 'BBQ치킨',
      known: KNOWN,
      categories: visible,
      generate: fake.generate,
    });
    expect(suggestion).toEqual({ categoryId: 1, source: 'llm' });
    expect(fake.calls[0].messages[1].content).not.toContain('→ 배달');
  });

  test('최소 점수를 주면 그 점수로 예시를 거른다(하네스 비교)', async () => {
    const one = knownMerchants([{ merchant: '교촌치킨 역삼점', categoryId: 3 }]);
    const run = async (minScore: number) => {
      const fake = fakeGenerate(['배달']);
      await suggestCategory({
        merchant: 'BHC치킨 선릉점',
        known: one,
        categories: CATEGORIES,
        generate: fake.generate,
        minScore,
      });
      return fake.calls[0].messages[1].content;
    };
    expect(await run(0)).toContain('- 교촌치킨 역삼점 → 배달');
    expect(await run(0.5)).not.toContain('→');
  });

  test('Qwen이 앞에 붙이는 빈 think 블록을 떼고 읽는다', async () => {
    const fake = fakeGenerate(['<think>\n\n</think>\n\n배달']);
    const suggestion = await suggestCategory({
      merchant: '교촌치킨',
      known: KNOWN,
      categories: CATEGORIES,
      generate: fake.generate,
    });
    expect(suggestion).toEqual({ categoryId: 3, source: 'llm' });
  });

  test('출력이 카테고리 이름이 아니면 추천하지 않는다', async () => {
    const fake = fakeGenerate(['배']);
    const suggestion = await suggestCategory({
      merchant: '교촌치킨',
      known: KNOWN,
      categories: CATEGORIES,
      generate: fake.generate,
    });
    expect(suggestion).toBeUndefined();
  });

  test('모델이 없으면 처음 보는 가맹점은 추천하지 않는다', async () => {
    const suggestion = await suggestCategory({
      merchant: '교촌치킨',
      known: KNOWN,
      categories: CATEGORIES,
    });
    expect(suggestion).toBeUndefined();
  });
});
