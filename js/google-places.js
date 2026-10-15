import { saveRestaurants } from './restaurant-store.js';

async function request(path) {
  const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Google 장소 정보를 가져오지 못했어요.');
  return result;
}
export async function searchGoogleRestaurants(region, menu = '', pageToken = '') {
  const query = `${String(region).trim()} ${String(menu).trim() || '음식점'}`;
  if (!String(region).trim()) throw new Error('검색할 지역을 입력해 주세요.');
  return request(`/api/google/places/search?${new URLSearchParams({ q: query, ...(pageToken ? { pageToken } : {}) })}`);
}
export async function getGoogleRestaurant(id) {
  if (!/^google-[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('Google 장소 ID가 올바르지 않습니다.');
  return request(`/api/google/places/${encodeURIComponent(id.slice(7))}`);
}
export async function restoreGoogleRestaurants(ids) {
  const pending = [...new Set(ids)].filter(id => /^google-[A-Za-z0-9_-]{1,256}$/.test(id));
  const places = [], failures = [];
  // 저장한 것은 ID뿐이며, 가게 정보를 사용할 때 Google에서 다시 조회합니다.
  async function worker() { while (pending.length) { const id = pending.shift(); try { places.push(await getGoogleRestaurant(id)); } catch (error) { failures.push(error); } } }
  await Promise.all([worker(), worker()]); saveRestaurants(places);
  return { places, failures };
}
export function ratingText(restaurant) {
  return restaurant.source === 'google' ? (restaurant.rating == null ? 'Google Maps · 평가 없음' : `★ ${restaurant.rating.toFixed(1)} · 평가 ${restaurant.userRatingCount.toLocaleString('ko-KR')}개 · Google Maps`) : '카카오맵에서 별점 확인';
}
