import { createHmac, timingSafeEqual } from 'node:crypto';

export class GooglePlacesError extends Error {
  constructor(message, code, status = 502) { super(message); this.name = 'GooglePlacesError'; this.code = code; this.status = status; }
}
const ID = /^[A-Za-z0-9_-]{1,256}$/;
const PHOTO = /^places\/([A-Za-z0-9_-]{1,256})\/photos\/[A-Za-z0-9_-]{1,4096}$/;
const fields = 'id,displayName,formattedAddress,location,rating,userRatingCount,photos,googleMapsUri,nationalPhoneNumber,primaryTypeDisplayName,attributions';
function fail(message, code = 'INVALID_REQUEST', status = 400) { throw new GooglePlacesError(message, code, status); }
function publicUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
function credits(items = []) {
  return Array.isArray(items) ? items.map(item => ({ name: String(item.displayName || item.provider || ''), url: publicUrl(item.uri || item.providerUri) })).filter(item => item.name) : [];
}
export function createGooglePlaces({ key = process.env.GOOGLE_PLACES_API_KEY, fetchImpl = fetch, now = Date.now } = {}) {
  const configured = !!key?.trim();
  const sign = value => createHmac('sha256', key.trim()).update(value).digest('hex');
  async function google(path, { method = 'GET', body, fieldMask, image = false } = {}) {
    if (!configured) fail('Google 장소 검색 연결을 준비 중입니다.', 'MISSING_CONFIG', 503);
    let response;
    try {
      response = await fetchImpl(new URL(path, 'https://places.googleapis.com'), { method,
        headers: { 'X-Goog-Api-Key': key.trim(), ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
    } catch (error) {
      if (['AbortError', 'TimeoutError'].includes(error.name)) fail('Google 장소 조회가 오래 걸리고 있어요. 다시 시도해 주세요.', 'TIMEOUT', 504);
      fail('Google 장소 검색에 연결하지 못했어요. 다시 시도해 주세요.', 'NETWORK_ERROR', 503);
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) fail('Google Places API 활성화·키 제한·결제 설정을 확인해 주세요.', 'ACCESS_DENIED', 503);
      if (response.status === 429) fail('Google 장소 조회 한도에 도달했어요. 잠시 후 다시 시도해 주세요.', 'QUOTA_EXCEEDED', 503);
      if (response.status === 404) fail('장소 또는 사진을 찾지 못했어요. 다시 검색해 주세요.', 'NOT_FOUND', 404);
      if (response.status === 400) fail('검색 조건 또는 사진 정보가 만료됐어요. 다시 검색해 주세요.', 'INVALID_REQUEST', 400);
      fail('Google 장소 정보를 가져오지 못했어요.', 'PROVIDER_ERROR', 502);
    }
    if (image) return response;
    try { const result = await response.json(); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
    catch { fail('Google 장소 응답을 읽지 못했어요.', 'INVALID_RESPONSE', 502); }
  }
  function photoUrl(name, width) {
    const expires = Math.floor(now() / 1000) + 900;
    const signature = sign(`${name}:${width}:${expires}`);
    return `/api/google/places/photo?${new URLSearchParams({ name, width, expires, signature })}`;
  }
  function normalize(place) {
    const { latitude, longitude } = place.location || {};
    if (!ID.test(place.id || '') || !place.displayName?.text || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) fail('Google 장소 정보의 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
    const rating = place.rating;
    return { id: `google-${place.id}`, placeId: place.id, name: String(place.displayName.text), address: String(place.formattedAddress || ''),
      phone: String(place.nationalPhoneNumber || ''), category: String(place.primaryTypeDisplayName?.text || ''), latitude, longitude,
      placeUrl: publicUrl(place.googleMapsUri) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName.text)}&query_place_id=${encodeURIComponent(place.id)}`,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
      userRatingCount: Number.isInteger(place.userRatingCount) && place.userRatingCount >= 0 ? place.userRatingCount : 0,
      source: 'google', attributions: credits(place.attributions),
      photos: (Array.isArray(place.photos) ? place.photos : []).filter(photo => PHOTO.test(photo.name || '') && photo.name.startsWith(`places/${place.id}/photos/`)).slice(0, 5).map((photo, index) => ({
        thumbnail: photoUrl(photo.name, 400), url: photoUrl(photo.name, 1600), title: `${place.displayName.text} · 사진 ${index + 1}`,
        width: Number(photo.widthPx) || 0, height: Number(photo.heightPx) || 0, attributions: credits(photo.authorAttributions),
      })),
    };
  }
  async function search(query, pageToken = '') {
    const q = String(query || '').trim();
    if (!q || q.length > 200 || typeof pageToken !== 'string' || pageToken.length > 4096) fail('검색어와 페이지 정보가 올바르지 않습니다.');
    const result = await google('/v1/places:searchText', { method: 'POST', fieldMask: fields.split(',').map(field => `places.${field}`).join(',') + ',nextPageToken',
      body: { textQuery: q, languageCode: 'ko', regionCode: 'KR', includedType: 'restaurant', strictTypeFiltering: true, pageSize: 15, ...(pageToken ? { pageToken } : {}) } });
    if (result.places !== undefined && !Array.isArray(result.places)) fail('Google 검색 결과를 읽지 못했어요.', 'INVALID_RESPONSE', 502);
    const restaurants = [...new Map((result.places || []).slice(0, 15).map(normalize).map(place => [place.id, place])).values()];
    return { restaurants, nextPageToken: typeof result.nextPageToken === 'string' ? result.nextPageToken : null };
  }
  async function details(id) {
    if (!ID.test(id || '')) fail('Google 장소 ID가 올바르지 않습니다.');
    return normalize(await google(`/v1/places/${id}?languageCode=ko`, { fieldMask: fields }));
  }
  async function photo(params) {
    if (!configured) fail('Google 장소 검색 연결을 준비 중입니다.', 'MISSING_CONFIG', 503);
    const name = params.get('name') || '', width = params.get('width') || '', expires = params.get('expires') || '', signature = params.get('signature') || '';
    if (!PHOTO.test(name) || !['400', '1600'].includes(width) || !/^\d{1,12}$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature)) fail('사진 요청이 올바르지 않습니다.');
    const seconds = Math.floor(now() / 1000);
    if (Number(expires) <= seconds || Number(expires) > seconds + 900 || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(`${name}:${width}:${expires}`), 'hex'))) fail('사진 정보가 만료됐어요. 가게를 다시 검색해 주세요.', 'EXPIRED_PHOTO', 403);
    const response = await google(`/v1/${name}/media?maxWidthPx=${width}&maxHeightPx=${width}`, { image: true });
    const contentType = response.headers.get('content-type')?.split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(contentType)) fail('사진 응답을 읽지 못했어요.', 'INVALID_RESPONSE', 502);
    const chunks = []; let size = 0;
    try { for await (const chunk of response.body) { size += chunk.byteLength; if (size > 8 * 1024 * 1024) fail('사진 용량이 너무 큽니다.', 'INVALID_RESPONSE', 502); chunks.push(chunk); } }
    catch (error) { if (error instanceof GooglePlacesError) throw error; fail('사진을 불러오지 못했어요.', 'NETWORK_ERROR', 502); }
    return { data: Buffer.concat(chunks), contentType };
  }
  return { configured, search, details, photo };
}
