import { allCategories, allFixedCosts, allReasonTags } from '../db/lists';
import type { Names } from '../retro/keys';
import { useQuery } from './data';

/** 카테고리·이유 태그·고정비 항목과 이름 지도. 숨긴 것도 들고 있어 과거 거래의 이름을 그대로 쓴다(PRD 4.2) */
export function useLists() {
  return useQuery('lists', async db => {
    const categories = await allCategories(db);
    const reasonTags = await allReasonTags(db);
    const fixedCosts = await allFixedCosts(db);
    const names: Names = {
      categories: new Map(categories.map(c => [c.id, c.name])),
      reasonTags: new Map(reasonTags.map(t => [t.id, t.name])),
    };
    return { categories, reasonTags, fixedCosts, names };
  });
}

export const PAYMENT_METHODS = [
  { value: 'card', label: '카드' },
  { value: 'cash', label: '현금' },
  { value: 'transfer', label: '계좌이체' },
] as const;

export const SATISFACTION = [
  { value: 'regret', label: '후회' },
  { value: 'neutral', label: '보통' },
  { value: 'satisfied', label: '만족' },
] as const;

export const paymentLabel = (method: string | null) =>
  PAYMENT_METHODS.find(m => m.value === method)?.label;
