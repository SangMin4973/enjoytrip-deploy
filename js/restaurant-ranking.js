// 브라우저에서는 정렬 알고리즘을 실행하지 않습니다. Java 서버의 결과를 원본 객체에 연결합니다.
export const SORT_LABELS = { search: '검색순', rating: '별점순', count: '평가 많은 순', recommended: '보정 추천순' };
export const normalizeSortMode = mode => Object.hasOwn(SORT_LABELS, mode) ? mode : 'rating';

export async function requestRestaurantRanking(restaurants, mode, { signal, fetchImpl = fetch } = {}) {
  if (!Object.hasOwn(SORT_LABELS, mode)) throw new Error('정렬 방식을 확인해 주세요.');
  if (mode === 'search') return { mode, restaurants, scores: new Map() };
  const response = await fetchImpl('/api/restaurants/rank', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(12000)]),
    body: JSON.stringify({ mode, restaurants: restaurants.map(item => ({ id: item.id, source: item.source, rating: item.rating, userRatingCount: item.userRatingCount })) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '정렬을 완료하지 못했습니다.');
  const originals = new Map(restaurants.map(item => [item.id, item]));
  if (result.mode !== mode || !Array.isArray(result.items) || result.items.length !== restaurants.length) throw new Error('정렬 결과가 올바르지 않습니다.');
  const scores = new Map();
  const ordered = result.items.map(item => {
    const restaurant = originals.get(item.id);
    if (!restaurant || scores.has(item.id) || (item.score !== null && (!Number.isFinite(item.score) || item.score < 1 || item.score > 5))) throw new Error('정렬 결과가 올바르지 않습니다.');
    scores.set(item.id, item.score);
    return restaurant;
  });
  return { mode, restaurants: ordered, scores };
}
