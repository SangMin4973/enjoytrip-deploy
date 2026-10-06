export class NaverImageError extends Error {
  constructor(message, code, status = 502) {
    super(message); this.name = 'NaverImageError'; this.code = code; this.status = status;
  }
}

function publicImageUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return null;
    // HTTPS 화면에서 원본·썸네일을 안전하게 표시합니다. 지원하지 않는 호스트는 화면에서 오류를 안내합니다.
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export async function fetchNaverImages(query, {
  clientId = process.env.NCP_NAVER_CLIENT_ID, clientSecret = process.env.NCP_NAVER_CLIENT_SECRET,
  fetchImpl = fetch, timeoutMs = 10000,
} = {}) {
  const text = String(query || '').trim();
  if (!text || text.length > 200) throw new NaverImageError('이미지 검색어를 1~200자로 입력해 주세요.', 'INVALID_QUERY', 400);
  if (!clientId?.trim() || !clientSecret?.trim()) throw new NaverImageError('네이버 이미지 검색 연결을 준비 중입니다.', 'MISSING_CONFIG', 503);
  const url = new URL('https://naverapihub.apigw.ntruss.com/search/v1/image');
  url.search = new URLSearchParams({ query: text, display: '5', start: '1', sort: 'sim', filter: 'all', format: 'json' });
  try {
    const response = await fetchImpl(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId.trim(), 'X-NCP-APIGW-API-KEY': clientSecret.trim() },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json();
    if (!response.ok || payload?.error || payload?.errorCode) {
      if (response.status === 429) throw new NaverImageError('이미지 검색 한도에 도달했어요. 잠시 후 다시 시도해 주세요.', 'QUOTA_EXCEEDED', 503);
      if ([401, 403].includes(response.status)) throw new NaverImageError('이미지 검색 연결을 확인 중입니다. 잠시 후 다시 시도해 주세요.', 'ACCESS_DENIED');
      throw new NaverImageError('이미지를 검색하지 못했어요. 다시 시도해 주세요.', 'PROVIDER_ERROR');
    }
    if (!Array.isArray(payload?.items)) throw new NaverImageError('이미지 검색 결과를 읽지 못했어요.', 'INVALID_RESPONSE');
    const seen = new Set(), images = [];
    for (const item of payload.items.slice(0, 5)) {
      const imageUrl = publicImageUrl(item?.link), thumbnail = publicImageUrl(item?.thumbnail);
      if (!imageUrl || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      images.push({ url: imageUrl, thumbnail: thumbnail || imageUrl, title: String(item.title || '').replace(/<[^>]*>/g, ''), width: Number(item.sizewidth) || 0, height: Number(item.sizeheight) || 0 });
    }
    return { images, query: text };
  } catch (error) {
    if (error instanceof NaverImageError) throw error;
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new NaverImageError('이미지 검색이 오래 걸리고 있어요. 다시 시도해 주세요.', 'TIMEOUT', 504);
    if (error instanceof SyntaxError) throw new NaverImageError('이미지 검색 결과를 읽지 못했어요.', 'INVALID_RESPONSE');
    throw new NaverImageError('이미지 검색에 연결하지 못했어요. 다시 시도해 주세요.', 'NETWORK_ERROR');
  }
}

export function createNaverImageSearch({ now = Date.now, cacheTtlMs = 10 * 60 * 1000, ...options } = {}) {
  const cache = new Map();
  return async query => {
    const text = String(query || '').trim();
    if (!text || text.length > 200) throw new NaverImageError('이미지 검색어를 1~200자로 입력해 주세요.', 'INVALID_QUERY', 400);
    const cached = cache.get(text);
    if (cached?.expiresAt > now()) return cached.promise;
    const promise = fetchNaverImages(text, options);
    cache.delete(text);
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(text, { promise, expiresAt: now() + cacheTtlMs });
    try { return await promise; }
    catch (error) { if (cache.get(text)?.promise === promise) cache.delete(text); throw error; }
  };
}
