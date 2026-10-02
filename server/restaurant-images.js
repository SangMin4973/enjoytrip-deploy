export class ImageSearchError extends Error {
  constructor(message, code, status = 502) {
    super(message); this.name = 'ImageSearchError'; this.code = code; this.status = status;
  }
}

function publicHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}

export async function fetchRestaurantImage(query, {
  key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY, cx = process.env.GOOGLE_CUSTOM_SEARCH_CX,
  fetchImpl = fetch, timeoutMs = 12000,
} = {}) {
  if (!key?.trim() || !cx?.trim()) throw new ImageSearchError('Google 이미지 검색의 API 키와 검색엔진 ID(cx)를 .env에 설정하고 서버를 다시 시작해 주세요.', 'MISSING_CONFIG', 503);
  const url = new URL('https://customsearch.googleapis.com/customsearch/v1');
  url.search = new URLSearchParams({ key: key.trim(), cx: cx.trim(), q: query, searchType: 'image', num: '1', safe: 'active', hl: 'ko', gl: 'kr' });
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    const payload = await response.json();
    if (!response.ok || payload?.error) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (response.status === 429 || ['dailyLimitExceeded', 'rateLimitExceeded', 'quotaExceeded'].includes(reason)) throw new ImageSearchError('Google 이미지 검색 한도에 도달했습니다.', 'QUOTA_EXCEEDED', 503);
      if (response.status === 403) throw new ImageSearchError('Google 이미지 검색 접근이 거부됐습니다. API 이용 가능한 기존 프로젝트인지와 키 제한·API 활성화를 확인해 주세요.', 'ACCESS_DENIED');
      if (response.status === 400) throw new ImageSearchError('Google 이미지 검색 키·검색엔진 ID(cx)·이미지 검색 설정을 확인해 주세요.', 'INVALID_CONFIG');
      throw new ImageSearchError('Google 이미지 검색 연결에 실패했습니다.', 'PROVIDER_ERROR');
    }
    if (!payload || (payload.items !== undefined && !Array.isArray(payload.items))) throw new ImageSearchError('Google 이미지 검색 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE');
    const first = payload.items?.[0];
    if (!first) return { image: null };
    const imageUrl = publicHttps(first.image?.thumbnailLink) || publicHttps(first.link);
    if (!imageUrl) return { image: null };
    return { image: { url: imageUrl, sourceUrl: publicHttps(first.image?.contextLink), title: String(first.title || ''), query } };
  } catch (error) {
    if (error instanceof ImageSearchError) throw error;
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new ImageSearchError('Google 이미지 검색 시간이 초과됐습니다.', 'TIMEOUT', 504);
    if (error instanceof SyntaxError) throw new ImageSearchError('Google 이미지 검색 응답을 읽지 못했습니다.', 'INVALID_RESPONSE');
    throw new ImageSearchError('Google 이미지 검색 서버에 연결하지 못했습니다.', 'NETWORK_ERROR');
  }
}

export function createRestaurantImageSearch({ now = Date.now, cacheTtlMs = 24 * 60 * 60 * 1000, ...options } = {}) {
  const cache = new Map();
  return async query => {
    const text = String(query || '').trim();
    if (!text || text.length > 200) throw new ImageSearchError('이미지 검색어를 1~200자로 입력해 주세요.', 'INVALID_QUERY', 400);
    const cached = cache.get(text);
    if (cached?.expiresAt > now()) return cached.promise;
    const promise = fetchRestaurantImage(text, options);
    cache.delete(text);
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(text, { promise, expiresAt: now() + cacheTtlMs });
    try { return await promise; }
    catch (error) { if (cache.get(text)?.promise === promise) cache.delete(text); throw error; }
  };
}
