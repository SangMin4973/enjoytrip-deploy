import * as auth from './auth.js';
import * as store from './restaurant-store.js';
import { filterRestaurants } from './restaurant-data.js';
import { loadKakaoSdk } from './kakao-sdk.js';
import { LOGIN_MAP_CONFIG } from './map-config.js';

const $ = selector => document.querySelector(selector);

// DOM 생성 시 예시 데이터도 textContent로 넣어 검색어·북마크 이름이 HTML로 실행되지 않게 합니다.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initRestaurantApp() {
  const root = $('#explore');
  let restaurants = [], visibleRestaurants = [], view = store.loadView();
  let ready, map, mapLoading, mapStatus = 'pending', markers = [], markerButtons = [];
  let route = 'home', active = false, mapKey = LOGIN_MAP_CONFIG.appKey;
  let revision = 0, toastTimer, resizeTimer, bookmarkRestaurantId, confirmTarget = 'bookmarks';

  function toast(message) {
    const box = $('#explore-toast'); box.textContent = message; box.hidden = !message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 4000);
  }

  function member() {
    const user = auth.currentUser();
    if (!user) throw new Error('먼저 로그인해 주세요.');
    return user;
  }

  // 사용자가 제공한 음식 도트를 사진 자리의 예시 이미지로 표시하고 저장합니다.
  // 원본 PNG는 수정하지 않으며 실제 음식점 사진이라고 표시하지 않습니다.
  async function fillExampleImages() {
    if (restaurants.every(item => item.image)) return;
    const sprite = new Image();
    await new Promise((resolve, reject) => {
      sprite.onload = resolve; sprite.onerror = () => reject(new Error('음식 이미지를 불러오지 못했습니다.'));
      sprite.src = 'resources/food-login/food-reference.png';
    });
    const crops = [[76,98,370,377],[403,101,701,377],[742,139,1035,377],[1107,126,1372,378],[77,449,371,664],[421,453,710,682],[760,427,1028,704],[1091,424,1365,697],[78,754,371,1007],[444,778,661,967],[803,793,985,988]];
    const images = new Map();
    restaurants.forEach(item => {
      if (item.image) return;
      if (!images.has(item.imageCell)) {
        const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 180;
        const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
        context.fillStyle = '#ffe49a'; context.fillRect(0, 0, 180, 180);
        context.fillStyle = '#f5cb72';
        for (let x = 9; x < 180; x += 18) for (let y = 9; y < 180; y += 18) context.fillRect(x, y, 2, 2);
        const [x1, y1, x2, y2] = crops[item.imageCell];
        const width = x2 - x1 + 9, height = y2 - y1 + 9, scale = 143 / Math.max(width, height);
        context.drawImage(sprite, x1 - 4, y1 - 4, width, height, (180 - width * scale) / 2, (180 - height * scale) / 2, width * scale, height * scale);
        images.set(item.imageCell, canvas.toDataURL('image/png'));
      }
      item.image = images.get(item.imageCell);
    });
    store.saveRestaurantImages(restaurants);
  }

  async function ensureData() {
    if (!ready) ready = (async () => {
      restaurants = store.loadRestaurants();
      try { await fillExampleImages(); } catch (error) { toast(error.message); }
    })();
    await ready;
  }

  function savedIds() {
    return new Set(store.loadBookmarks(member().id).flatMap(item => item.restaurantIds));
  }

  function restaurantCard(restaurant) {
    const article = element('article', 'restaurant-card'); article.dataset.id = restaurant.id;
    article.classList.toggle('selected', restaurant.id === view.selectedId);
    const button = element('button', 'restaurant-card-content'); button.type = 'button';
    button.dataset.action = 'select'; button.dataset.id = restaurant.id;
    button.setAttribute('aria-label', `${restaurant.name} 인사이트 보기`);
    const image = element('img', 'restaurant-photo'); image.src = restaurant.image || 'resources/food-login/food-reference.png';
    image.alt = `${restaurant.menu} 예시 음식 이미지`; image.width = 102; image.height = 109;
    const text = element('div', 'restaurant-card-text');
    text.append(element('h3', '', restaurant.name), element('p', '', restaurant.phone), element('p', '', restaurant.address));
    const rating = element('p', 'restaurant-rating', `★ ${restaurant.rating.toFixed(1)} `);
    rating.append(element('span', '', `예시 · ${restaurant.reviewCount}개`)); text.append(rating);
    button.append(image, text);
    const saved = savedIds().has(restaurant.id);
    const star = element('button', `save-restaurant${saved ? ' saved' : ''}`, saved ? '★' : '☆');
    star.type = 'button'; star.dataset.action = 'save'; star.dataset.id = restaurant.id;
    star.setAttribute('aria-label', `${restaurant.name} 북마크 선택`); star.setAttribute('aria-pressed', String(saved));
    article.append(button, star);
    return article;
  }

  function renderList() {
    const list = $('#restaurant-list'), scrollTop = list.scrollTop;
    list.replaceChildren();
    if (view.source === 'bookmark') {
      const bookmark = store.loadBookmarks(member().id).find(item => item.id === view.bookmarkId);
      $('#results-source').textContent = '내 북마크';
      $('#results-heading').textContent = bookmark?.name || '북마크';
      visibleRestaurants = bookmark ? bookmark.restaurantIds.map(id => restaurants.find(item => item.id === id)).filter(Boolean) : [];
    } else {
      $('#results-source').textContent = '검색한 맛집';
      $('#results-heading').textContent = [view.region, view.menu].filter(Boolean).join(' · ') || '맛집 찾기';
      visibleRestaurants = view.region ? filterRestaurants(restaurants, view.region, view.menu) : [];
    }
    $('#results-count').textContent = `맛집 ${visibleRestaurants.length}곳 · 예시 정보`;
    if (!visibleRestaurants.length) {
      const empty = element('div', 'list-empty');
      empty.append(element('strong', '', view.source === 'bookmark' ? '아직 담긴 맛집이 없어요.' : '찾는 맛집이 없어요.'), element('p', '', view.source === 'bookmark' ? '음식점의 별표를 눌러 이 북마크에 담아보세요.' : '광주·부산·서울·제주 중 지역을 입력하거나 메뉴를 바꿔보세요.'));
      const back = element('a', '', '다시 맛집 찾기'); back.href = '#home'; empty.append(back); list.append(empty);
    } else visibleRestaurants.forEach(restaurant => list.append(restaurantCard(restaurant)));
    list.scrollTop = scrollTop;
    if (!visibleRestaurants.some(item => item.id === view.selectedId)) view.selectedId = null;
  }

  function setSearchLinks(restaurant) {
    const query = encodeURIComponent(`${restaurant.region} ${restaurant.name} ${restaurant.menu}`);
    $('#naver-search').href = `https://search.naver.com/search.naver?query=${query}`;
    $('#youtube-search').href = `https://www.youtube.com/results?search_query=${query}`;
    $('#google-search').href = `https://www.google.com/search?q=${query}`;
  }

  function renderInsights() {
    const restaurant = visibleRestaurants.find(item => item.id === view.selectedId);
    $('#restaurant-insights').hidden = !restaurant;
    root.classList.toggle('insights-open', !!restaurant);
    if (!restaurant) return;
    $('#insight-heading').textContent = restaurant.name;
    $('#insight-address').textContent = restaurant.address;
    $('#insight-description').textContent = restaurant.description;
    setSearchLinks(restaurant);
    const videos = restaurant.videos.slice(0, 5);
    $('#video-count').textContent = `${videos.length}개 / 최대 5개`;
    $('#video-list').replaceChildren();
    videos.forEach(video => {
      const card = element('button', 'video-card'); card.type = 'button';
      card.dataset.videoId = video.id; card.dataset.videoTitle = video.title;
      card.setAttribute('aria-label', `${video.title} 레시피 예시 영상 보기`);
      const thumbnail = element('div', 'video-thumb'), image = element('img');
      image.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`; image.alt = ''; image.loading = 'lazy';
      thumbnail.append(image);
      card.append(thumbnail, element('h4', '', video.title), element('p', '', `${video.creator} · 메뉴 레시피 예시`));
      $('#video-list').append(card);
    });
    $('#google-results').replaceChildren();
    restaurant.googleResults.forEach(result => {
      const item = element('article', 'google-result');
      item.append(element('span', '', '검색 내용 예시'), element('h4', '', result.title), element('p', '', result.text));
      $('#google-results').append(item);
    });
    $('#restaurant-insights .insight-scroll').scrollTop = 0;
  }

  // 목록을 새로 만들지 않고 선택 강조만 바꿔 스크롤 위치와 검색 결과를 유지합니다.
  function selectRestaurant(id) {
    if (!visibleRestaurants.some(item => item.id === id)) return;
    view.selectedId = id; store.saveView(view);
    $('#restaurant-list').querySelectorAll('.restaurant-card').forEach(card => card.classList.toggle('selected', card.dataset.id === id));
    renderInsights(); updateMarkerSelection(); requestAnimationFrame(focusMap);
  }

  function updateMarkerSelection() {
    markerButtons.forEach(({ id, button }) => button.classList.toggle('selected', id === view.selectedId));
  }

  function focusMap() {
    if (!map || !active || route === 'bookmarks') return;
    map.relayout();
    if (route === 'home') {
      map.setLevel(5); map.setCenter(new kakao.maps.LatLng(LOGIN_MAP_CONFIG.center.lat, LOGIN_MAP_CONFIG.center.lng));
      return;
    }
    const selected = visibleRestaurants.find(item => item.id === view.selectedId);
    if (selected) { map.setLevel(4); map.setCenter(new kakao.maps.LatLng(selected.latitude, selected.longitude)); return; }
    if (!visibleRestaurants.length) return;
    const bounds = new kakao.maps.LatLngBounds();
    visibleRestaurants.forEach(item => bounds.extend(new kakao.maps.LatLng(item.latitude, item.longitude)));
    map.setBounds(bounds);
    if (visibleRestaurants.length === 1) map.setLevel(4);
  }

  function renderMarkers() {
    if (!map) return;
    markers.forEach(marker => marker.setMap(null)); markers = []; markerButtons = [];
    if (route === 'results') visibleRestaurants.forEach((restaurant, index) => {
      const button = element('button', 'restaurant-map-pin', String(index + 1)); button.type = 'button';
      button.setAttribute('aria-label', `${restaurant.name} 인사이트 보기`);
      button.addEventListener('click', () => { try { selectRestaurant(restaurant.id); } catch (error) { toast(error.message); } });
      markerButtons.push({ id: restaurant.id, button });
      markers.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(restaurant.latitude, restaurant.longitude), content: button, yAnchor: 1.2, zIndex: restaurant.id === view.selectedId ? 5 : 2 }));
    });
    updateMarkerSelection(); focusMap();
  }

  async function ensureMap() {
    if (!mapLoading) mapLoading = (async () => {
      mapStatus = 'loading';
      try {
        await loadKakaoSdk(mapKey);
        map = new kakao.maps.Map($('#explore-map'), { center: new kakao.maps.LatLng(LOGIN_MAP_CONFIG.center.lat, LOGIN_MAP_CONFIG.center.lng), level: 5 });
        kakao.maps.event.addListener(map, 'tilesloaded', () => { mapStatus = 'ready'; root.classList.add('map-ready'); });
      } catch {
        mapStatus = 'unavailable'; $('#explore-map-message').textContent = '지도를 불러오지 못했어요. 잠시 후 새로고침해 주세요.'; $('#explore-map-message').hidden = false;
      }
    })();
    await mapLoading;
    if (active) renderMarkers();
  }

  function renderBookmarkOptions() {
    const user = member(), restaurant = restaurants.find(item => item.id === bookmarkRestaurantId);
    $('#bookmark-restaurant-name').textContent = restaurant?.name || '';
    const container = $('#bookmark-options'); container.replaceChildren();
    const bookmarks = store.loadBookmarks(user.id);
    if (!bookmarks.length) container.append(element('p', 'dialog-hint', '첫 북마크를 만들어 맛집을 담아보세요.'));
    bookmarks.forEach(bookmark => {
      const label = element('label', 'bookmark-option'), text = element('span');
      text.append(element('strong', '', bookmark.name), element('small', '', `맛집 ${bookmark.restaurantIds.length}곳`));
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.dataset.bookmarkId = bookmark.id;
      checkbox.checked = bookmark.restaurantIds.includes(bookmarkRestaurantId); checkbox.setAttribute('aria-label', `${bookmark.name}에 담기`);
      label.append(text, checkbox); container.append(label);
    });
  }

  function createBookmark() {
    // alert에는 입력란이 없으므로 사용자가 요청한 이름 입력창은 native prompt로 제공합니다.
    const name = window.prompt('새 북마크 이름을 입력해 주세요.', '');
    if (name === null) return;
    try {
      const bookmark = store.createBookmark(member().id, name);
      if ($('#save-bookmark-dialog').open) {
        renderBookmarkOptions(); $('#bookmark-options').scrollTop = $('#bookmark-options').scrollHeight;
      }
      if (route === 'bookmarks') renderMyBookmarks();
      toast(`${bookmark.name} 북마크를 만들었어요.`);
    } catch (error) { toast(error.message); }
  }

  function renderMyBookmarks() {
    const user = member(), bookmarks = store.loadBookmarks(user.id);
    $('#bookmark-owner').textContent = `${user.name}님이 담아둔 맛집을 다시 만나보세요.`;
    $('#bookmark-total').textContent = `(${bookmarks.length})`;
    const grid = $('#my-bookmarks'); grid.replaceChildren();
    if (!bookmarks.length) {
      const empty = element('div', 'bookmark-empty'), folder = element('span', 'pixel-folder'); folder.setAttribute('aria-hidden', 'true');
      empty.append(folder, element('h3', '', '아직 모아둔 맛집이 없어요.'), element('p', '', '북마크를 만들고 음식점의 별표를 눌러 담아보세요.')); grid.append(empty);
    }
    bookmarks.forEach(bookmark => {
      const button = element('button', 'bookmark-card'); button.type = 'button'; button.dataset.bookmarkId = bookmark.id;
      const folder = element('span', 'pixel-folder'); folder.setAttribute('aria-hidden', 'true');
      const text = element('div'); text.append(element('h3', '', bookmark.name), element('p', '', `맛집 ${bookmark.restaurantIds.length}곳`));
      const arrow = element('span', 'bookmark-arrow', '→'); arrow.setAttribute('aria-hidden', 'true'); button.append(folder, text, arrow); grid.append(button);
    });
  }

  function requestMyPage(target = 'bookmarks') {
    try {
      member(); confirmTarget = target;
      $('#password-confirm-form').reset(); $('#password-confirm-feedback').hidden = true;
      if (!$('#password-confirm-dialog').open) $('#password-confirm-dialog').showModal();
      $('#my-page-password').focus();
    } catch (error) { toast(error.message); }
  }

  $('#restaurant-search-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#restaurant-search-submit'); button.disabled = true;
    try {
      await ensureData(); member();
      const region = $('#search-region').value.trim(), menu = $('#search-menu').value.trim();
      if (!region) throw new Error('검색할 지역을 입력해 주세요.');
      view = { source: 'search', region, menu, bookmarkId: null, selectedId: null }; store.saveView(view);
      $('#search-feedback').hidden = true; location.hash = 'results';
    } catch (error) { $('#search-feedback').textContent = error.message; $('#search-feedback').hidden = false; }
    finally { button.disabled = false; }
  });

  $('#restaurant-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    try {
      if (button.dataset.action === 'select') selectRestaurant(button.dataset.id);
      else { bookmarkRestaurantId = button.dataset.id; renderBookmarkOptions(); $('#save-bookmark-dialog').showModal(); }
    } catch (error) { toast(error.message); }
  });
  $('#close-insights').addEventListener('click', () => {
    try { view.selectedId = null; store.saveView(view); renderInsights(); updateMarkerSelection(); }
    catch (error) { toast(error.message); }
  });
  $('#bookmark-options').addEventListener('change', event => {
    const checkbox = event.target.closest('input[data-bookmark-id]'); if (!checkbox) return;
    try {
      store.setBookmarkRestaurant(member().id, checkbox.dataset.bookmarkId, bookmarkRestaurantId, checkbox.checked);
      const selected = savedIds();
      $('#restaurant-list').querySelectorAll('.save-restaurant').forEach(button => {
        const saved = selected.has(button.dataset.id); button.classList.toggle('saved', saved); button.textContent = saved ? '★' : '☆'; button.setAttribute('aria-pressed', String(saved));
      });
      renderBookmarkOptions(); toast(checkbox.checked ? '북마크에 담았어요.' : '북마크에서 뺐어요.');
    } catch (error) { renderBookmarkOptions(); toast(error.message); }
  });
  $('#add-bookmark-from-dialog').addEventListener('click', createBookmark);
  $('#add-my-bookmark').addEventListener('click', createBookmark);
  $('#my-bookmarks').addEventListener('click', event => {
    const button = event.target.closest('button[data-bookmark-id]'); if (!button) return;
    try {
      const bookmark = store.loadBookmarks(member().id).find(item => item.id === button.dataset.bookmarkId);
      if (!bookmark) return;
      view = { source: 'bookmark', region: '', menu: '', bookmarkId: bookmark.id, selectedId: null }; store.saveView(view); location.hash = 'results';
    } catch (error) { toast(error.message); }
  });
  $('#open-my-page').addEventListener('click', () => requestMyPage());
  $('#password-confirm-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true; button.textContent = '확인 중'; $('#password-confirm-feedback').hidden = true;
    try {
      await auth.confirmMyPage($('#my-page-password').value); $('#password-confirm-form').reset(); $('#password-confirm-dialog').close(); location.hash = confirmTarget;
    } catch (error) { $('#password-confirm-feedback').textContent = error.message; $('#password-confirm-feedback').hidden = false; }
    finally { button.disabled = false; button.textContent = '확인'; }
  });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close()));
  $('#video-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-video-id]'); if (!button || !/^[\w-]{11}$/.test(button.dataset.videoId)) return;
    $('#video-dialog-title').textContent = button.dataset.videoTitle;
    $('#example-video-player').src = `https://www.youtube-nocookie.com/embed/${button.dataset.videoId}?autoplay=1`;
    $('#video-watch-link').href = `https://www.youtube.com/watch?v=${button.dataset.videoId}`;
    $('#video-dialog').showModal();
  });
  $('#video-dialog').addEventListener('close', () => $('#example-video-player').removeAttribute('src'));
  new ResizeObserver(() => {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (active) focusMap(); }, 150);
  }).observe($('#explore-map'));

  return {
    configureMap(key) { mapKey = key || LOGIN_MAP_CONFIG.appKey; },
    requestMyPage,
    async setRoute(next) {
      active = true; route = next; const currentRevision = ++revision;
      root.dataset.view = next;
      $('#search-home').hidden = next !== 'home'; $('#results-pane').hidden = next !== 'results'; $('#bookmark-page').hidden = next !== 'bookmarks';
      $('#explore-footer').hidden = next !== 'home';
      root.classList.remove('insights-open');
      await ensureData();
      if (!active || revision !== currentRevision) return;
      view = store.loadView();
      if (next === 'home') { $('#search-region').value = view.region || ''; $('#search-menu').value = view.menu || ''; }
      if (next === 'results') { renderList(); renderInsights(); }
      if (next === 'bookmarks') renderMyBookmarks();
      await ensureMap();
    },
    deactivate() {
      active = false; revision++; clearTimeout(toastTimer); $('#explore-toast').hidden = true;
      ['save-bookmark-dialog', 'password-confirm-dialog', 'video-dialog'].forEach(id => { if (document.getElementById(id).open) document.getElementById(id).close(); });
    },
    // 브라우저 확인용 읽기 전용 상태입니다. 계정 비밀번호와 해시는 노출하지 않습니다.
    get status() { return { route, mapStatus, count: visibleRestaurants.length, selectedId: view.selectedId }; },
  };
}
