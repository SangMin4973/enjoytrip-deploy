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

export const RESTAURANTS_PER_PAGE = 15;
export const MAX_SEARCH_PAGES = 3;

// 다음 페이지 토큰으로 최대 45곳을 먼저 모읍니다. 결과는 현재 화면 메모리에서만 사용합니다.
export async function collectGoogleRestaurants(region, menu = '', {
  searchPage = searchGoogleRestaurants, isCurrent = () => true, onProgress = () => {},
} = {}) {
  const restaurants = [], ids = new Set(), tokens = new Set();
  let token = '', pagesFetched = 0;
  function checkCurrent() {
    if (!isCurrent()) throw new DOMException('검색이 취소되었습니다.', 'AbortError');
  }
  do {
    checkCurrent();
    tokens.add(token);
    const result = await searchPage(region, menu, token);
    checkCurrent();
    for (const restaurant of result.restaurants) {
      if (!ids.has(restaurant.id) && restaurants.length < RESTAURANTS_PER_PAGE * MAX_SEARCH_PAGES) {
        ids.add(restaurant.id); restaurants.push(restaurant);
      }
    }
    pagesFetched++;
    onProgress({ pagesFetched, count: restaurants.length });
    token = result.nextPageToken || '';
  } while (token && pagesFetched < MAX_SEARCH_PAGES && !tokens.has(token));
  return { restaurants, pagesFetched, truncated: !!token };
}

// Google API의 페이지와 화면의 페이지를 분리합니다. 화면 이동에는 API 요청이 없습니다.
export function restaurantPage(restaurants, requestedPage = 1) {
  const totalPages = Math.max(1, Math.ceil(restaurants.length / RESTAURANTS_PER_PAGE));
  const page = Math.max(1, Math.min(totalPages, Number.isInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * RESTAURANTS_PER_PAGE;
  return { restaurants: restaurants.slice(start, start + RESTAURANTS_PER_PAGE), page, totalPages,
    total: restaurants.length, hasPrevious: page > 1, hasNext: page < totalPages };
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
