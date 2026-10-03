import { type Known, nameGrams, normalizeMerchant } from './merchant';

/**
 * 처음 보는 가맹점과 이름이 비슷한 과거 가맹점 찾기(PRD 4.9). 검색은 이 함수 하나다. 글자로 못 잡는 경우가 실제로
 * 보이면(GS25와 세븐일레븐) 이 함수만 임베딩으로 바꾼다.
 *
 * 이름 조각(글자 두 개)의 겹침을 조각마다 가중치를 준 코사인으로 잰다. 가중치는 그 조각이 사용자의 가맹점 중 몇 곳에
 * 나오는지로 정한다(IDF). 집·회사 근처 지점이 많아 "역삼", "삼점" 같은 지점명 조각이 흔하다. 겹친 조각을 그냥 세면
 * "교촌치킨 역삼점"이 "BBQ치킨"(치킨)보다 "스타벅스 역삼점"(역삼, 삼점)에 가깝다. 한 사람의 가맹점은 많아야
 * 수천 곳이라 부를 때마다 전부 훑는다.
 *
 * 지점명(띄어 쓴 마지막 낱말이 '점'으로 끝남)은 조각에서 뺀다. "자라 강남점"처럼 짧은 이름은 지점명이 절반이라 가중치를
 * 낮춰도 "피자헛 강남점"과 0.3 넘게 겹쳤고, 2B 모델이 그 예시의 카테고리를 그대로 옮겼다(하네스, scripts/eval/README.md).
 * 정확 일치는 지점명까지 본다(merchant.ts).
 */

export type Similar = Known & { score: number };

/**
 * 이보다 낮은 가맹점은 내지 않는다. 낱말 하나가 겹친 가맹점은 "치킨"(습관)과 "서울"(잡음)이 0.1~0.2에 섞여 있어 점수로
 * 가를 수 없다. 0.2로 두면 과거 가맹점이 적을 때 "치킨"이 빠졌고(에뮬레이터 0.19), 하네스에서 0과 0.1은 같고 0.2와는
 * 모델마다 1건 안팎 차이였다(scripts/eval/README.md)
 */
export const MIN_SCORE = 0.1;

/** 검색에 쓰는 조각. 이름이 두 낱말 이상이고 마지막 낱말이 '점'으로 끝나면 지점명으로 보고 뺀다 */
function searchGrams(name: string) {
  const words = normalizeMerchant(name).split(' ');
  const branch = words.length > 1 && words[words.length - 1].endsWith('점');
  return nameGrams((branch ? words.slice(0, -1) : words).join(' '));
}

/** 점수가 minScore 이상인 과거 가맹점을 점수 순으로 k곳까지. 점수가 같으면 known의 앞(최근) 것이 먼저다 */
export function findSimilar(name: string, known: Known[], k = 5, minScore = MIN_SCORE): Similar[] {
  const grams = known.map(m => searchGrams(m.name));
  const df = new Map<string, number>();
  for (const list of grams) for (const g of list) df.set(g, (df.get(g) ?? 0) + 1);
  // 매끄러운 IDF. 과거에 없는 조각도 0이 아니라 가장 큰 가중치다
  const weight = (g: string) => Math.log((1 + known.length) / (1 + (df.get(g) ?? 0))) + 1;
  const norm = (list: string[]) => Math.sqrt(list.reduce((sum, g) => sum + weight(g) ** 2, 0));

  const query = searchGrams(name);
  const queryNorm = norm(query);
  const scored: Similar[] = [];
  known.forEach((merchant, i) => {
    const shared = grams[i].filter(g => query.includes(g));
    if (!shared.length) return;
    const dot = shared.reduce((sum, g) => sum + weight(g) ** 2, 0);
    const score = dot / (queryNorm * norm(grams[i]));
    if (score >= minScore) scored.push({ ...merchant, score });
  });
  // sort는 안정 정렬이라 점수가 같으면 known 순서(최근 것 먼저)가 남는다
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
