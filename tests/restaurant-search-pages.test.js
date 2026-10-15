import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGoogleRestaurants, restaurantPage } from '../js/google-places.js';

const places = (start, count) => Array.from({ length: count }, (_, index) => ({
  id: `google-place${start + index}`, name: `음식점 ${start + index}`, rating: (start + index) % 2 ? 3 : 5,
}));

test('Google 결과를 3페이지까지 모아 중복 제거 후 원래 순서로 나누며 화면 이동은 재검색하지 않는다', async t => {
  const requests = [], progress = [];
  const responses = [
    { restaurants: places(1, 15), nextPageToken: 'second' },
    { restaurants: places(15, 15), nextPageToken: 'third' },
    { restaurants: places(29, 15), nextPageToken: 'fourth' },
  ];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ url: new URL(path, 'http://localhost'), options });
    return Response.json(responses[requests.length - 1]);
  });
  const result = await collectGoogleRestaurants(' 해운대 ', '', { onProgress: item => progress.push(item) });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(item => item.url.searchParams.get('pageToken')), [null, 'second', 'third']);
  assert.ok(requests.every(item => item.url.searchParams.get('q') === '해운대 음식점' && item.options.credentials === 'same-origin'));
  assert.deepEqual(result.restaurants.map(item => item.id), places(1, 43).map(item => item.id));
  assert.equal(result.restaurants[0].rating, 3, '높은 별점을 앞으로 정렬하지 않는다');
  assert.equal(result.pagesFetched, 3); assert.equal(result.truncated, true);
  assert.deepEqual(progress, [{ pagesFetched: 1, count: 15 }, { pagesFetched: 2, count: 29 }, { pagesFetched: 3, count: 43 }]);
  const first = restaurantPage(result.restaurants, 1), second = restaurantPage(result.restaurants, 2), last = restaurantPage(result.restaurants, 3);
  assert.deepEqual([first.restaurants.length, second.restaurants.length, last.restaurants.length], [15, 15, 13]);
  assert.equal(first.hasPrevious, false); assert.equal(first.hasNext, true);
  assert.equal(last.hasPrevious, true); assert.equal(last.hasNext, false); assert.equal(last.totalPages, 3); assert.equal(last.total, 43);
  assert.deepEqual(restaurantPage(result.restaurants, 1).restaurants, first.restaurants);
  assert.equal(requests.length, 3, '다음·이전 화면 페이지 계산에 검색 요청을 추가하지 않는다');
});

test('다음 토큰이 없으면 조기 종료하고 빈 결과·짧은 마지막 페이지·복원 페이지 범위를 처리한다', async () => {
  for (const count of [0, 1, 15]) {
    let calls = 0;
    const result = await collectGoogleRestaurants('서울', '', { searchPage: async () => { calls++; return { restaurants: places(1, count), nextPageToken: null }; } });
    assert.equal(calls, 1); assert.equal(result.truncated, false);
    const page = restaurantPage(result.restaurants, 3);
    assert.equal(page.page, 1); assert.equal(page.hasNext, false); assert.equal(page.hasPrevious, false); assert.equal(page.restaurants.length, count);
  }
  const items = places(1, 16);
  assert.equal(restaurantPage(items, 99).page, 2);
  assert.equal(restaurantPage(items, -1).page, 1);
  assert.equal(restaurantPage(items, 'bad').page, 1);
  assert.deepEqual(restaurantPage(items, 2).restaurants, items.slice(15));
  assert.equal(items.length, 16, '페이지 분할은 전체 원본을 바꾸지 않는다');
});

test('공급자가 같은 다음 토큰을 반복하면 추가 호출을 중단한다', async () => {
  let calls = 0;
  const result = await collectGoogleRestaurants('부산', '', { searchPage: async () => ({ restaurants: places(++calls, 1), nextPageToken: 'same' }) });
  assert.equal(calls, 2); assert.equal(result.truncated, true); assert.equal(result.restaurants.length, 2);
});

test('나중 페이지의 조회 실패를 성공한 전체 결과로 숨기지 않으며 다시 검색할 수 있다', async () => {
  let calls = 0;
  await assert.rejects(collectGoogleRestaurants('부산', '', { searchPage: async () => {
    if (++calls === 2) throw new Error('공급자 연결 실패');
    return { restaurants: places(1, 15), nextPageToken: 'second' };
  } }), /공급자 연결 실패/);
  const retry = await collectGoogleRestaurants('부산', '', { searchPage: async () => ({ restaurants: places(1, 1) }) });
  assert.equal(retry.restaurants.length, 1);
});

test('화면 이동·새 검색으로 이전 요청이 무효화되면 남은 페이지를 조회하거나 진행 상태를 갱신하지 않는다', async () => {
  let current = true, calls = 0, progress = 0;
  await assert.rejects(collectGoogleRestaurants('부산', '', {
    isCurrent: () => current,
    searchPage: async () => { calls++; current = false; return { restaurants: places(1, 15), nextPageToken: 'second' }; },
    onProgress: () => progress++,
  }), error => error.name === 'AbortError');
  assert.equal(calls, 1); assert.equal(progress, 0);
  calls = 0;
  await assert.rejects(collectGoogleRestaurants('부산', '', { isCurrent: () => false, searchPage: async () => { calls++; } }), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});
