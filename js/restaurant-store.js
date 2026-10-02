import { readStorage, writeStorage } from './storage.js';
import { createExampleRestaurants } from './restaurant-data.js';

// 예시 음식점과 검색 상태는 공통 저장소, 북마크는 회원 아이디별로 분리합니다.
export function loadRestaurants() {
  const existing = readStorage('restaurantCatalog', null);
  if (existing !== null) {
    if (!Array.isArray(existing)) throw new Error('음식점 저장 데이터의 형식이 올바르지 않습니다.');
    return existing;
  }
  const restaurants = createExampleRestaurants();
  writeStorage('restaurantCatalog', restaurants);
  return restaurants;
}

export function saveRestaurantImages(restaurants) {
  writeStorage('restaurantCatalog', restaurants);
}

export function loadView() {
  return readStorage('restaurantView', { source: 'search', region: '', menu: '', bookmarkId: null, selectedId: null });
}

export function saveView(view) { writeStorage('restaurantView', view); }

function groups() {
  const value = readStorage('restaurantBookmarks', {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('북마크 저장 데이터의 형식이 올바르지 않습니다.');
  return value;
}

export function loadBookmarks(userId) {
  const all = groups();
  const items = Object.hasOwn(all, userId) ? all[userId] : [];
  if (!Array.isArray(items)) throw new Error('북마크 목록의 형식이 올바르지 않습니다.');
  return items;
}

function saveBookmarks(userId, items) {
  writeStorage('restaurantBookmarks', { ...groups(), [userId]: items });
}

export function createBookmark(userId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 40) throw new Error('북마크 이름을 1~40자로 입력해 주세요.');
  const current = loadBookmarks(userId);
  if (current.some(item => item.name.toLocaleLowerCase('ko-KR') === trimmed.toLocaleLowerCase('ko-KR'))) throw new Error('같은 이름의 북마크가 있습니다.');
  const bookmark = { id: crypto.randomUUID(), name: trimmed, restaurantIds: [], createdAt: new Date().toISOString() };
  // 추가한 북마크는 기존 목록 아래에 놓아 생성 순서를 보존합니다.
  saveBookmarks(userId, [...current, bookmark]);
  return bookmark;
}

export function setBookmarkRestaurant(userId, bookmarkId, restaurantId, checked) {
  const current = loadBookmarks(userId);
  if (!current.some(item => item.id === bookmarkId)) throw new Error('북마크를 찾지 못했습니다.');
  const updated = current.map(item => {
    if (item.id !== bookmarkId) return item;
    const ids = new Set(item.restaurantIds);
    if (checked) ids.add(restaurantId); else ids.delete(restaurantId);
    return { ...item, restaurantIds: [...ids] };
  });
  saveBookmarks(userId, updated);
}

export function removeUserBookmarks(userId) {
  const current = groups();
  const { [userId]: removed, ...remaining } = current;
  writeStorage('restaurantBookmarks', remaining);
}
