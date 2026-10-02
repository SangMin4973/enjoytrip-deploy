import test from 'node:test';
import assert from 'node:assert/strict';
import { createExampleRestaurants, filterRestaurants } from '../js/restaurant-data.js';
import * as store from '../js/restaurant-store.js';
import * as auth from '../js/auth.js';

// UI 구현과 독립된 저장소 검사입니다. 실제 브라우저의 회원 데이터를 사용하지 않습니다.
const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};

test('지역만 검색하거나 메뉴 동의어를 추가해 예시 음식점을 조회한다', () => {
  const restaurants = createExampleRestaurants();
  assert.equal(restaurants.length, 24);
  assert.ok(restaurants.every(item => item.isExample && item.videos.length <= 5));
  assert.equal(filterRestaurants(restaurants, ' 광주 ').length, 6);
  assert.equal(filterRestaurants(restaurants, '광주광역시', '통닭').length, 1);
  assert.equal(filterRestaurants(restaurants, '부산', '고기').length, 2);
  assert.equal(filterRestaurants(restaurants, '없는지역').length, 0);
});

test('예시 음식점 최초 저장 이후 기존 내용을 덮어쓰지 않는다', () => {
  saved.clear();
  const restaurants = store.loadRestaurants();
  restaurants[0].name = '수정된 예시'; store.saveRestaurantImages(restaurants);
  assert.equal(store.loadRestaurants()[0].name, '수정된 예시');
  saved.set('enjoytrip.base.restaurantCatalog', '{}');
  assert.throws(() => store.loadRestaurants(), /형식/);
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
