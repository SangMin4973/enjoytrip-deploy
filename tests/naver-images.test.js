import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNaverImages, createNaverImageSearch } from '../server/naver-images.js';
import { makeServer } from '../server.mjs';

const config = { clientId: 'private-id', clientSecret: 'private-secret' };
const item = index => ({ title: `<b>가게</b> ${index}`, link: `https://photos.example/${index}.jpg`, thumbnail: `https://thumb.example/${index}.jpg`, sizewidth: '800', sizeheight: '600' });
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });

test('네이버 API HUB에 검색어·5개·인증 헤더를 보내고 원본과 썸네일을 분리한다', async () => {
  const result = await fetchNaverImages('해운대 국민닭바베큐', { ...config, fetchImpl: async (url, options) => {
    assert.equal(url.origin, 'https://naverapihub.apigw.ntruss.com');
    assert.equal(url.pathname, '/search/v1/image');
    assert.equal(url.searchParams.get('query'), '해운대 국민닭바베큐');
    assert.equal(url.searchParams.get('display'), '5');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY'], config.clientSecret);
    assert.equal(options.headers['X-NCP-APIGW-API-KEY-ID'], config.clientId);
    assert.ok(!url.href.includes('private-'));
    return response({ items: Array.from({ length: 7 }, (_, index) => item(index)) });
  } });
  assert.equal(result.images.length, 5);
  assert.equal(result.images[0].url, item(0).link);
  assert.equal(result.images[0].thumbnail, item(0).thumbnail);
  assert.equal(result.images[0].title, '가게 0');
  assert.equal(result.images[0].width, 800);
  assert.ok(!JSON.stringify(result).includes('private-'));
});

test('빈 결과·중복·위험한 URL을 처리하고 HTTP 이미지 주소는 HTTPS로 표시한다', async () => {
  assert.deepEqual((await fetchNaverImages('가게', { ...config, fetchImpl: async () => response({ items: [] }) })).images, []);
  const result = await fetchNaverImages('가게', { ...config, fetchImpl: async () => response({ items: [item(0), item(0), { ...item(1), link: 'http://photos.example/1.jpg' }, { link: 'javascript:alert(1)' }, { link: 'https://127.0.0.1/secret' }] }) });
  assert.equal(result.images.length, 2);
  assert.equal(result.images[1].url, 'https://photos.example/1.jpg');
});

test('인증·할당량·손상된 응답·타임아웃을 구분하고 공급자 비밀 메시지를 전달하지 않는다', async () => {
  for (const [status, code] of [[401, 'ACCESS_DENIED'], [403, 'ACCESS_DENIED'], [429, 'QUOTA_EXCEEDED'], [500, 'PROVIDER_ERROR']]) {
    await assert.rejects(fetchNaverImages('가게', { ...config, fetchImpl: async () => response({ error: { message: config.clientSecret } }, status) }), error => error.code === code && !error.message.includes(config.clientSecret));
  }
  await assert.rejects(fetchNaverImages('가게', { clientId: '', clientSecret: '' }), error => error.code === 'MISSING_CONFIG');
  await assert.rejects(fetchNaverImages('가게', { ...config, fetchImpl: async () => response(null) }), error => error.code === 'INVALID_RESPONSE');
  await assert.rejects(fetchNaverImages('가게', { ...config, fetchImpl: async () => { throw new DOMException(config.clientSecret, 'TimeoutError'); } }), error => error.code === 'TIMEOUT');
});

test('동일 이미지 검색 요청은 공유하고 실패·만료 후에는 다시 요청한다', async () => {
  let calls = 0, time = 0;
  const search = createNaverImageSearch({ ...config, now: () => time, cacheTtlMs: 10, fetchImpl: async () => {
    if (++calls === 1) throw new Error(config.clientSecret);
    return response({ items: [item(0)] });
  } });
  await assert.rejects(search('가게'), error => error.code === 'NETWORK_ERROR');
  await Promise.all([search('가게'), search(' 가게 ')]); await search('가게');
  assert.equal(calls, 2); time = 11; await search('가게'); assert.equal(calls, 3);
  await assert.rejects(search(''), error => error.code === 'INVALID_QUERY');
});

test('서버가 이미지 5개만 중계하며 인증 정보와 서버 파일을 공개하지 않는다', async context => {
  const server = makeServer({ naverImageOptions: { ...config, fetchImpl: async () => response({ items: Array.from({ length: 5 }, (_, index) => item(index)) }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${base}/api/naver/images?q=${encodeURIComponent('가게')}`);
  assert.equal(result.status, 200);
  const payload = await result.text(); assert.equal(JSON.parse(payload).images.length, 5);
  assert.ok(!payload.includes(config.clientSecret) && !payload.includes(config.clientId));
  assert.equal((await fetch(`${base}/api/naver/images`)).status, 400);
  assert.equal((await fetch(`${base}/server/naver-images.js`)).status, 404);
  assert.equal((await fetch(`${base}/js/naver-images.js`)).status, 200);
});
