const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

const ERROR_MESSAGES = {
  '01': '관광 API 내부 오류입니다. 잠시 후 다시 조회해 주세요.',
  '04': '관광 API HTTP 오류입니다. 잠시 후 다시 조회해 주세요.',
  '12': '요청한 관광 API가 없거나 폐기되었습니다. KorService2 활용 신청을 확인해 주세요.',
  '20': '관광 API 접근이 거부되었습니다. 국문 관광정보 서비스_GW 활용 신청과 승인 상태를 확인해 주세요.',
  '22': '관광 API 요청 한도를 초과했습니다. 사용량과 할당량을 확인해 주세요.',
  '30': '등록되지 않은 서비스키입니다. .env의 TOUR_API_SERVICE_KEY를 발급받은 정확한 키로 수정하고 서버를 다시 시작해 주세요. 신규 활용 신청 직후라면 승인 반영까지 시간이 걸릴 수 있습니다.',
  '31': '서비스키 활용 기간이 만료되었습니다. 공공데이터포털에서 활용 기간 연장을 신청해 주세요.',
  '32': '등록되지 않은 IP입니다. 활용 신청의 허용 IP 설정을 확인해 주세요.',
  '99': '관광 API에서 알 수 없는 오류가 발생했습니다. 잠시 후 다시 조회해 주세요.',
};

export class TourApiError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.name = 'TourApiError';
    this.code = code;
    this.status = status;
  }
}

function providerError(code) {
  const safeCode = /^\d{1,4}$/.test(String(code)) ? String(code).padStart(2, '0') : 'UNKNOWN';
  return new TourApiError(`관광 API 오류 ${safeCode}: ${ERROR_MESSAGES[safeCode] || '관광 API 요청이 실패했습니다. 요청 조건과 활용 신청 상태를 확인해 주세요.'}`, safeCode);
}

// v4.4 매뉴얼의 XML 인증 오류와 실제 게이트웨이의 JSON 인증 오류를 모두 처리합니다.
export function parseTourResponse(text, httpStatus = 200) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { /* XML 오류 응답을 아래에서 확인합니다. */ }
  const gateway = data?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gateway) throw providerError(gateway.returnReasonCode);
  const xmlCode = text.match(/<(?:[\w.-]+:)?returnReasonCode\b[^>]*>\s*(\d+)\s*<\//i)?.[1];
  if (xmlCode) throw providerError(xmlCode);
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new TourApiError(`관광 API HTTP 오류 (${httpStatus}). 서비스키와 활용 신청 상태를 확인해 주세요.`, 'HTTP_ERROR');
  }
  if (!data) throw new TourApiError('관광 API 응답 형식이 올바르지 않습니다. JSON 조회가 가능한지 확인해 주세요.', 'INVALID_RESPONSE');
  const header = data.response?.header;
  if (!header) throw new TourApiError('관광 API 응답에 결과코드가 없습니다.', 'INVALID_RESPONSE');
  if (!['0000', '0'].includes(String(header.resultCode))) throw providerError(header.resultCode);
  const body = data.response.body || {};
  const item = body.items?.item;
  const items = Array.isArray(item) ? item : item && typeof item === 'object' ? [item] : [];
  return { items, total: Number(body.totalCount) || 0 };
}

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
  if (!key?.trim()) throw new TourApiError('TOUR_API_SERVICE_KEY가 없습니다. .env에 키를 설정하고 서버를 다시 시작하거나 샘플 모드를 선택해 주세요.', 'MISSING_KEY', 503);
  let decodedKey = key.trim();
  try { decodedKey = decodeURIComponent(decodedKey); } catch { /* Decoding 키를 그대로 사용합니다. */ }
  const query = new URLSearchParams({
    serviceKey: decodedKey, MobileOS: 'WEB', MobileApp: 'EnjoyTripBase', _type: 'json',
    numOfRows: '100', pageNo: '1', ...params,
  });
  let response, text;
  try {
    response = await fetchImpl(`${BASE_URL}/${endpoint}?${query}`, { signal: AbortSignal.timeout(12000) });
    text = await response.text();
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new TourApiError('관광 API 응답 시간이 초과되었습니다. 잠시 후 다시 조회해 주세요.', 'TIMEOUT', 504);
    throw new TourApiError('관광 API에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.', 'NETWORK_ERROR');
  }
  return parseTourResponse(text, response.status);
}

function code(params, key, required = false) {
  const value = params.get(key) || '';
  if ((required && !value) || (value && !/^\d{1,12}$/.test(value))) throw new Error('올바른 지역 또는 콘텐츠 코드를 입력해 주세요.');
  return value;
}

export async function tourRoute(path, params, options = {}) {
  if (path === '/api/tour/areas' || path === '/api/tour/districts') {
    const area = path.endsWith('/districts') ? code(params, 'area', true) : '';
    const { items } = await fetchTour('ldongCode2', { lDongListYn: 'N', ...(area ? { lDongRegnCd: area } : {}) }, options);
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
    const result = await fetchTour(keyword ? 'searchKeyword2' : 'areaBasedList2', query, options);
    return { items: result.items.map(normalizePlace), total: result.total };
  }
  if (path === '/api/tour/detail') {
    const id = code(params, 'id', true);
    const { items } = await fetchTour('detailCommon2', { contentId: id }, options);
    if (!items.length) throw new Error('상세 정보가 없습니다.');
    const place = normalizePlace(items[0]);
    if (!place.typeCode) place.typeCode = code(params, 'type');
    return place;
  }
  return null;
}
