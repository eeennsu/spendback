import { z } from 'zod';

import { type Field, type Output, type Problem, checkField, checkSentence } from './check';
import type { FactGroup, KeyedFacts } from './keys';

/**
 * 문장 틀(PRD 4.6). 회고의 사실 문장은 묶음마다 코드가 써 둔 이 틀이고, LLM은 id만 고른다. 값은 플레이스홀더와
 * 조사 쌍으로 두고 렌더러가 채운다. 증감 방향과 잔액은 서술어 값이 쓴다.
 *
 * 틀도 사후 검사(check.ts)를 통과해야 한다. 증감을 직접 쓰는 낱말이 없고, 그 묶음의 키만 쓴다.
 */
export type Frame = { id: string; group: string; text: string };

/** 같은 종류의 묶음(category.3, category.1 …)을 한 종류로 본다 */
const groupKind = (id: string) => id.split('.')[0];

function framesOf(g: FactGroup, kind: KeyedFacts['kind']): Frame[] {
  const before = kind === 'weekly' ? '지난주보다' : '지난달보다';
  const same = kind === 'weekly' ? '지난주와' : '지난달과';
  const period = kind === 'weekly' ? '이번 주' : '이번 달';
  const value = (name: string) => g.facts.find(f => f.key === `${g.id}.${name}`)?.value;
  const k = (name: string) => `{${g.id}.${name}}`;
  const frames: Frame[] = [];
  /** needs의 키가 모두 있을 때만 만든다. 데이터가 없는 사실은 틀도 없다(PRD 2장) */
  const add = (name: string, text: string, needs: string[]) => {
    if (needs.every(n => value(n) !== undefined))
      frames.push({ id: `${g.id}.${name}`, group: g.id, text });
  };
  /** 잔액 서술어("…남았어요", "…넘었어요", "다 썼어요")에 맞는 앞말 */
  const balanceLead = (phrase: string | undefined, under: string, over: string) =>
    phrase?.endsWith('남았어요') ? under : over;

  switch (groupKind(g.id)) {
    case 'total':
      add(
        'change',
        `변동비가 ${value('change_phrase') === '같았어요' ? same : before} ${k('change_phrase')}.`,
        ['change_phrase'],
      );
      add('rate', `변동비가 ${before} ${k('change_rate_phrase')}.`, ['change_rate_phrase']);
      add('split', `총지출 ${k('expense')} 중 고정비가 ${k('fixed')}{이었어요/였어요}.`, [
        'expense',
        'fixed',
      ]);
      if (value('change_phrase') === undefined) {
        add('variable', `${period} 변동비는 ${k('variable')}{이었어요/였어요}.`, ['variable']);
      }
      break;
    case 'budget': {
      const phrase = value('balance_phrase');
      add('balance', `${balanceLead(phrase, '예산에서', '예산을')} ${k('balance_phrase')}.`, [
        'balance_phrase',
      ]);
      if (phrase === '다 썼어요') add('usage', `예산의 ${k('usage')}{을/를} 썼어요.`, ['usage']);
      else {
        add('usage_balance', `예산의 ${k('usage')}{을/를} 써서 ${k('balance_phrase')}.`, [
          'usage',
          'balance_phrase',
        ]);
      }
      break;
    }
    case 'category': {
      if (value('amount') !== undefined) {
        add(
          'amount_share',
          `${k('name')}에 쓴 ${k('amount')}{이/가} 변동비의 ${k('share')}{을/를} 차지했어요.`,
          ['amount', 'share'],
        );
      }
      add('change', `${k('name')} 지출이 ${before} ${k('change_phrase')}.`, ['change_phrase']);
      add(
        'change_share',
        `${k('name')} 지출이 ${before} ${k('change_phrase')}. 변동비의 ${k('share')}{을/를} 차지했어요.`,
        ['change_phrase', 'share'],
      );
      const phrase = value('budget_balance_phrase');
      if (phrase === '다 썼어요') {
        add('budget', `${k('name')} 예산을 ${k('budget_balance_phrase')}.`, [
          'budget_balance_phrase',
        ]);
      } else {
        add(
          'budget',
          `${k('name')} 예산의 ${k('budget_usage')}{을/를} 써서 ${k('budget_balance_phrase')}.`,
          ['budget_usage', 'budget_balance_phrase'],
        );
      }
      break;
    }
    case 'tag':
      if (value('share') === undefined) {
        add('amount', `${k('name')} 태그가 붙은 지출은 ${k('amount')}{이었어요/였어요}.`, [
          'amount',
        ]);
      }
      add(
        'amount_share',
        `${k('name')} 태그가 붙은 지출은 ${k('amount')}{으로/로} 변동비의 ${k('share')}{이었어요/였어요}.`,
        ['amount', 'share'],
      );
      break;
    case 'regret':
      if (value('share') === undefined) {
        add('amount', `후회한 지출은 ${k('amount')}{이었어요/였어요}.`, ['amount']);
      }
      add(
        'amount_share',
        `후회한 지출은 ${k('amount')}{으로/로} 변동비의 ${k('share')}{이었어요/였어요}.`,
        ['amount', 'share'],
      );
      break;
    case 'largest':
      add('memo', `가장 큰 지출은 ${k('memo')}에 쓴 ${k('amount')}{이었어요/였어요}.`, [
        'memo',
        'amount',
      ]);
      add('category', `가장 큰 지출은 ${k('category')}에 쓴 ${k('amount')}{이었어요/였어요}.`, [
        'category',
        'amount',
      ]);
      break;
    case 'no_spend':
      add('days', `무지출일이 ${k('days')} 있었어요.`, ['days']);
      break;
    case 'busiest':
      add('day', `가장 많이 쓴 날은 ${k('day')}{이었어요/였어요}.`, ['day']);
      add('day_amount', `${k('day')}에 가장 많은 ${k('amount')}{을/를} 썼어요.`, ['day', 'amount']);
      add('weekday', `가장 많이 쓴 요일은 ${k('weekday')}{이었어요/였어요}.`, ['weekday']);
      add(
        'weekday_amount',
        `요일별로는 ${k('weekday')}에 가장 많은 ${k('amount')}{을/를} 썼어요.`,
        ['weekday', 'amount'],
      );
      break;
    case 'memo':
      add(
        'count',
        `${k('text')} 지출은 ${k('count')} 있었고 합계는 ${k('amount')}{이었어요/였어요}.`,
        ['text', 'count', 'amount'],
      );
      break;
    case 'income':
      add('rate', `수입 ${k('amount')} 중 ${k('expense_rate')}{을/를} 썼어요.`, [
        'amount',
        'expense_rate',
      ]);
      break;
  }
  return frames;
}

