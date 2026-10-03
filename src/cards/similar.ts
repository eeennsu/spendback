import { type Known, nameGrams } from './merchant';

/**
 * 처음 보는 가맹점과 이름이 비슷한 과거 가맹점 찾기(PRD 4.9). 검색은 이 함수 하나다. 글자로 못 잡는 경우가 실제로
 * 보이면(GS25와 세븐일레븐) 이 함수만 임베딩으로 바꾼다.
 *
 * 이름 조각(글자 두 개)의 겹침을 조각마다 가중치를 준 코사인으로 잰다. 가중치는 그 조각이 사용자의 가맹점 중 몇 곳에
 * 나오는지로 정한다(IDF). 집·회사 근처 지점이 많아 "역삼", "삼점" 같은 지점명 조각이 흔하다. 겹친 조각을 그냥 세면
 * "교촌치킨 역삼점"이 "BBQ치킨"(치킨)보다 "스타벅스 역삼점"(역삼, 삼점)에 가깝다. 한 사람의 가맹점은 많아야
 * 수천 곳이라 부를 때마다 전부 훑는다.
 */

export type Similar = Known & { score: number };

/** 겹친 조각이 있는 과거 가맹점을 점수 순으로 k곳까지. 점수가 같으면 known의 앞(최근) 것이 먼저다 */
export function findSimilar(name: string, known: Known[], k = 5): Similar[] {
  const grams = known.map(m => nameGrams(m.name));
  const df = new Map<string, number>();
  for (const list of grams) for (const g of list) df.set(g, (df.get(g) ?? 0) + 1);
  // 매끄러운 IDF. 과거에 없는 조각도 0이 아니라 가장 큰 가중치다
  const weight = (g: string) => Math.log((1 + known.length) / (1 + (df.get(g) ?? 0))) + 1;
  const norm = (list: string[]) => Math.sqrt(list.reduce((sum, g) => sum + weight(g) ** 2, 0));

  const query = nameGrams(name);
  const queryNorm = norm(query);
  const scored: Similar[] = [];
  known.forEach((merchant, i) => {
    const shared = grams[i].filter(g => query.includes(g));
    if (!shared.length) return;
    const dot = shared.reduce((sum, g) => sum + weight(g) ** 2, 0);
    scored.push({ ...merchant, score: dot / (queryNorm * norm(grams[i])) });
  });
  // sort는 안정 정렬이라 점수가 같으면 known 순서(최근 것 먼저)가 남는다
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
