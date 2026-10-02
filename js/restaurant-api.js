import { loadKakaoSdk } from './kakao-sdk.js';

// 공개 장소 검색에서 받은 정보만 사용합니다. 사진·별점·리뷰는 생성하지 않습니다.
export function normalizeRestaurant(place) {
  const latitude = Number(place.y), longitude = Number(place.x);
  if (!/^\d+$/.test(String(place.id)) || !place.place_name || !String(place.y ?? '').trim() || !String(place.x ?? '').trim()
    || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('카카오 장소 정보의 형식이 올바르지 않습니다.');
  }
  return {
    id: `kakao-${place.id}`, placeId: String(place.id), name: place.place_name,
    address: place.road_address_name || place.address_name || '',
    phone: place.phone || '', category: place.category_name || '',
    latitude, longitude, placeUrl: `https://place.map.kakao.com/${place.id}`,
    source: 'kakao', fetchedAt: new Date().toISOString(),
  };
}

export function searchWithPlaces(services, region, menu = '', page = 1, { timeoutMs = 12000 } = {}) {
  const area = String(region).trim(), food = String(menu).trim();
  if (!area) return Promise.reject(new Error('검색할 지역을 입력해 주세요.'));
  if (!Number.isInteger(page) || page < 1 || page > 3) return Promise.reject(new Error('검색 페이지가 올바르지 않습니다.'));
  const query = `${area} ${food || '음식점'}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('음식점 검색 시간이 초과됐어요. 다시 시도해 주세요.')), timeoutMs);
    try {
      new services.Places().keywordSearch(query, (data, status, pagination) => {
        clearTimeout(timer);
        if (status === services.Status.ZERO_RESULT) { resolve({ restaurants: [], total: 0, page, hasNext: false }); return; }
        if (status !== services.Status.OK) {
          reject(new Error('카카오 음식점 검색에 실패했어요. 잠시 후 다시 시도해 주세요. 계속 실패하면 앱 권한·등록 도메인·요청 한도를 확인해 주세요.')); return;
        }
        try {
          const restaurants = [...new Map(data.filter(item => item.category_group_code === 'FD6').map(normalizeRestaurant).map(item => [item.id, item])).values()];
          resolve({ restaurants, total: Number(pagination.totalCount) || restaurants.length, page, hasNext: !!pagination.hasNextPage && page < 3 });
        } catch (error) { reject(error); }
      }, { category_group_code: 'FD6', size: 15, page });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

export async function searchRestaurants(key, region, menu = '', page = 1) {
  const maps = await loadKakaoSdk(key);
  if (!maps.services?.Places) throw new Error('카카오 장소 검색을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
  return searchWithPlaces(maps.services, region, menu, page);
}
