import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRestaurantRanking, parseRankingOutput } from '../server/restaurant-ranking.js';
import { makeServer } from '../server.mjs';
import { requestRestaurantRanking } from '../js/restaurant-ranking.js';
import { restaurantPage } from '../js/google-places.js';

const compiled = existsSync(new URL('../algorithm-java/out/WebRankingMain.class', import.meta.url));
const candidate = (id, rating, userRatingCount, source = 'google') => ({ id, source, rating, userRatingCount });
const sample = [candidate('A', 5, 1), candidate('B', 4.7, 500), candidate('C', 4.5, 100), candidate('D', null, 0), candidate('E', 4.7, 500)];

test('웹 Java 정렬은 전체 45곳을 정렬한 뒤 페이지를 나누며 원본과 결측 후보를 보존한다', { skip: !compiled }, async () => {
  const rank = createRestaurantRanking(), original = structuredClone(sample);
  for (const [mode, expected] of [['rating', ['A', 'B', 'E', 'C', 'D']], ['count', ['B', 'E', 'C', 'A', 'D']], ['recommended', ['B', 'E', 'C', 'A', 'D']]]) {
    const result = await rank({ mode, restaurants: sample });
    assert.deepEqual(result.items.map(item => item.id), expected);
    if (mode === 'recommended') {
      assert.ok(Math.abs(result.items[0].score - (500 * 4.7 + 50 * 4) / 550) < 1e-9);
      assert.equal(result.items.at(-1).score, null);
    } else assert.ok(result.items.every(item => item.score === null));
  }
  assert.deepEqual(sample, original);
  const all = Array.from({ length: 45 }, (_, i) => candidate(String(i), i === 44 ? 5 : 4, i + 1));
  const result = await rank({ mode: 'rating', restaurants: all });
  const ordered = result.items.map(item => all.find(original => original.id === item.id));
  assert.equal(restaurantPage(ordered).restaurants[0].id, '44');
  assert.equal(restaurantPage(ordered, 3).restaurants.length, 15);
  assert.deepEqual((await rank({ mode: 'recommended', restaurants: [] })).items, []);
});

test('정렬 API는 로그인·동일 출처·입력 제한을 확인하고 Java 결과를 브라우저 원본에 연결한다', { skip: !compiled }, async t => {
  let googleCalls = 0;
  const server = makeServer({ googlePlacesOptions: { key: 'test-key', fetchImpl: async () => { googleCalls++; throw new Error('호출하면 안 됨'); } },
    sharedDbOptions: { url: 'https://example.supabase.co', key: 'test-db-key', fetchImpl: async url => Response.json(url.pathname.endsWith('matzip_sessions')
      ? [{ user_id: 'tester', confirmed_until: null }] : [{ id: 'tester', name: '테스트', email: 'test@example.invalid', created_at: new Date().toISOString() }]) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, cookie = `matzip_session=${'a'.repeat(64)}`;
  const call = (body, headers = {}) => fetch(base + '/api/restaurants/rank', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/api/restaurants/rank')).status, 405);
  assert.equal((await call({ mode: 'rating', restaurants: sample }, { Cookie: '' })).status, 401);
  assert.equal((await call({}, { Origin: 'https://elsewhere.example' })).status, 403);
  for (const body of [{ mode: '../evil', restaurants: [] }, { mode: 'rating', restaurants: [sample[0], sample[0]] }, { mode: 'rating', restaurants: Array(1001).fill(sample[0]) }]) {
    assert.equal((await call(body)).status, 400);
  }
  const originals = sample.map(item => ({ ...item, photos: ['unchanged'], name: '식당', address: '주소' }));
  const ranked = await requestRestaurantRanking(originals, 'recommended', { fetchImpl: (url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(body.restaurants.every(item => !('name' in item) && !('photos' in item) && !('address' in item)));
    return fetch(base + url, { ...options, headers: { ...options.headers, Origin: base, Cookie: cookie } });
  } });
  assert.equal(ranked.restaurants[0], originals[1]);
  assert.equal(ranked.restaurants.at(-1), originals[3]);
  assert.equal(originals[0].score, undefined);
  assert.equal(googleCalls, 0);
  const response = await call({ mode: 'rating', restaurants: sample });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(await response.json()).includes('test-db-key'));
  for (const file of ['/server/restaurant-ranking.js', '/algorithm-java/out/WebRankingMain.class', '/.java-runtime/bin/java']) assert.equal((await fetch(base + file)).status, 404);
});

test('정렬 실패·실행 제한·취소를 명시하고 손상된 Java 응답을 거부한다', { skip: !compiled }, async () => {
  await assert.rejects(createRestaurantRanking({ command: 'missing-java-runtime-test' })({ mode: 'rating', restaurants: sample }), error => error.status === 503);
  const limited = createRestaurantRanking({ maxConcurrent: 1, timeout: 1 });
  const running = assert.rejects(limited({ mode: 'rating', restaurants: sample }), error => error.status === 504);
  await assert.rejects(limited({ mode: 'rating', restaurants: sample }), error => error.status === 429);
  await running;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createRestaurantRanking()({ mode: 'rating', restaurants: sample }, { signal: controller.signal }), error => error.status === 499);
  assert.throws(() => parseRankingOutput('MATZIP_RANK_V1\t2\nQQ==\tnull\nQQ==\tnull\n', sample.slice(0, 2), 'rating'));
  assert.throws(() => parseRankingOutput('MATZIP_RANK_V1\t1\nQQ==\tNaN\n', sample.slice(0, 1), 'recommended'));
});

test('검색순 복원은 API 없이 원본을 반환하고 브라우저는 누락·중복 ID 응답을 거부한다', async () => {
  const search = await requestRestaurantRanking(sample, 'search', { fetchImpl: () => { throw new Error('호출하면 안 됨'); } });
  assert.equal(search.restaurants, sample);
  for (const items of [[{ id: 'A', score: null }], sample.map(() => ({ id: 'A', score: null }))]) {
    await assert.rejects(requestRestaurantRanking(sample, 'rating', { fetchImpl: async () => Response.json({ mode: 'rating', items }) }), /정렬 결과/);
  }
});
