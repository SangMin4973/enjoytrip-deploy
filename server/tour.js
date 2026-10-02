const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

export function normalizePlace(item) {
  const coordinate = (value) => value && Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(value) : null;
  return {
    id: String(item.contentid || ''), name: item.title || '이름 없음',
    typeCode: String(item.contenttypeid || ''), address: [item.addr1, item.addr2].filter(Boolean).join(' '),
    longitude: coordinate(item.mapx), latitude: coordinate(item.mapy), phone: item.tel || '',
    overview: String(item.overview || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ''),
    source: '한국관광공사 TourAPI',
  };
}

export async function fetchTour(endpoint, params, { key = process.env.TOUR_API_SERVICE_KEY, fetchImpl = fetch } = {}) {
  if (!key?.trim()) throw new Error('TOUR_API_SERVICE_KEY가 없습니다. .env에 키를 설정하고 서버를 다시 시작하거나 샘플 모드를 선택해 주세요.');
  let decodedKey = key.trim();
  try { decodedKey = decodeURIComponent(decodedKey); } catch { /* Decoding 키를 그대로 사용합니다. */ }
  const query = new URLSearchParams({
    serviceKey: decodedKey, MobileOS: 'WEB', MobileApp: 'EnjoyTripBase', _type: 'json',
    numOfRows: '100', pageNo: '1', ...params,
  });
  let response;
  try { response = await fetchImpl(`${BASE_URL}/${endpoint}?${query}`, { signal: AbortSignal.timeout(12000) }); }
  catch { throw new Error('관광 API에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.'); }
  if (!response.ok) throw new Error(`관광 API 응답 오류 (${response.status}). 서비스키와 활용 신청 상태를 확인해 주세요.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('관광 API가 JSON을 반환하지 않았습니다. 서비스키와 활용 신청 상태를 확인해 주세요.'); }
  const header = data.response?.header;
  if (!header || !['0000', '0'].includes(String(header.resultCode))) throw new Error('관광 API 요청이 실패했습니다. 서비스키와 조회 조건을 확인해 주세요.');
  const body = data.response.body || {};
  const item = body.items?.item;
  const items = Array.isArray(item) ? item : item && typeof item === 'object' ? [item] : [];
  return { items, total: Number(body.totalCount) || 0 };
}

function code(params, key, required = false) {
  const value = params.get(key) || '';
  if ((required && !value) || (value && !/^\d{1,12}$/.test(value))) throw new Error('올바른 지역 또는 콘텐츠 코드를 입력해 주세요.');
  return value;
}

export async function tourRoute(path, params) {
  if (path === '/api/tour/areas' || path === '/api/tour/districts') {
    const area = path.endsWith('/districts') ? code(params, 'area', true) : '';
    const { items } = await fetchTour('ldongCode2', { lDongListYn: 'N', ...(area ? { lDongRegnCd: area } : {}) });
    return items.map((item) => ({ code: String(item.code || item.key), name: item.name || item.label }));
  }
  if (path === '/api/tour/places') {
    const area = code(params, 'area', true); const district = code(params, 'district'); const type = code(params, 'type');
    const page = Number(params.get('page') || 1); const size = Number(params.get('size') || 10);
    if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(size) || size < 1 || size > 50) throw new Error('페이지 값이 올바르지 않습니다.');
    const keyword = (params.get('keyword') || '').trim();
    if (keyword.length > 100) throw new Error('검색어는 100자 이하로 입력해 주세요.');
    const query = { lDongRegnCd: area, pageNo: String(page), numOfRows: String(size), arrange: 'A' };
    if (district) query.lDongSignguCd = district;
    if (type) query.contentTypeId = type;
    if (keyword) query.keyword = keyword;
    const result = await fetchTour(keyword ? 'searchKeyword2' : 'areaBasedList2', query);
    return { items: result.items.map(normalizePlace), total: result.total };
  }
  if (path === '/api/tour/detail') {
    const id = code(params, 'id', true);
    const { items } = await fetchTour('detailCommon2', { contentId: id });
    if (!items.length) throw new Error('상세 정보가 없습니다.');
    const place = normalizePlace(items[0]);
    if (!place.typeCode) place.typeCode = code(params, 'type');
    return place;
  }
  return null;
}
