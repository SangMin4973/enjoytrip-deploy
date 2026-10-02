import { MOCK_AREAS, MOCK_DISTRICTS, MOCK_PLACES, getMockPlaces } from './data.js';

async function request(path, params = {}) {
  let response;
  try { response = await fetch(`${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('서버에 연결하지 못했습니다. npm start로 실행한 주소와 네트워크 상태를 확인해 주세요.'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('API 서버 응답이 올바르지 않습니다. Live Server 대신 npm start로 실행한 http://localhost:5173 주소를 사용해 주세요.'); }
  if (!response.ok) throw new Error(data.error || '조회에 실패했습니다.');
  return data;
}

export const getConfig = () => request('/api/config');
export const getAreas = (mode) => mode === 'sample' ? Promise.resolve(MOCK_AREAS) : request('/api/tour/areas');
export const getDistricts = (mode, area) => mode === 'sample'
  ? Promise.resolve(MOCK_DISTRICTS[area] || []) : request('/api/tour/districts', { area });
export const getPlaces = (mode, filters) => mode === 'sample'
  ? Promise.resolve(getMockPlaces(filters)) : request('/api/tour/places', filters);
export const getDetail = (mode, id, type) => mode === 'sample'
  ? Promise.resolve(MOCK_PLACES.find((place) => place.id === id)) : request('/api/tour/detail', { id, type });
