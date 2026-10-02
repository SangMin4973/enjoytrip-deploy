export async function searchYoutubeVideos(name, { signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/youtube/search?q=${encodeURIComponent(name)}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(18000)]) : AbortSignal.timeout(18000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '유튜브 검색에 실패했어요.');
    if (!Array.isArray(data.videos)) throw new Error('유튜브 영상 정보를 읽지 못했어요.');
    return data.videos.slice(0, 5);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === 'TimeoutError') throw new Error('영상 검색이 지연되고 있어요. 다시 시도해 주세요.');
    if (error instanceof TypeError) throw new Error('영상 검색 서버에 연결하지 못했어요. 다시 시도해 주세요.');
    throw error;
  }
}
