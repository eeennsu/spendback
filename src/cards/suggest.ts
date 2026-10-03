import type { Generate } from '../retro/narrate';
import { type Known, normalizeMerchant } from './merchant';
import { type Category, categoryGrammar, categoryMessages, representatives } from './prompt';
import { MIN_SCORE, findSimilar } from './similar';

/**
 * 카드 알림의 카테고리 추천(PRD 4.9). 1단계는 코드(전에 적은 가맹점), 2단계는 검색 + LLM(처음 보는 가맹점),
 * 3단계는 사람(폼에서 확인)이다. 모델을 부르는 부분은 회고와 같은 Generate다: llama.rn(앱), node-llama-cpp(하네스),
 * 가짜(테스트).
 */

export type Suggestion = { categoryId: number; source: 'exact' | 'llm' };

/** 프롬프트에 넣을 검색 결과. 하네스가 조건을 비교한다(PRD 6장). 앱은 similar다 */
export type Context = 'none' | 'similar' | 'representatives';

/** 비슷한 가맹점을 몇 곳 넣을지 */
export const EXAMPLES = 5;

/** 1단계: 정규화한 이름이 전에 적은 가맹점과 같으면 그 가맹점의 가장 최근 카테고리. 숨긴 카테고리는 쓰지 않는다 */
export function exactMatch(merchant: string, known: Known[], categories: Category[]) {
  const name = normalizeMerchant(merchant);
  const visible = new Set(categories.map(c => c.id));
  return known.find(m => m.name === name && visible.has(m.categoryId))?.categoryId;
}

export async function suggestCategory({
  merchant,
  known,
  categories,
  generate,
  signal,
  context = 'similar',
  minScore = MIN_SCORE,
}: {
  merchant: string;
  /** 사용자가 전에 적은 가맹점(knownMerchants, 최근 것 먼저) */
  known: Known[];
  /** 보이는 지출 카테고리. 숨긴 카테고리는 추천하지 않는다 */
  categories: Category[];
  /** 없으면(모델이 없음) 처음 보는 가맹점은 추천하지 않는다 */
  generate?: Generate;
  signal?: AbortSignal;
  context?: Context;
  /** 예시로 넣을 최소 점수. 하네스가 비교한다 */
  minScore?: number;
}): Promise<Suggestion | undefined> {
  const exact = exactMatch(merchant, known, categories);
  if (exact !== undefined) return { categoryId: exact, source: 'exact' };
  if (!generate) return undefined;

  const visible = new Set(categories.map(c => c.id));
  const usable = known.filter(m => visible.has(m.categoryId));
  const name = normalizeMerchant(merchant);

  const messages = categoryMessages(name, categories, {
    similar: context === 'none' ? [] : findSimilar(name, usable, EXAMPLES, minScore),
    representatives:
      context === 'representatives' ? representatives(usable, categories) : undefined,
  });
  const raw = await generate(
    { messages, grammar: categoryGrammar(categories), seed: 0, temperature: 0 },
    () => {},
    signal ?? new AbortController().signal,
  );
  // Qwen3.5는 추론 모드를 꺼도 앞에 빈 think 블록을 붙인다(PRD 6장)
  const answer = raw.replace(/^\s*<think>[\s\S]*?<\/think>/, '').trim();
  const chosen = categories.find(c => c.name === answer);
  return chosen && { categoryId: chosen.id, source: 'llm' };
}
