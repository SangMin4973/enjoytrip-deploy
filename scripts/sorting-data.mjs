import { createGooglePlaces } from '../server/google-places.js';
import { collectGoogleRestaurants } from '../js/google-places.js';

export const SORT_MODES = { rating: 'RATING_DESC', count: 'COUNT_DESC' };

// 정렬이 아닌 입력 변환입니다. 원래 수집 순서와 원본 객체를 보존합니다.
export function sortingCandidates(restaurants) {
  if (!Array.isArray(restaurants) || restaurants.length > 1000) throw new Error('정렬 입력은 0~1000개 배열이어야 합니다.');
  const ids = new Set();
  return restaurants.map((item, originalIndex) => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || ids.has(item.id)
      || !['google', 'kakao'].includes(item.source)) throw new Error('음식점 ID·출처가 올바르지 않거나 ID가 중복됐습니다.');
    ids.add(item.id);
    return { id: item.id, name: typeof item.name === 'string' ? item.name : '', source: item.source,
      rating: Number.isFinite(item.rating) && item.rating >= 1 && item.rating <= 5 ? item.rating : null,
      userRatingCount: Number.isSafeInteger(item.userRatingCount) && item.userRatingCount >= 0 ? item.userRatingCount : 0,
      originalIndex };
  });
}

export function javaSortingInput(restaurants, { mode = 'rating', expectedIds = [] } = {}) {
  if (!Object.hasOwn(SORT_MODES, mode)) throw new Error('정렬 모드는 rating 또는 count입니다.');
  const candidates = sortingCandidates(restaurants);
  if (!Array.isArray(expectedIds) || expectedIds.some(id => typeof id !== 'string')) throw new Error('예상 ID 목록이 올바르지 않습니다.');
  const base64 = value => Buffer.from(value, 'utf8').toString('base64');
  return [`MATZIP_SORT_V1\t${SORT_MODES[mode]}\t${candidates.length}`,
    ...candidates.map(item => [base64(item.id), base64(item.name), item.source, item.rating ?? 'null', item.userRatingCount, item.originalIndex].join('\t')),
    ['EXPECTED', ...expectedIds.map(base64)].join('\t'), ''].join('\n');
}

// 개발자가 로컬에서 직접 실행하는 도구입니다. 웹 API·공용 DB 경로는 추가하지 않습니다.
export async function loadGoogleSortingData(region, menu = '', { google = createGooglePlaces(), onProgress } = {}) {
  const area = String(region || '').trim(), food = String(menu || '').trim();
  if (!area) throw new Error('--region으로 검색 지역을 입력해 주세요.');
  const query = `${area} ${food || '음식점'}`;
  if (query.length > 200) throw new Error('지역과 메뉴 검색어는 200자 이하여야 합니다.');
  if (!google.configured) throw new Error('.env 또는 환경변수에 GOOGLE_PLACES_API_KEY를 설정해 주세요.');
  const result = await collectGoogleRestaurants(area, food, {
    searchPage: (_region, _menu, token) => google.search(query, token),
    ...(onProgress ? { onProgress } : {}),
  });
  return { candidates: sortingCandidates(result.restaurants), pagesFetched: result.pagesFetched, truncated: result.truncated };
}
