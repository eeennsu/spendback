import type { Facts } from '../domain/facts';
import { type Field, type Output, checkField, fieldsOf, parseOutput } from './check';
import { buildGrammar } from './grammar';
import { type KeyedFacts, type Names, factValues, keyFacts } from './keys';
import { type Message, buildMessages } from './prompt';
import { render } from './render';

/**
 * 회고 문장 생성(PRD 4.6, 6장). 모델을 부르는 부분(Generate)만 구현이 갈린다: llama.rn(앱), node-llama-cpp(하네스),
 * 가짜(테스트, fake.ts). 스트리밍 단위는 문장 필드이고, 필드가 완성될 때마다 사후 검사를 해 통과한 필드만 채워 내보낸다.
 * 걸리면 생성을 끊고 전체를 다시 만든다.
 */

export type GenerateRequest = { messages: Message[]; grammar: string; seed: number };
/** 토큰을 onToken으로 흘리고 전체 출력으로 끝난다. signal이 끊기면 그때까지의 출력으로 끝낸다 */
export type Generate = (
  request: GenerateRequest,
  onToken: (token: string) => void,
  signal: AbortSignal,
) => Promise<string>;

/** Generate 구현이 모델 문제를 알릴 때 던진다. 원인에 따라 폴백 안내가 다르다(PRD 4.6 표) */
export class NarratorError extends Error {
  constructor(readonly reason: 'no-model' | 'load-failed') {
    super(reason);
  }
}

export type Sentence = Field & { rendered: string };

export type NarrateResult =
  | { status: 'done'; keyed: KeyedFacts; output: Output; attempts: number }
  | { status: 'insufficient' }
  | { status: 'fallback'; reason: NarratorError['reason'] | 'check-failed' }
  | { status: 'cancelled' };

/** 기간 안의 변동비 지출이 이보다 적으면 LLM을 부르지 않는다 */
export const MIN_RECORDS = 3;
/** 첫 생성 + 재시도 2회 */
export const MAX_ATTEMPTS = 3;

/** 지금까지 받은 출력에서 완성된 필드. 문법이 문장에 따옴표를 막으므로 정규식으로 충분하다 */
export function completedFields(text: string): Field[] {
  const fields: Field[] = [];
  const headline = /"headline":\s*"([^"]*)"/.exec(text);
  if (headline) fields.push({ field: 'headline', text: headline[1] });
  let index = 0;
  for (const m of text.matchAll(/\{\s*"about":\s*"([^"]*)",\s*"text":\s*"([^"]*)"\s*\}/g)) {
    fields.push({ field: 'insight', index: index++, about: m[1], text: m[2] });
  }
  const suggestion = /"suggestion":\s*"([^"]*)"/.exec(text);
  if (suggestion) fields.push({ field: 'suggestion', text: suggestion[1] });
  return fields;
}

export async function narrate({
  facts,
  names,
  generate,
  signal,
  seed = Math.floor(Math.random() * 2 ** 31),
  onSentence,
  onRetry,
}: {
  facts: Facts;
  names: Names;
  generate: Generate;
  /** 사용자가 생성을 취소한다 */
  signal?: AbortSignal;
  /** 시도마다 1씩 더한다. "다시 만들기"가 같은 문장을 내지 않게 기본값은 무작위다 */
  seed?: number;
  /** 검사를 통과해 값을 채운 문장. 완성된 순서로 온다 */
  onSentence?: (sentence: Sentence) => void;
  /** 화면에 나간 문장을 지우고 "다시 쓰는 중"으로 바꾼다 */
  onRetry?: (attempt: number) => void;
}): Promise<NarrateResult> {
  if (facts.variableCount < MIN_RECORDS) return { status: 'insufficient' };

  const keyed = keyFacts(facts, names);
  const values = factValues(keyed);
  const request = { messages: buildMessages(keyed), grammar: buildGrammar(keyed) };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { status: 'cancelled' };
    if (attempt > 1) onRetry?.(attempt);

    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel);
    let text = '';
    let emitted = 0;
    let failed = false;
    try {
      const raw = await generate(
        { ...request, seed: seed + attempt - 1 },
        token => {
          if (failed) return;
          text += token;
          const fields = completedFields(text);
          for (const field of fields.slice(emitted)) {
            emitted += 1;
            if (checkField(keyed, field).length) {
              failed = true;
              controller.abort();
              return;
            }
            onSentence?.({ ...field, rendered: render(field.text, values) });
          }
        },
        controller.signal,
      );
      if (signal?.aborted) return { status: 'cancelled' };
      if (failed) continue;
      const output = parseOutput(raw);
      // 끊긴 출력, 스트림에서 못 본 필드(insight 개수 등)를 여기서 거른다
      if (output && fieldsOf(output).every(f => checkField(keyed, f).length === 0)) {
        return { status: 'done', keyed, output, attempts: attempt };
      }
    } catch (error) {
      if (signal?.aborted) return { status: 'cancelled' };
      if (error instanceof NarratorError) return { status: 'fallback', reason: error.reason };
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }
  return { status: 'fallback', reason: 'check-failed' };
}

/** 저장한 회고를 화면에 쓸 문장으로 채운다. 저장본은 facts 스냅샷으로 채우므로 이름이 바뀌어도 그대로다 */
export function renderOutput(keyed: KeyedFacts, output: Output) {
  const values = factValues(keyed);
  return {
    headline: render(output.headline, values),
    insights: output.insights.map(i => render(i.text, values)),
    suggestion: render(output.suggestion, values),
  };
}
