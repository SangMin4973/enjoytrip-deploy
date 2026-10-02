import * as auth from './auth.js';
import * as store from './restaurant-store.js';
import { searchRestaurants } from './restaurant-api.js';
import { loadKakaoSdk } from './kakao-sdk.js';
import { LOGIN_MAP_CONFIG } from './map-config.js';
import { searchYoutubeVideos } from './youtube-api.js';
import { buildRestaurantSearchQuery } from './restaurant-search.js';
import { populateRestaurantImages } from './restaurant-images.js';

const $ = selector => document.querySelector(selector);

// API 응답도 textContent로 넣어 검색어·북마크 이름이 HTML로 실행되지 않게 합니다.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initRestaurantApp() {
  const root = $('#explore');
  let restaurants = [], visibleRestaurants = [], view = store.loadView();
  let map, mapLoading, mapStatus = 'pending', markers = [], markerButtons = [];
  let searchResult = null, searchError = '', searching = false;
  let route = 'home', active = false, mapKey = LOGIN_MAP_CONFIG.appKey;
  let revision = 0, toastTimer, resizeTimer, bookmarkRestaurantId, confirmTarget = 'bookmarks';
  let videoRevision = 0, videoController, shownVideos = [];
  let imagesConfigured = false, cleanupImages;

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

  async function ensureData() { restaurants = store.loadRestaurants(); }

  function savedIds() {
    return new Set(store.loadBookmarks(member().id).flatMap(item => item.restaurantIds));
  }

  function restaurantCard(restaurant) {
    const article = element('article', 'restaurant-card'); article.dataset.id = restaurant.id;
    article.classList.toggle('selected', restaurant.id === view.selectedId);
    const button = element('button', 'restaurant-card-content'); button.type = 'button';
    button.dataset.action = 'select'; button.dataset.id = restaurant.id;
    button.setAttribute('aria-label', `${restaurant.name} 인사이트 보기`);
    const image = element('div', 'restaurant-photo photo-unavailable', '사진\n제공 없음');
    const text = element('div', 'restaurant-card-text');
    text.append(element('h3', '', restaurant.name), element('p', '', restaurant.phone || '전화번호 미등록'), element('p', '', restaurant.address || '주소 미등록'));
    text.append(element('p', 'restaurant-rating', '별점 제공 없음 · 카카오맵에서 확인'));
    button.append(image, text);
    const saved = savedIds().has(restaurant.id);
    const star = element('button', `save-restaurant${saved ? ' saved' : ''}`, saved ? '★' : '☆');
    star.type = 'button'; star.dataset.action = 'save'; star.dataset.id = restaurant.id;
    star.setAttribute('aria-label', `${restaurant.name} 북마크 선택`); star.setAttribute('aria-pressed', String(saved));
    article.append(button, star);
    return article;
  }

  function renderList() {
    cleanupImages?.(); cleanupImages = undefined;
    const list = $('#restaurant-list'), scrollTop = list.scrollTop;
    list.replaceChildren();
    let missing = 0;
    if (view.source === 'bookmark') {
      const bookmark = store.loadBookmarks(member().id).find(item => item.id === view.bookmarkId);
      $('#results-source').textContent = '내 북마크';
      $('#results-heading').textContent = bookmark?.name || '북마크';
      visibleRestaurants = bookmark ? bookmark.restaurantIds.map(id => restaurants.find(item => item.id === id)).filter(Boolean) : [];
      missing = (bookmark?.restaurantIds.length || 0) - visibleRestaurants.length;
    } else {
      $('#results-source').textContent = '검색한 맛집';
      $('#results-heading').textContent = [view.region, view.menu].filter(Boolean).join(' · ') || '맛집 찾기';
      visibleRestaurants = searching || searchError ? [] : (searchResult?.restaurants || []);
    }
    $('#results-count').textContent = searching ? '카카오맵에서 음식점을 찾는 중…' : searchError ? '검색 연결 오류' : `음식점 ${visibleRestaurants.length}곳 · ${view.source === 'bookmark' ? '저장한 카카오 장소 정보' : '카카오맵 검색 결과'}`;
    $('#results-notice').textContent = missing ? `이전 예시 또는 정보가 없는 음식점 ${missing}곳은 표시하지 않습니다. 기존 북마크는 보존됩니다.` : view.source === 'bookmark' ? '저장 당시 정보입니다. 최신 정보는 카카오맵에서 확인해 주세요.' : '카카오 검색 정확도 순입니다. 사진·별점은 API에서 제공하지 않습니다.';
    $('#restaurant-list').setAttribute('aria-busy', String(searching));
    $('#search-pagination').hidden = view.source === 'bookmark' || searching || !!searchError || !searchResult?.restaurants.length;
    $('#search-page-label').textContent = `${view.page || 1}페이지 · 검색 ${searchResult?.total || 0}곳 (최대 45곳 조회)`;
    $('#previous-restaurants').disabled = (view.page || 1) <= 1;
    $('#next-restaurants').disabled = !searchResult?.hasNext;
    if (!visibleRestaurants.length) {
      const empty = element('div', 'list-empty');
      empty.append(element('strong', '', searching ? '음식점을 찾고 있어요.' : searchError ? '검색을 완료하지 못했어요.' : view.source === 'bookmark' ? '표시할 맛집이 없어요.' : '찾는 맛집이 없어요.'), element('p', '', searching ? '잠시만 기다려 주세요.' : searchError || (view.source === 'bookmark' ? '실제 음식점을 검색하고 별표를 눌러 담아보세요.' : '지역을 더 구체적으로 입력하거나 메뉴를 바꿔보세요.')));
      if (searchError) { const retry = element('button', 'food-button light', '다시 시도'); retry.type = 'button'; retry.dataset.action = 'retry'; empty.append(retry); }
      const back = element('a', '', '다시 맛집 찾기'); back.href = '#home'; empty.append(back); list.append(empty);
    } else visibleRestaurants.forEach(restaurant => list.append(restaurantCard(restaurant)));
    list.scrollTop = scrollTop;
    if (imagesConfigured && visibleRestaurants.length) cleanupImages = populateRestaurantImages(list, visibleRestaurants);
    if (!visibleRestaurants.some(item => item.id === view.selectedId)) view.selectedId = null;
  }

  function setSearchLinks(restaurant) {
    const query = encodeURIComponent(buildRestaurantSearchQuery(restaurant));
    $('#kakao-place-link').href = restaurant.placeUrl;
    $('#naver-search').href = `https://search.naver.com/search.naver?query=${query}`;
    $('#youtube-search').href = `https://www.youtube.com/results?search_query=${query}`;
    $('#google-search').href = `https://www.google.com/search?q=${query}`;
  }

  function renderInsights() {
    cancelVideos();
    const restaurant = visibleRestaurants.find(item => item.id === view.selectedId);
    $('#restaurant-insights').hidden = !restaurant;
    root.classList.toggle('insights-open', !!restaurant);
    if (!restaurant) return;
    $('#insight-heading').textContent = restaurant.name;
    $('#insight-address').textContent = restaurant.address;
    $('#insight-description').textContent = [restaurant.category, restaurant.phone || '전화번호 미등록'].filter(Boolean).join(' · ');
    setSearchLinks(restaurant);
    loadVideos(restaurant);
    $('#restaurant-insights .insight-scroll').scrollTop = 0;
  }

  function cancelVideos() {
    videoRevision++; videoController?.abort(); videoController = undefined; shownVideos = [];
    if ($('#video-dialog').open) $('#video-dialog').close();
  }

  async function loadVideos(restaurant) {
    videoController?.abort();
    const requestRevision = ++videoRevision;
    videoController = new AbortController();
    $('#video-list').replaceChildren(); $('#video-list').setAttribute('aria-busy', 'true');
    $('#video-count').textContent = '검색 중'; $('#video-feedback').textContent = '관련 영상을 찾고 있어요.';
    $('#retry-videos').hidden = true;
    const query = buildRestaurantSearchQuery(restaurant);
    $('#video-query').textContent = `“${query}”로 검색한 영상이에요. 해당 매장을 다루는 영상인지 확인해 주세요.`;
    try {
      const videos = await searchYoutubeVideos(query, { signal: videoController.signal });
      if (!active || requestRevision !== videoRevision || view.selectedId !== restaurant.id) return;
      shownVideos = videos;
      $('#video-count').textContent = `${videos.length}개 / 최대 5개`;
      $('#video-feedback').textContent = videos.length ? '' : '검색된 영상이 없어요. 유튜브에서 직접 검색해 보세요.';
      videos.forEach(video => {
        const card = element('button', 'video-card'); card.type = 'button'; card.dataset.videoId = video.id;
        card.setAttribute('aria-label', `${video.title} 영상 보기`);
        const thumbnail = element('div', 'video-thumb'), image = element('img');
        image.src = video.thumbnail; image.alt = ''; image.loading = 'lazy'; image.width = 320; image.height = 180;
        image.addEventListener('error', () => image.remove(), { once: true });
        thumbnail.append(image); card.append(thumbnail, element('h4', '', video.title), element('p', '', video.creator));
        $('#video-list').append(card);
      });
    } catch (error) {
      if (!active || requestRevision !== videoRevision || view.selectedId !== restaurant.id) return;
      $('#video-count').textContent = '검색 실패'; $('#video-feedback').textContent = error.message;
      $('#retry-videos').hidden = false;
    } finally {
      if (requestRevision === videoRevision) $('#video-list').setAttribute('aria-busy', 'false');
    }
  }

  $('#retry-videos').addEventListener('click', () => {
    const restaurant = visibleRestaurants.find(item => item.id === view.selectedId);
    if (restaurant) loadVideos(restaurant);
  });
  $('#video-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-video-id]');
    const video = shownVideos.find(item => item.id === button?.dataset.videoId);
    if (!video || !/^[\w-]{11}$/.test(video.id)) return;
    $('#video-dialog-title').textContent = video.title;
    $('#youtube-video-player').src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&origin=${encodeURIComponent(location.origin)}`;
    $('#video-watch-link').href = video.watchUrl; $('#video-dialog').showModal();
  });
  $('#video-dialog').addEventListener('close', () => $('#youtube-video-player').removeAttribute('src'));

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
    if (!map) mapLoading = undefined;
    if (!mapLoading) mapLoading = (async () => {
      mapStatus = 'loading';
      try {
        await loadKakaoSdk(mapKey);
        map = new kakao.maps.Map($('#explore-map'), { center: new kakao.maps.LatLng(LOGIN_MAP_CONFIG.center.lat, LOGIN_MAP_CONFIG.center.lng), level: 5 });
        $('#explore-map-message').hidden = true;
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
    $('#bookmark-name-form').reset(); $('#bookmark-name-feedback').hidden = true;
    $('#bookmark-name-dialog').showModal(); $('#new-bookmark-name').focus();
  }

  $('#bookmark-name-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const bookmark = store.createBookmark(member().id, $('#new-bookmark-name').value);
      $('#bookmark-name-dialog').close();
      if ($('#save-bookmark-dialog').open) {
        renderBookmarkOptions(); $('#bookmark-options').scrollTop = $('#bookmark-options').scrollHeight;
      }
      if (route === 'bookmarks') renderMyBookmarks();
      toast(`${bookmark.name} 북마크를 만들었어요.`);
    } catch (error) { $('#bookmark-name-feedback').textContent = error.message; $('#bookmark-name-feedback').hidden = false; }
  });

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

  // 페이지 이동·로그아웃 뒤 도착한 응답이 현재 화면을 덮어쓰지 않게 합니다.
  async function runSearch() {
    const requestRevision = ++revision, userId = member().id;
    const requestView = { ...view, page: view.page || 1 };
    searching = true; searchError = ''; searchResult = null;
    renderList(); renderInsights(); renderMarkers();
    try {
      const result = await searchRestaurants(mapKey, requestView.region, requestView.menu, requestView.page);
      if (!active || route !== 'results' || revision !== requestRevision || auth.currentUser()?.id !== userId) return;
      store.saveRestaurants(result.restaurants); restaurants = store.loadRestaurants();
      searchResult = result; view = requestView; store.saveView(view);
    } catch (error) {
      if (!active || revision !== requestRevision || auth.currentUser()?.id !== userId) return;
      searchError = error.message;
    } finally {
      if (active && revision === requestRevision && auth.currentUser()?.id === userId) {
        searching = false; renderList(); renderInsights(); renderMarkers();
      }
    }
  }

  async function changeSearchPage(delta) {
    if (searching || view.source !== 'search') return;
    view.page = Math.max(1, Math.min(3, (view.page || 1) + delta)); view.selectedId = null;
    $('#restaurant-list').scrollTop = 0;
    await runSearch();
  }
  $('#previous-restaurants').addEventListener('click', () => changeSearchPage(-1).catch(error => toast(error.message)));
  $('#next-restaurants').addEventListener('click', () => changeSearchPage(1).catch(error => toast(error.message)));

  $('#restaurant-search-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#restaurant-search-submit'); button.disabled = true;
    try {
      await ensureData(); member();
      const region = $('#search-region').value.trim(), menu = $('#search-menu').value.trim();
      if (!region) throw new Error('검색할 지역을 입력해 주세요.');
      view = { source: 'search', region, menu, page: 1, bookmarkId: null, selectedId: null }; store.saveView(view);
      $('#search-feedback').hidden = true; location.hash = 'results';
    } catch (error) { $('#search-feedback').textContent = error.message; $('#search-feedback').hidden = false; }
    finally { button.disabled = false; }
  });

  $('#restaurant-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    try {
      if (button.dataset.action === 'retry') { runSearch().catch(error => toast(error.message)); return; }
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
  new ResizeObserver(() => {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (active) focusMap(); }, 150);
  }).observe($('#explore-map'));

  return {
    configureMap(key) { mapKey = key || LOGIN_MAP_CONFIG.appKey; },
    configureImages(configured) { imagesConfigured = !!configured; },
    requestMyPage,
    async setRoute(next) {
      cleanupImages?.(); cleanupImages = undefined;
      cancelVideos();
      active = true; route = next; const currentRevision = ++revision;
      root.dataset.view = next;
      $('#search-home').hidden = next !== 'home'; $('#results-pane').hidden = next !== 'results'; $('#bookmark-page').hidden = next !== 'bookmarks';
      $('#explore-footer').hidden = next !== 'home';
      root.classList.remove('insights-open');
      await ensureData();
      if (!active || revision !== currentRevision) return;
      view = store.loadView();
      if (next === 'home') { $('#search-region').value = view.region || ''; $('#search-menu').value = view.menu || ''; }
      searching = false; searchError = '';
      if (next === 'results') {
        if (view.source === 'search' && view.region) await runSearch();
        else { searchResult = null; renderList(); renderInsights(); }
      }
      if (!active || route !== next) return;
      if (next === 'bookmarks') renderMyBookmarks();
      await ensureMap();
    },
    deactivate() {
      cleanupImages?.(); cleanupImages = undefined;
      cancelVideos();
      active = false; revision++; clearTimeout(toastTimer); $('#explore-toast').hidden = true;
      ['bookmark-name-dialog', 'save-bookmark-dialog', 'password-confirm-dialog'].forEach(id => { if (document.getElementById(id).open) document.getElementById(id).close(); });
    },
    // 브라우저 확인용 읽기 전용 상태입니다. 계정 비밀번호와 해시는 노출하지 않습니다.
    get status() { return { route, mapStatus, count: visibleRestaurants.length, selectedId: view.selectedId }; },
  };
}
