import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRestaurant, searchWithPlaces } from '../js/restaurant-api.js';
import * as store from '../js/restaurant-store.js';
import * as auth from '../js/auth.js';

// UI 구현과 독립된 저장소 검사입니다. 실제 브라우저의 회원 데이터를 사용하지 않습니다.
const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};

const place = { id: '12345', place_name: '검색 응답 음식점', category_group_code: 'FD6', category_name: '음식점 > 한식', phone: '', address_name: '서울 종로구', road_address_name: '서울 종로구 종로 1', x: '126.98', y: '37.57' };

test('카카오 실제 응답의 도로명·좌표·ID를 사용하고 없는 사진·별점·영상을 만들지 않는다', () => {
  const restaurant = normalizeRestaurant(place);
  assert.equal(restaurant.id, 'kakao-12345');
  assert.equal(restaurant.address, place.road_address_name);
  assert.equal(restaurant.longitude, 126.98);
  assert.equal(restaurant.placeUrl, 'https://place.map.kakao.com/12345');
  assert.equal(restaurant.phone, '');
  for (const field of ['rating', 'image', 'videos', 'googleResults']) assert.equal(Object.hasOwn(restaurant, field), false);
  assert.equal(normalizeRestaurant({ ...place, road_address_name: '' }).address, place.address_name);
  assert.throws(() => normalizeRestaurant({ ...place, x: 'bad' }), /형식/);
  assert.throws(() => normalizeRestaurant({ ...place, y: '' }), /형식/);
});

test('실제 카탈로그는 이전 더미·회원 북마크를 보존하고 여러 검색의 장소를 ID로 합친다', () => {
  saved.clear();
  const legacy = JSON.stringify([{ id: 'example-0-0', name: '이전 더미' }]);
  saved.set('enjoytrip.base.restaurantCatalog', legacy);
  const group = store.createBookmark('member', '기존 북마크');
  store.setBookmarkRestaurant('member', group.id, 'example-0-0', true);
  assert.deepEqual(store.loadRestaurants(), []);
  store.saveRestaurants([normalizeRestaurant(place)]);
  store.saveRestaurants([normalizeRestaurant({ ...place, place_name: '갱신한 이름' }), normalizeRestaurant({ ...place, id: '67890' })]);
  assert.equal(store.loadRestaurants().length, 2);
  assert.equal(store.loadRestaurants()[0].name, '갱신한 이름');
  assert.equal(saved.get('enjoytrip.base.restaurantCatalog'), legacy);
  assert.deepEqual(store.loadBookmarks('member')[0].restaurantIds, ['example-0-0']);
  saved.set('enjoytrip.base.kakaoRestaurantCatalog', '{}');
  assert.throws(() => store.loadRestaurants(), /형식/);
});

test('음식점 카테고리로 지역·메뉴를 검색하고 페이지 정보와 실제 후보만 반환한다', async () => {
  let request;
  const services = { Status: { OK: 'OK', ZERO_RESULT: 'ZERO' }, Places: class {
    keywordSearch(query, callback, options) {
      request = { query, options };
      callback([place, place, { ...place, id: '9', category_group_code: 'CE7' }], 'OK', { totalCount: 80, hasNextPage: true });
    }
  } };
  const result = await searchWithPlaces(services, ' 부산 ', ' 치킨 ', 2);
  assert.deepEqual(request, { query: '부산 치킨', options: { category_group_code: 'FD6', size: 15, page: 2 } });
  assert.equal(result.restaurants.length, 1); assert.equal(result.total, 80); assert.equal(result.hasNext, true);
  assert.equal((await searchWithPlaces(services, '부산', '', 3)).hasNext, false);
  assert.equal(request.query, '부산 음식점');
  await assert.rejects(searchWithPlaces(services, '  '), /지역/);
  await assert.rejects(searchWithPlaces(services, '부산', '', 4), /페이지/);
});

test('빈 검색은 빈 목록이고 연결 실패·시간 초과는 더미로 대체하지 않는다', async () => {
  const makeServices = status => ({ Status: { OK: 'OK', ZERO_RESULT: 'ZERO' }, Places: class {
    keywordSearch(query, callback) { if (status) callback([], status); }
  } });
  assert.deepEqual((await searchWithPlaces(makeServices('ZERO'), '없는지역')).restaurants, []);
  await assert.rejects(searchWithPlaces(makeServices('ERROR'), '부산'), /검색에 실패/);
  await assert.rejects(searchWithPlaces(makeServices(null), '부산', '', 1, { timeoutMs: 5 }), /시간이 초과/);
});

