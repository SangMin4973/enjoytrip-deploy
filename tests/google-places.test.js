import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlaces } from '../server/google-places.js';
import { makeServer } from '../server.mjs';
import { validatePost } from '../js/board-schema.js';
import * as store from '../js/restaurant-store.js';
import { ratingText } from '../js/google-places.js';

const photoName = 'places/ChIJtest/photos/photo_123';
const place = { id: 'ChIJtest', displayName: { text: '연결 식당' }, formattedAddress: '부산 해운대구', location: { latitude: 35.15, longitude: 129.14 },
  rating: 4.4, userRatingCount: 442, nationalPhoneNumber: '051-000-0000', googleMapsUri: 'https://maps.google.com/?cid=123',
  photos: [{ name: photoName, widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: '사진 작성자', uri: 'https://maps.google.com/contrib/123' }] }],
};
const key = 'private-google-key';

test('Google 검색은 한국어 음식점·15개와 필요한 필드만 요청하고 공급자 순서를 유지한다', async () => {
  const calls = [];
  const google = createGooglePlaces({ key, fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ places: [place, { ...place, id: 'ChIJother', rating: 5 }, place], nextPageToken: 'next-token' }); } });
  const result = await google.search(' 해운대 삼계탕 ', 'page-two');
  assert.equal(calls[0].url.href, 'https://places.googleapis.com/v1/places:searchText');
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'], key);
  assert.ok(!calls[0].url.href.includes(key));
  assert.deepEqual(JSON.parse(calls[0].options.body), { textQuery: '해운대 삼계탕', languageCode: 'ko', regionCode: 'KR', includedType: 'restaurant', strictTypeFiltering: true, pageSize: 15, pageToken: 'page-two' });
  assert.match(calls[0].options.headers['X-Goog-FieldMask'], /places.rating,places.userRatingCount/);
  assert.ok(!calls[0].options.headers['X-Goog-FieldMask'].includes('reviews'));
  assert.deepEqual(result.restaurants.map(item => item.id), ['google-ChIJtest', 'google-ChIJother']);
  assert.equal(result.restaurants[0].rating, 4.4); assert.equal(result.restaurants[0].userRatingCount, 442);
  assert.equal(result.nextPageToken, 'next-token');
  assert.equal(result.restaurants[0].photos[0].attributions[0].name, '사진 작성자');
  assert.ok(!JSON.stringify(result).includes(key));
  assert.equal((await google.search('같은 검색')).restaurants.length, 2);
  assert.equal(calls.length, 2, 'Google 검색 결과를 영구 캐시하지 않는다');
});

test('별점·사진 없음과 빈 결과를 그대로 반환하고 잘못된 좌표·검색 조건을 거부한다', async () => {
  const google = createGooglePlaces({ key, fetchImpl: async () => Response.json({ ...place, rating: undefined, photos: undefined, userRatingCount: undefined }) });
  const details = await google.details('ChIJtest'); assert.equal(details.rating, null); assert.equal(details.userRatingCount, 0); assert.deepEqual(details.photos, []);
  assert.deepEqual(await createGooglePlaces({ key, fetchImpl: async () => Response.json({}) }).search('없는 가게'), { restaurants: [], nextPageToken: null });
  await assert.rejects(google.search(''), error => error.status === 400);
  await assert.rejects(google.search('가'.repeat(201)), error => error.status === 400);
  await assert.rejects(google.details('../private'), error => error.status === 400);
  await assert.rejects(createGooglePlaces({ key, fetchImpl: async () => Response.json({ ...place, location: { latitude: 91, longitude: 1 } }) }).details('ChIJtest'), error => error.code === 'INVALID_RESPONSE');
});

test('인증·할당량·타임아웃·손상 응답을 구분하며 비밀 오류 본문을 전달하지 않는다', async () => {
  for (const [status, code] of [[403, 'ACCESS_DENIED'], [429, 'QUOTA_EXCEEDED'], [404, 'NOT_FOUND'], [400, 'INVALID_REQUEST'], [500, 'PROVIDER_ERROR']]) {
    await assert.rejects(createGooglePlaces({ key, fetchImpl: async () => Response.json({ error: { message: key } }, { status }) }).search('식당'), error => error.code === code && !error.message.includes(key));
  }
  await assert.rejects(createGooglePlaces({ key: '' }).search('식당'), error => error.code === 'MISSING_CONFIG');
  await assert.rejects(createGooglePlaces({ key, fetchImpl: async () => { throw new DOMException(key, 'TimeoutError'); } }).search('식당'), error => error.code === 'TIMEOUT' && !error.message.includes(key));
  await assert.rejects(createGooglePlaces({ key, fetchImpl: async () => new Response('not json') }).search('식당'), error => error.code === 'INVALID_RESPONSE');
});

