import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRestaurantImage, createRestaurantImageSearch } from '../server/restaurant-images.js';
import { makeServer } from '../server.mjs';

const image = { title: '가게 이미지', link: 'https://photos.example/first.jpg', image: { thumbnailLink: 'https://images.example/thumb.jpg', contextLink: 'https://blog.example/store' } };
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });
const config = { key: 'secret-key', cx: 'secret-engine' };

test('지역·가게 이름으로 이미지 첫 결과만 요청하고 썸네일·출처를 전달한다', async () => {
  let requested;
  const result = await fetchRestaurantImage('해운대 국민닭바베큐', { ...config, fetchImpl: async url => { requested = url; return response({ items: [image, { ...image, link: 'https://photos.example/second.jpg' }] }); } });
  assert.equal(requested.searchParams.get('q'), '해운대 국민닭바베큐');
  assert.equal(requested.searchParams.get('num'), '1');
  assert.equal(requested.searchParams.get('searchType'), 'image');
  assert.equal(result.image.url, image.image.thumbnailLink);
  assert.equal(result.image.sourceUrl, image.image.contextLink);
  assert.ok(!JSON.stringify(result).includes('secret-'));
});

test('결과가 없거나 첫 이미지가 안전한 HTTPS 주소가 아니면 사진을 만들지 않는다', async () => {
  assert.deepEqual(await fetchRestaurantImage('매장', { ...config, fetchImpl: async () => response({}) }), { image: null });
  for (const url of ['http://photos.example/a', 'https://127.0.0.1/a', 'https://localhost/a', 'javascript:alert(1)']) {
    assert.deepEqual(await fetchRestaurantImage('매장', { ...config, fetchImpl: async () => response({ items: [{ link: url }, image] }) }), { image: null });
  }
});

test('키·cx 누락과 접근 거부·한도·타임아웃을 구분하고 비밀 값을 노출하지 않는다', async () => {
  await assert.rejects(fetchRestaurantImage('매장', { key: '', cx: '' }), error => error.code === 'MISSING_CONFIG');
  for (const [status, reason, code] of [[403, 'forbidden', 'ACCESS_DENIED'], [403, 'dailyLimitExceeded', 'QUOTA_EXCEEDED'], [400, 'keyInvalid', 'INVALID_CONFIG']]) {
    await assert.rejects(fetchRestaurantImage('매장', { ...config, fetchImpl: async () => response({ error: { message: 'secret-key', errors: [{ reason }] } }, status) }), error => error.code === code && !error.message.includes('secret-key'));
  }
  await assert.rejects(fetchRestaurantImage('매장', { ...config, fetchImpl: async () => { throw new DOMException('secret-key', 'TimeoutError'); } }), error => error.code === 'TIMEOUT');
  await assert.rejects(fetchRestaurantImage('매장', { ...config, fetchImpl: async () => response(null) }), error => error.code === 'INVALID_RESPONSE');
});

test('같은 검색의 동시 요청·재조회를 캐시하고 실패는 재시도한다', async () => {
  let calls = 0, time = 0;
  const search = createRestaurantImageSearch({ ...config, now: () => time, cacheTtlMs: 10, fetchImpl: async () => {
    if (++calls === 1) throw new Error('secret-key'); return response({ items: [image] });
  } });
  await assert.rejects(search('매장'), error => error.code === 'NETWORK_ERROR' && !error.message.includes('secret-key'));
  await Promise.all([search('매장'), search(' 매장 ')]); await search('매장'); assert.equal(calls, 2);
  time = 11; await search('매장'); assert.equal(calls, 3);
  await assert.rejects(search(''), error => error.code === 'INVALID_QUERY');
});

test('서버가 이미지 결과만 중계하고 키·서버 소스는 공개하지 않는다', async context => {
  const server = makeServer({ imageOptions: { ...config, fetchImpl: async () => response({ items: [image] }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${base}/api/restaurant-image?q=${encodeURIComponent('해운대 국민닭바베큐')}`);
  assert.equal(result.status, 200); assert.equal((await result.json()).image.url, image.image.thumbnailLink);
  const settings = await (await fetch(`${base}/api/config`)).text();
  assert.ok(!settings.includes('secret-key') && !settings.includes('secret-engine'));
  assert.equal((await fetch(`${base}/server/restaurant-images.js`)).status, 404);
});
