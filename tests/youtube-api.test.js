import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchYoutubeVideos, createYoutubeSearch } from '../server/youtube.js';
import { makeServer } from '../server.mjs';
import { buildRestaurantSearchQuery } from '../js/restaurant-search.js';

const sample = id => ({ id: { videoId: id }, snippet: { title: '실제 응답 형식 테스트', channelTitle: '테스트 채널',
  thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } } });
const response = (items, status = 200) => ({ status, json: async () => ({ items }) });

test('지역·가게 이름 검색어로 임베드 가능 영상의 썸네일·제목·채널을 최대 5개 전달한다', async () => {
  let requested;
  const result = await fetchYoutubeVideos('해운대 국민닭바베큐', { key: 'server-only-secret', fetchImpl: async url => {
    requested = url;
    return response(Array.from({ length: 7 }, (_, i) => sample(`videoTEST0${i}`)));
  } });
  assert.equal(requested.searchParams.get('q'), '해운대 국민닭바베큐');
  assert.equal(requested.searchParams.get('type'), 'video');
  assert.equal(requested.searchParams.get('maxResults'), '5');
  assert.equal(requested.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(result.videos.length, 5);
  assert.equal(result.videos[0].creator, '테스트 채널');
  assert.ok(!JSON.stringify(result).includes('server-only-secret'));
});

test('주소의 도로명·번지 대신 행정 지역을 검색어에 포함하고 북마크도 같은 기준을 쓴다', () => {
  for (const [address, location] of [
    ['부산 해운대구 해운대로143번길 47', '해운대'], ['서울 종로구 종로 1', '종로'],
    ['경기 수원시 영통구 광교로 123', '수원 영통'], ['강원특별자치도 속초시 중앙로 1', '속초'],
    ['서울 중구 세종대로 1', '서울 중구'], ['세종특별자치시 한누리대로 1', '세종'], ['', ''],
  ]) assert.equal(buildRestaurantSearchQuery({ address, name: '음식점' }), [location, '음식점'].filter(Boolean).join(' '));
});

test('중복·영상 ID 오류·외부 썸네일을 제외하고 실제 빈 결과를 유지한다', async () => {
  const result = await fetchYoutubeVideos('매장', { key: 'key', fetchImpl: async () => response([
    sample('videoTEST01'), sample('videoTEST01'), sample('bad'), null,
    { ...sample('videoTEST02'), snippet: { title: '외부 이미지', thumbnails: { medium: { url: 'https://untrusted.example/a.jpg' } } } },
  ]) });
  assert.equal(result.videos.length, 1);
  assert.deepEqual(await fetchYoutubeVideos('없는매장', { key: 'key', fetchImpl: async () => response([]) }), { videos: [] });
});

test('제목·채널의 HTML 문자 표기를 일반 텍스트로 전달한다', async () => {
  const item = sample('videoTEST01');
  item.snippet.title = '&#39;치킨&#39; &amp; 우동 &#x1F357; &lt;후기&gt;';
  item.snippet.channelTitle = 'A &quot;B&quot;';
  const { videos } = await fetchYoutubeVideos('매장', { key: 'key', fetchImpl: async () => response([item]) });
  assert.equal(videos[0].title, "'치킨' & 우동 🍗 <후기>");
  assert.equal(videos[0].creator, 'A "B"');
});

test('키 누락·네트워크·시간 초과·손상된 응답을 안전한 오류로 전달한다', async () => {
  await assert.rejects(fetchYoutubeVideos('매장', { key: '' }), error => error.code === 'MISSING_KEY');
  await assert.rejects(fetchYoutubeVideos('매장', { key: 'secret', fetchImpl: async () => { throw new Error('secret https://provider/?key=secret'); } }), error => error.code === 'NETWORK_ERROR' && !error.message.includes('secret'));
  await assert.rejects(fetchYoutubeVideos('매장', { key: 'secret', fetchImpl: async () => { throw new DOMException('secret', 'TimeoutError'); } }), error => error.code === 'TIMEOUT' && error.status === 504);
  await assert.rejects(fetchYoutubeVideos('매장', { key: 'secret', fetchImpl: async () => ({ status: 200, json: async () => null }) }), error => error.code === 'INVALID_RESPONSE');
});

test('API 비활성화·잘못된 키·할당량 초과 오류를 구분하고 제공자 본문을 노출하지 않는다', async () => {
  for (const [reason, code] of [['accessNotConfigured', 'API_DISABLED'], ['keyInvalid', 'INVALID_KEY'], ['quotaExceeded', 'QUOTA_EXCEEDED'], ['forbidden', 'ACCESS_DENIED']]) {
    await assert.rejects(fetchYoutubeVideos('매장', { key: 'secret', fetchImpl: async () => ({ status: 403, json: async () => ({ error: { message: 'secret', errors: [{ reason }] } }) }) }), error => error.code === code && !error.message.includes('secret'));
  }
});

test('동일 가게의 동시 요청·재조회는 공유하고 캐시 만료 후 새로 검색한다', async () => {
  let calls = 0, time = 0;
  const search = createYoutubeSearch({ key: 'key', now: () => time, cacheTtlMs: 10, fetchImpl: async () => { calls++; return response([sample('videoTEST01')]); } });
  await Promise.all([search(' 같은매장 '), search('같은매장')]);
  await search('같은매장'); assert.equal(calls, 1);
  time = 11; await search('같은매장'); assert.equal(calls, 2);
  await assert.rejects(search(' '), error => error.code === 'INVALID_QUERY');
});

test('실패한 요청을 캐시에 저장하지 않아 다시 시도할 수 있다', async () => {
  let calls = 0;
  const search = createYoutubeSearch({ key: 'key', fetchImpl: async () => { if (++calls === 1) throw new Error('network'); return response([]); } });
  await assert.rejects(search('매장'));
  assert.deepEqual(await search('매장'), { videos: [] }); assert.equal(calls, 2);
});

test('서버는 영상 정보만 중계하고 환경 설정·정적 파일에 유튜브 키를 노출하지 않는다', async context => {
  const server = makeServer({ youtubeOptions: { key: 'server-only-secret', fetchImpl: async () => response([sample('videoTEST01')]) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${base}/api/youtube/search?q=${encodeURIComponent('매장')}`);
  assert.equal(result.status, 200); assert.equal((await result.json()).videos.length, 1);
  assert.ok(!(await (await fetch(`${base}/api/config`)).text()).includes('server-only-secret'));
  assert.equal((await fetch(`${base}/server/youtube.js`)).status, 404);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});