test('검색어·선택 음식점·북마크 출처가 새로고침용 상태로 보존된다', () => {
  saved.clear();
  const view = { source: 'bookmark', region: '', menu: '', bookmarkId: 'folder-1', selectedId: 'example-0-0' };
  store.saveView(view); assert.deepEqual(store.loadView(), view);
});

test('북마크의 회원 분리, 이름 검증과 생성 순서를 유지한다', () => {
  saved.clear();
  const first = store.createBookmark('memberA', ' 광주 맛집 ');
  const second = store.createBookmark('memberA', '부산 맛집');
  assert.deepEqual(store.loadBookmarks('memberA').map(item => item.id), [first.id, second.id]);
  assert.equal(store.loadBookmarks('memberA')[0].name, '광주 맛집');
  assert.deepEqual(store.loadBookmarks('memberB'), []);
  assert.throws(() => store.createBookmark('memberA', '광주 맛집'), /같은 이름/);
  assert.throws(() => store.createBookmark('memberA', '   '), /1~40/);
  assert.throws(() => store.createBookmark('memberA', '가'.repeat(41)), /1~40/);
});

test('체크한 여러 북마크에 중복 없이 저장하고 해제한 북마크에서만 뺀다', () => {
  saved.clear();
  const a = store.createBookmark('member', '한식'), b = store.createBookmark('member', '광주');
  store.setBookmarkRestaurant('member', a.id, 'example-0-0', true);
  store.setBookmarkRestaurant('member', a.id, 'example-0-0', true);
  store.setBookmarkRestaurant('member', b.id, 'example-0-0', true);
  assert.deepEqual(store.loadBookmarks('member').map(item => item.restaurantIds), [['example-0-0'], ['example-0-0']]);
  store.setBookmarkRestaurant('member', a.id, 'example-0-0', false);
  assert.deepEqual(store.loadBookmarks('member').map(item => item.restaurantIds), [[], ['example-0-0']]);
  assert.throws(() => store.setBookmarkRestaurant('member', 'missing', 'example-0-0', true), /찾지 못/);
});

test('탈퇴 회원 북마크만 삭제하고 다른 회원의 북마크를 보존한다', () => {
  saved.clear();
  store.createBookmark('memberA', '내 맛집'); store.createBookmark('memberB', '다른 맛집');
  store.removeUserBookmarks('memberA');
  assert.deepEqual(store.loadBookmarks('memberA'), []);
  assert.equal(store.loadBookmarks('memberB').length, 1);
});

test('마이페이지 확인은 비밀번호를 검증하고 세션 기간을 바꾸지 않는다', async () => {
  saved.clear();
  await auth.register({ id: 'pageuser', name: '여행자', email: 'page@example.com', password: 'example123!' });
  await auth.login('pageuser', 'example123!');
  const expiry = saved.get('enjoytrip.base.sessionExpiresAt');
  assert.equal(auth.isMyPageConfirmed(), false);
  await assert.rejects(auth.confirmMyPage('incorrect123!'), /일치하지/);
  assert.equal(auth.isMyPageConfirmed(), false);
  await auth.confirmMyPage('example123!');
  assert.equal(auth.isMyPageConfirmed(), true);
  assert.equal(saved.get('enjoytrip.base.sessionExpiresAt'), expiry);
  assert.ok(!saved.get('enjoytrip.base.myPageAccess').includes('example123!'));
  auth.logout(); assert.equal(auth.isMyPageConfirmed(), false);
});

test('비밀번호 변경·재로그인·세션 만료 후에는 마이페이지를 다시 확인한다', async () => {
  saved.clear();
  await auth.register({ id: 'pageuser', name: '여행자', email: 'page@example.com', password: 'example123!' });
  await auth.login('pageuser', 'example123!'); await auth.confirmMyPage('example123!');
  await auth.updateProfile({ name: '여행자', email: 'page@example.com', password: 'changed123!' });
  assert.equal(auth.isMyPageConfirmed(), false);
  await auth.confirmMyPage('changed123!');
  await auth.login('pageuser', 'changed123!'); assert.equal(auth.isMyPageConfirmed(), false);
  await auth.confirmMyPage('changed123!');
  saved.set('enjoytrip.base.sessionExpiresAt', JSON.stringify(Date.now() - 1));
  assert.equal(auth.isMyPageConfirmed(), false);
});
