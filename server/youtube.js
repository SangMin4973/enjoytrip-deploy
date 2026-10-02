export class YoutubeApiError extends Error {
  constructor(message, code, status = 502) {
    super(message); this.name = 'YoutubeApiError'; this.code = code; this.status = status;
  }
}

function decodeSnippetText(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

function providerError(payload, status) {
  const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.details?.find(item => item.reason)?.reason;
  if (['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason) || status === 429) {
    return new YoutubeApiError('유튜브 검색 한도에 도달했어요. 잠시 후 다시 시도하거나 유튜브 검색 링크를 이용해 주세요.', 'QUOTA_EXCEEDED', 503);
  }
  if (['keyInvalid', 'API_KEY_INVALID'].includes(reason) || /API key not valid/i.test(payload?.error?.message || '')) {
    return new YoutubeApiError('유튜브 API 키가 올바르지 않아요. .env의 키를 확인하고 서버를 다시 시작해 주세요.', 'INVALID_KEY');
  }
  if (['accessNotConfigured', 'SERVICE_DISABLED'].includes(reason)) {
    return new YoutubeApiError('Google Cloud에서 YouTube Data API v3를 활성화해 주세요.', 'API_DISABLED');
  }
  if (status === 403) return new YoutubeApiError('유튜브 API 접근이 거부됐어요. API 활성화와 서버용 키 제한 설정을 확인해 주세요.', 'ACCESS_DENIED');
  return new YoutubeApiError('유튜브 검색 연결에 실패했어요. 잠시 후 다시 시도해 주세요.', 'PROVIDER_ERROR');
}

// 서버가 키를 보관하고 화면에는 실제 영상 정보만 전달합니다.
export async function fetchYoutubeVideos(query, { key = process.env.YOUTUBE_API_KEY, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  if (!key?.trim()) throw new YoutubeApiError('유튜브 검색 키가 설정되지 않았어요. 서버의 .env에 YOUTUBE_API_KEY를 설정하고 다시 시작해 주세요.', 'MISSING_KEY', 503);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '5', q: query,
    videoEmbeddable: 'true', order: 'relevance', relevanceLanguage: 'ko', regionCode: 'KR', key: key.trim() });
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    let payload;
    try { payload = await response.json(); } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) throw error;
      throw new YoutubeApiError('유튜브 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.', 'INVALID_RESPONSE');
    }
    if (response.status < 200 || response.status >= 300 || payload?.error) throw providerError(payload, response.status);
    if (!Array.isArray(payload?.items)) throw new YoutubeApiError('유튜브 응답 형식이 올바르지 않아요.', 'INVALID_RESPONSE');
    const videos = new Map();
    for (const item of payload.items) {
      const id = item?.id?.videoId, snippet = item?.snippet;
      if (!/^[\w-]{11}$/.test(id || '') || !snippet?.title) continue;
      const thumbnail = snippet.thumbnails?.medium?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url;
      // API 응답의 공개 유튜브 썸네일만 사용합니다.
      if (!/^https:\/\/(?:i|img)\.ytimg\.com\//.test(thumbnail || '')) continue;
      videos.set(id, { id, title: decodeSnippetText(snippet.title), creator: decodeSnippetText(snippet.channelTitle || 'YouTube'), thumbnail,
        watchUrl: `https://www.youtube.com/watch?v=${id}` });
    }
    return { videos: [...videos.values()].slice(0, 5) };
  } catch (error) {
    if (error instanceof YoutubeApiError) throw error;
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new YoutubeApiError('유튜브 검색 시간이 초과됐어요. 다시 시도해 주세요.', 'TIMEOUT', 504);
    // 외부 오류에 포함될 수 있는 키·요청 URL을 그대로 반환하지 않습니다.
    throw new YoutubeApiError('유튜브 서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.', 'NETWORK_ERROR');
  }
}

export function createYoutubeSearch({ cacheTtlMs = 60 * 60 * 1000, now = Date.now, ...options } = {}) {
  const cache = new Map();
  return async query => {
    const name = String(query || '').trim();
    if (!name || name.length > 200) throw new YoutubeApiError('영상 검색어를 1~200자로 입력해 주세요.', 'INVALID_QUERY', 400);
    const existing = cache.get(name);
    if (existing && existing.expiresAt > now()) return existing.promise;
    const promise = fetchYoutubeVideos(name, options);
    cache.delete(name);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(name, { promise, expiresAt: now() + cacheTtlMs });
    try { return await promise; }
    catch (error) { if (cache.get(name)?.promise === promise) cache.delete(name); throw error; }
  };
}
