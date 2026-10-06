import { loadRestaurants, loadBookmarks } from './restaurant-store.js';

export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export const kindLabel = post => ({ review: '음식점 후기', bookmark: '북마크 공유' }[post.type] || '이야기');
export function contextSearchText(post) {
  return [post.restaurant?.name, post.restaurant?.address, post.bookmark?.name,
    ...(post.bookmark?.restaurants || []).flatMap(item => [item.name, item.address])].filter(Boolean).join(' ');
}

export function postSummary(post) {
  const summary = node('div', 'post-summary');
  summary.append(node('span', 'post-kind', kindLabel(post)));
  if (post.type === 'review') {
    summary.append(node('span', '', post.restaurant.name), node('span', 'post-rating', `${'★'.repeat(post.rating)}${'☆'.repeat(5 - post.rating)} ${post.rating}/5`));
  } else if (post.type === 'bookmark') {
    summary.append(node('span', '', `${post.bookmark.name} · 맛집 ${post.bookmark.restaurants.length}곳`));
  }
  summary.append(node('span', '', `댓글 ${post.comment_count ?? (post.comments || []).length}`));
  return summary;
}

function placeCard(restaurant) {
  const card = node('div', 'shared-restaurant');
  card.append(node('strong', '', restaurant.name), node('p', '', restaurant.address || '주소 미등록'));
  if (/^kakao-\d+$/.test(restaurant.id)) {
    const link = node('a', '', '카카오맵에서 가게 보기 ↗');
    link.href = `https://place.map.kakao.com/${restaurant.id.slice(6)}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
  }
  return card;
}

export function renderPostContext(post, box) {
  box.replaceChildren(); box.hidden = !['review', 'bookmark'].includes(post.type);
  if (box.hidden) return;
  if (post.type === 'review') {
    box.append(node('h3', '', `내 별점 ${'★'.repeat(post.rating)}${'☆'.repeat(5 - post.rating)} · ${post.rating}/5`), placeCard(post.restaurant));
  } else {
    box.append(node('h3', '', `${post.bookmark.name} · 맛집 ${post.bookmark.restaurants.length}곳`),
      node('p', 'context-hint', '글을 작성할 때의 맛집 목록이에요. 원래 북마크를 바꿔도 이 글의 목록은 유지됩니다.'));
    post.bookmark.restaurants.forEach(item => box.append(placeCard(item)));
  }
}

export function initializeContextEditor(container, user, post = null) {
  const catalog = loadRestaurants(), bookmarks = user ? loadBookmarks(user.id) : [];
  const params = new URLSearchParams(location.search);
  container.className = 'post-context-editor';
  container.append(node('h2', '', '어떤 이야기를 나눌까요?'));
  function selectField(id, title) {
    const field = node('div', 'editor-field'), label = node('label', '', title), select = node('select');
    label.htmlFor = id; select.id = id; field.append(label, select); container.append(field);
    return select;
  }
  function option(select, value, text) { const option = node('option', '', text); option.value = value; select.append(option); }
  const type = selectField('post-type', '글 종류');
  option(type, 'review', '음식점 후기 · 별점과 코멘트');
  option(type, 'bookmark', '북마크 공유 · 나의 맛집 목록');
  if (post && !post.type) option(type, 'story', '기존 이야기');
  const restaurant = selectField('post-restaurant', '후기를 남길 음식점');
  option(restaurant, '', '검색하거나 북마크에 담은 음식점을 선택해 주세요');
  const candidates = new Map(catalog.map(item => [item.id, item]));
  if (post?.restaurant) candidates.set(post.restaurant.id, post.restaurant);
  candidates.forEach(item => option(restaurant, item.id, `${item.name} · ${item.address}`));
  const hint = node('p', 'context-hint', '원하는 가게가 없으면 맛집 찾기에서 먼저 검색해 주세요.');
  const search = node('a', 'board-button small', '맛집 찾기 →'); search.href = '/index.html#home';
  restaurant.parentElement.append(hint, search);
  const rating = node('fieldset', 'rating-picker');
  rating.append(node('legend', '', '내 별점 · 1~5점'));
  const ratings = node('div', 'rating-options');
  for (let value = 1; value <= 5; value++) {
    const label = node('label'), radio = node('input'); radio.type = 'radio'; radio.name = 'rating'; radio.value = String(value);
    label.append(radio, node('span', '', `★ ${value}점`)); ratings.append(label);
  }
  rating.append(ratings); container.append(rating);
  const bookmark = selectField('post-bookmark', '공유할 내 북마크');
  option(bookmark, '', bookmarks.length ? '공유할 북마크를 선택해 주세요' : '아직 내 북마크가 없어요');
  bookmarks.forEach(item => option(bookmark, item.id, `${item.name} · 맛집 ${item.restaurantIds.length}곳`));
  if (post?.bookmark) option(bookmark, '__snapshot__', `기존 공유 목록 유지 · ${post.bookmark.name}`);
  const preview = node('div'); container.append(preview);
  bookmark.addEventListener('change', showPreview);
  function bookmarkValue() {
    if (bookmark.value === '__snapshot__') return post.bookmark;
    const selected = bookmarks.find(item => item.id === bookmark.value);
    if (!selected) return null;
    return { id: selected.id, name: selected.name, restaurants: selected.restaurantIds.map(id => candidates.get(id)).filter(Boolean) };
  }
  function showPreview() {
    preview.replaceChildren();
    const value = bookmarkValue();
    if (type.value === 'bookmark' && value) {
      preview.append(node('p', 'context-hint', '선택한 북마크에 들어 있는 가게를 공유합니다.'));
      value.restaurants.forEach(item => preview.append(placeCard(item)));
      if (!value.restaurants.length) preview.append(node('p', 'context-hint', '이 북마크에는 공유할 실제 음식점이 없어요. 먼저 가게를 담아주세요.'));
    }
  }
  function toggle() {
    const review = type.value === 'review', share = type.value === 'bookmark';
    restaurant.parentElement.hidden = !review; rating.hidden = !review; bookmark.parentElement.hidden = !share;
    restaurant.required = review; bookmark.required = share;
    ratings.querySelectorAll('input').forEach(input => { input.required = review; input.disabled = !review; });
    showPreview();
  }
  type.addEventListener('change', toggle);
  type.value = post ? post.type || 'story' : params.get('type') === 'bookmark' ? 'bookmark' : 'review';
  restaurant.value = post?.restaurant?.id || params.get('restaurant') || '';
  bookmark.value = post?.bookmark ? '__snapshot__' : params.get('bookmark') || '';
  const chosen = ratings.querySelector(`input[value="${post?.rating || 5}"]`); if (chosen) chosen.checked = true;
  toggle();
  return () => {
    if (type.value === 'review') return { type: 'review', restaurant: candidates.get(restaurant.value), rating: Number(ratings.querySelector('input:checked')?.value) };
    if (type.value === 'bookmark') return { type: 'bookmark', bookmark: bookmarkValue() };
    return { type: undefined };
  };
}