export function buildFrames(keyed: KeyedFacts): Frame[] {
  return keyed.groups.flatMap(g => framesOf(g, keyed.kind));
}

/** headline 후보. 채운 뒤 30자 안의 한 문장이다(PRD 6장 길이 한도) */
export const HEADLINE_LIMIT = 30;

export function headlineFrames(frames: Frame[], render: (text: string) => string) {
  return frames.filter(f => {
    const text = render(f.text);
    return text.length <= HEADLINE_LIMIT && (text.match(/[.?]/g) ?? []).length === 1;
  });
}

/** 제안에 쓸 수 있는 키. 값(금액·비율)은 쓰지 않고 이름만 쓴다 */
export function nameKeys(keyed: KeyedFacts) {
  return keyed.groups.flatMap(g =>
    g.facts
      .filter(f =>
        /^(?:category\.\d+\.name|tag\.\d+\.name|memo\.\d+\.text|largest\.memo)$/.test(f.key),
      )
      .map(f => f.key),
  );
}

/** LLM이 쓰는 JSON. 문법이 모양을 강제하지만 끊긴 출력과 하네스가 저장한 원문을 위해 다시 검증한다 */
const RawOutputSchema = z.object({
  headline: z.string(),
  insights: z.array(z.string()),
  suggestion: z.string(),
});

/**
 * LLM 출력 읽기. LLM은 문장 id와 제안만 쓴다. 코드가 id를 문장 틀로 펼쳐 저장하는 모양(Output)으로 만든다.
 *
 *   {"headline": "<틀 id>", "insights": ["<틀 id>", …(2~4개)], "suggestion": "…"}
 */
export function frameFormat(keyed: KeyedFacts, frames: Frame[]) {
  const byId = new Map(frames.map(f => [f.id, f]));
  const names = new Set(nameKeys(keyed));

  /**
   * 한 묶음의 틀은 회고에 하나만 쓴다. 같은 묶음의 틀은 같은 값을 되풀이하므로("예산에서 92,700원 남았어요." 뒤에
   * "예산의 67%를 써서 92,700원 남았어요.") headline이나 앞 insight와 묶음이 같은 insight는 버린다.
   * 남은 insight가 2개보다 적으면 읽기 실패로 본다
   */
  const expand = (
    headline: string | undefined,
    insightIds: string[],
    suggestion: string | undefined,
  ) => {
    const fields: Field[] = [];
    const used = new Set<string>();
    const groupOf = (id: string) => byId.get(id)?.group ?? id;
    if (headline !== undefined) {
      fields.push({ field: 'headline', text: byId.get(headline)?.text ?? '' });
      used.add(groupOf(headline));
    }
    for (const id of insightIds) {
      if (used.has(groupOf(id))) continue;
      used.add(groupOf(id));
      const frame = byId.get(id);
      fields.push({
        field: 'insight',
        index: fields.length - (headline === undefined ? 0 : 1),
        about: frame?.group ?? id,
        text: frame?.text ?? '',
      });
    }
    if (suggestion !== undefined) fields.push({ field: 'suggestion', text: suggestion });
    return fields;
  };

  return {
    /** 지금까지 받은 출력에서 완성된 필드. 문법이 id와 문장에 따옴표를 막으므로 정규식으로 충분하다 */
    fields(text: string): Field[] {
      const headline = /"headline":\s*"([^"]*)"/.exec(text)?.[1];
      const inner = /"insights":\s*\[([^\]]*)/.exec(text)?.[1] ?? '';
      const ids = [...inner.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      const suggestion = /"suggestion":\s*"([^"]*)"/.exec(text)?.[1];
      return expand(headline, ids, suggestion);
    },
    /** Qwen3.5는 추론 모드를 꺼도 앞에 빈 think 블록을 붙이므로 뗀다(PRD 6장). 읽을 수 없으면 undefined */
    parse(raw: string): Output | undefined {
      const body = raw.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '');
      let parsed;
      try {
        parsed = RawOutputSchema.safeParse(JSON.parse(body));
      } catch {
        return undefined;
      }
      if (!parsed.success) return undefined;
      const { headline, insights: ids, suggestion } = parsed.data;
      const fields = expand(headline, ids, suggestion);
      const insights = fields.flatMap(f =>
        f.field === 'insight' ? [{ about: f.about, text: f.text }] : [],
      );
      if (insights.length < 2 || insights.length > 4) return undefined;
      return { headline: fields[0].text, insights, suggestion };
    },
    check(field: Field): Problem[] {
      if (field.field === 'suggestion') return checkSentence(field.text, names, false);
      if (field.text === '') return ['unknown-key'];
      return checkField(keyed, field);
    },
  };
}