test('사진 중계는 키 없는 서명 URL만 사용하고 변조·만료·잘못된 콘텐츠를 거부한다', async () => {
  let time = 1000000, calls = 0;
  const google = createGooglePlaces({ key, now: () => time, fetchImpl: async url => {
    calls++; return url.pathname.endsWith('/media') ? new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg' } }) : Response.json(place);
  } });
  const result = await google.details('ChIJtest'), url = new URL(result.photos[0].thumbnail, 'http://localhost');
  const image = await google.photo(url.searchParams); assert.equal(image.contentType, 'image/jpeg'); assert.equal(image.data.length, 3);
  assert.ok(!url.href.includes(key));
  const tampered = new URLSearchParams(url.search); tampered.set('name', photoName + 'changed');
  await assert.rejects(google.photo(tampered), error => error.code === 'EXPIRED_PHOTO');
  tampered.set('name', 'https://private.example/secret'); await assert.rejects(google.photo(tampered), error => error.status === 400);
  time += 901000; await assert.rejects(google.photo(url.searchParams), error => error.code === 'EXPIRED_PHOTO');
  assert.equal(calls, 2, '변조·만료 요청은 Google 호출 전에 거부한다');
});

test('유료 Google 조회는 로그인해야 하며 사진·설정·정적 경로로 키를 노출하지 않는다', async t => {
  let calls = 0;
  const server = makeServer({ googlePlacesOptions: { key, fetchImpl: async url => { calls++; return url.pathname.endsWith('/media') ? new Response(new Uint8Array([255, 216]), { headers: { 'Content-Type': 'image/jpeg' } }) : Response.json(url.pathname.endsWith('searchText') ? { places: [place] } : place); } },
    sharedDbOptions: { url: 'https://example.supabase.co', key: 'private-db-key', fetchImpl: async url => Response.json(url.pathname.endsWith('matzip_sessions') ? [{ user_id: 'tester', confirmed_until: null }] : [{ id: 'tester', name: '검증', email: 'test@example.invalid', created_at: new Date().toISOString() }]) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, headers = { Cookie: `matzip_session=${'a'.repeat(64)}` };
  assert.equal((await fetch(base + '/api/google/places/search?q=식당')).status, 401); assert.equal(calls, 0);
  const search = await fetch(base + '/api/google/places/search?q=식당', { headers }); assert.equal(search.status, 200); assert.equal(search.headers.get('cache-control'), 'no-store');
  const body = await search.text(); assert.ok(!body.includes(key)); const restaurant = JSON.parse(body).restaurants[0];
  const photo = await fetch(base + restaurant.photos[0].thumbnail); assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/jpeg'); assert.equal(photo.headers.get('cache-control'), 'no-store');
  const config = await (await fetch(base + '/api/config')).text(); assert.equal(JSON.parse(config).googlePlacesConfigured, true); assert.ok(!config.includes(key));
  for (const path of ['/server/google-places.js', '/.env']) assert.equal((await fetch(base + path)).status, 404);
});

test('Google 후기는 사용자 글·별점과 Google 장소 ID만 보관하고 외부 정보를 복제하지 않는다', () => {
  const result = validatePost({ type: 'review', subject: '방문 후기', content: '직접 남긴 후기', rating: 5, restaurant: { id: 'google-ChIJtest', name: 'Google 제공 가게명', address: 'Google 제공 주소', rating: 4.4, photos: [photoName] } });
  assert.deepEqual(result.restaurant, { id: 'google-ChIJtest', name: 'Google Maps 장소', address: '' });
  assert.equal(result.rating, 5); assert.ok(!JSON.stringify(result).includes(photoName));
});

test('Google 북마크는 ID만 저장하고 장소·사진·별점은 현재 화면 메모리에만 둔다', () => {
  const saved = new Map();
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const restaurant = { id: 'google-ChIJtest', source: 'google', name: '외부 제공 가게명', rating: 4.4, photos: [photoName] };
  store.saveRestaurants([restaurant]);
  const group = store.createBookmark('tester', '내 목록'); store.setBookmarkRestaurant('tester', group.id, restaurant.id, true);
  assert.equal(store.loadRestaurants().find(item => item.id === restaurant.id).name, restaurant.name);
  const persisted = [...saved.values()].join('');
  assert.ok(persisted.includes(restaurant.id)); assert.ok(!persisted.includes(restaurant.name)); assert.ok(!persisted.includes(photoName));
  assert.match(ratingText({ ...restaurant, userRatingCount: 442 }), /4\.4.*442/);
  assert.match(ratingText({ ...restaurant, rating: null }), /평가 없음/);
});
