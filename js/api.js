import { MOCK_AREAS, MOCK_DISTRICTS, MOCK_PLACES, getMockPlaces } from './data.js';

async function request(path, params = {}) {
  const response = await fetch(`${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(15000) });
  const data = await response.json();
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
