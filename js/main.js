import { CONTENT_TYPES } from './data.js';
import * as api from './api.js';
import * as auth from './auth.js';
import { initMap, updateMap } from './map.js';
import { initLoginScene } from './login-scene.js';
import { LOGIN_MAP_CONFIG } from './map-config.js';
import { initRestaurantApp } from './restaurant-app.js';
import { removeUserBookmarks } from './restaurant-store.js';

const $ = (selector) => document.querySelector(selector);
const typeName = (code) => CONTENT_TYPES.find((type) => type.code === code)?.name || '기타';
const state = { mode: 'sample', page: 1, size: 10, total: 0, items: [], filters: null, revision: 0, detailRevision: 0 };
const loginScene = initLoginScene();
const restaurantApp = initRestaurantApp();
window.restaurantDemo = { get status() { return restaurantApp.status; } };
let configReady = false;
let tourInitialized = false;
let mapKey = LOGIN_MAP_CONFIG.appKey;

function notify(message, error = false) {
  $('#message').textContent = message;
  $('#message').dataset.error = String(error);
  const feedback = $('#login-feedback');
  feedback.textContent = message;
  feedback.dataset.error = String(error);
  feedback.hidden = !message;
}

function options(select, items, firstLabel) {
  select.replaceChildren(new Option(firstLabel, ''));
  items.forEach((item) => select.add(new Option(item.name, item.code)));
}

function refreshSession() {
  const user = auth.currentUser();
  document.querySelectorAll('[data-guest]').forEach((element) => { element.hidden = !!user; });
  document.querySelectorAll('[data-member]').forEach((element) => { element.hidden = !user; });
  $('#session-label').textContent = user ? `${user.name} (${user.id})` : '로그인하지 않음';
  if (user) {
    for (const key of ['id', 'name', 'email']) $('#profile-form').elements[key].value = user[key];
    $('#profile-form').elements.password.value = '';
  }
}

function showPage() {
  // home/results/bookmarks는 동일한 explore DOM을 공유하고 내부 패널만 전환합니다.
  const known = ['home', 'results', 'bookmarks', 'tour', 'join', 'login', 'profile', 'reset'];
  const user = auth.currentUser();
  const defaultPage = user ? 'home' : 'login';
  let page = location.hash.slice(1) || defaultPage;
  if (!known.includes(page)) page = defaultPage;
  if (['home', 'results', 'bookmarks', 'tour', 'profile'].includes(page) && !user) {
    page = 'login';
    history.replaceState(null, '', '#login');
    notify('로그인 후 맛있는 여행을 시작해 주세요.');
  }
  // URL을 직접 입력한 경우에도 마이페이지 비밀번호 확인을 건너뛰지 않습니다.
  if (['bookmarks', 'profile'].includes(page) && user && !auth.isMyPageConfirmed()) {
    const requested = page; page = 'home'; history.replaceState(null, '', '#home');
    restaurantApp.requestMyPage(requested);
  }
  const isWorkspace = ['home', 'results', 'bookmarks'].includes(page);
  const sectionId = isWorkspace ? 'explore' : page;
  document.querySelectorAll('section[data-page]').forEach((element) => { element.hidden = element.id !== sectionId; });
  const isLogin = page === 'login';
  $('#app-header').hidden = isLogin || isWorkspace;
  $('#app-main').hidden = isLogin || isWorkspace;
  document.body.classList.toggle('auth-screen', isLogin);
  document.body.classList.toggle('workspace-screen', isWorkspace);
  document.body.classList.toggle('account-screen', !isLogin && !isWorkspace && page !== 'tour');
  document.body.dataset.page = page;
  loginScene.setActive(isLogin);
  if (isWorkspace) restaurantApp.setRoute(page).catch(error => notify(error.message, true));
  else restaurantApp.deactivate();
  refreshSession();
  if (page === 'tour') {
    if (configReady) initializeTour();
    updateMap(state.items);
  }
}

async function initializeTour() {
  if (tourInitialized) return;
  tourInitialized = true;
  await loadAreas();
  await initMap(mapKey);
  if (document.body.dataset.page === 'tour') updateMap(state.items);
}

function clearResults() {
  state.filters = null; state.items = []; state.total = 0; state.page = 1;
  $('#place-list').replaceChildren();
  $('#result-status').textContent = '지역과 유형을 선택한 뒤 조회해 주세요.';
  $('#page-label').textContent = '1 페이지';
  $('#previous-page').disabled = true; $('#next-page').disabled = true;
  updateMap([]);
}

function setBusy(busy) {
  $('#search-button').disabled = busy;
  $('#previous-page').disabled = busy || state.page <= 1;
  $('#next-page').disabled = busy || state.page * state.size >= state.total;
  $('#place-list').setAttribute('aria-busy', String(busy));
}

async function loadAreas() {
  const revision = ++state.revision;
  clearResults(); setBusy(true);
  $('#area').disabled = true; $('#district').disabled = true;
  options($('#area'), [], '지역 선택'); options($('#district'), [], '전체');
  $('#data-notice').textContent = state.mode === 'sample'
    ? '샘플 모드: 모든 장소와 설명은 가상 데이터입니다. 서울·부산·제주를 제공합니다.'
    : '실제 API 모드: 한국관광공사 데이터를 조회합니다. API 오류는 메시지로 표시합니다.';
  try {
    const areas = await api.getAreas(state.mode);
    if (revision !== state.revision) return;
    options($('#area'), areas, '지역 선택');
    $('#area').disabled = false;
  } catch (error) {
    if (revision === state.revision) notify(error.message, true);
  } finally {
    if (revision === state.revision) setBusy(false);
  }
}

async function loadDistricts() {
  const revision = ++state.revision;
  clearResults(); setBusy(true);
  options($('#district'), [], '전체'); $('#district').disabled = true;
  try {
    if ($('#area').value) {
      const districts = await api.getDistricts(state.mode, $('#area').value);
      if (revision !== state.revision) return;
      options($('#district'), districts, '전체'); $('#district').disabled = false;
    }
  } catch (error) {
    if (revision === state.revision) notify(error.message, true);
  } finally {
    if (revision === state.revision) setBusy(false);
  }
}

function renderResults() {
  $('#place-list').replaceChildren();
  for (const place of state.items) {
    const row = document.createElement('tr');
    [place.name, typeName(place.typeCode), place.address || '주소 정보 없음'].forEach((value) => {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    });
    const cell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '상세 보기';
    button.setAttribute('aria-label', `${place.name} 상세 보기`);
    button.addEventListener('click', () => openDetail(place));
    cell.append(button); row.append(cell); $('#place-list').append(row);
  }
  $('#result-status').textContent = state.total
    ? `총 ${state.total}건 / 현재 페이지 ${state.items.length}건 (${state.mode === 'sample' ? '샘플' : '한국관광공사'})`
    : '조건에 맞는 관광정보가 없습니다.';
  $('#page-label').textContent = `${state.page} / ${Math.max(1, Math.ceil(state.total / state.size))} 페이지`;
  updateMap(state.items);
}

async function search(page = 1) {
  const revision = ++state.revision;
  const filters = page === 1 ? {
    area: $('#area').value, district: $('#district').value,
    type: $('#content-type').value, keyword: $('#keyword').value.trim(),
  } : state.filters;
  if (!filters?.area) { notify('먼저 지역을 선택해 주세요.', true); return; }
  state.filters = filters;
  setBusy(true); notify(''); $('#result-status').textContent = '조회 중입니다…';
  try {
    const result = await api.getPlaces(state.mode, { ...filters, page, size: state.size });
    if (revision !== state.revision) return;
    state.items = result.items; state.total = result.total; state.page = page;
    renderResults();
  } catch (error) {
    if (revision === state.revision) { clearResults(); notify(error.message, true); $('#result-status').textContent = '조회하지 못했습니다. 조건과 API 설정을 확인한 뒤 다시 시도해 주세요.'; }
  } finally {
    if (revision === state.revision) setBusy(false);
  }
}

async function openDetail(place) {
  const revision = ++state.detailRevision;
  const dialog = $('#detail-dialog');
  $('#detail-title').textContent = place.name;
  $('#detail-content').textContent = '상세 정보를 불러오는 중입니다…';
  if (!dialog.open) dialog.showModal();
  try {
    const detail = await api.getDetail(state.mode, place.id, place.typeCode);
    if (revision !== state.detailRevision || !dialog.open) return;
    if (!detail) throw new Error('상세 정보가 없습니다.');
    $('#detail-content').replaceChildren();
    const info = { ...place, ...detail };
    for (const [label, value] of [
      ['유형', typeName(info.typeCode)], ['주소', info.address], ['전화', info.phone || '정보 없음'],
      ['설명', info.overview || '제공된 설명이 없습니다.'], ['출처', info.source],
    ]) {
      const paragraph = document.createElement('p'); paragraph.textContent = `${label}: ${value}`; $('#detail-content').append(paragraph);
    }
  } catch (error) {
    if (revision === state.detailRevision && dialog.open) $('#detail-content').textContent = `상세 조회 실패: ${error.message}`;
  }
}

function bindForm(id, action) {
  $(id).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    const label = button.textContent;
    if (form.getAttribute('id') === 'login-form') { button.textContent = '로그인 중'; notify(''); }
    try {
      if ('confirm' in values && values.password !== values.confirm) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      await action(values, form); refreshSession();
    } catch (error) { notify(error.message, true); }
    finally { button.disabled = false; button.textContent = label; }
  });
}

$('#data-mode').addEventListener('change', () => { state.mode = $('#data-mode').value; notify(''); loadAreas(); });
$('#area').addEventListener('change', loadDistricts);
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); search(); });
$('#previous-page').addEventListener('click', () => search(state.page - 1));
$('#next-page').addEventListener('click', () => search(state.page + 1));
$('#detail-dialog').addEventListener('close', () => { state.detailRevision += 1; });

bindForm('#join-form', async (values, form) => {
  const user = await auth.register(values);
  form.reset(); $('#email').value = user.email; location.hash = 'login'; notify('가입했습니다. 새 계정으로 로그인해 주세요.');
});
bindForm('#login-form', async (values, form) => {
  await auth.login(values.id, values.password, { remember: form.elements.remember.checked });
  form.reset(); $('#password').type = 'password';
  $('#toggle-password').setAttribute('aria-pressed', 'false');
  $('#toggle-password').setAttribute('aria-label', '비밀번호 보기');
  location.hash = 'home'; notify('로그인했습니다.');
});
bindForm('#profile-form', async (values) => { await auth.updateProfile(values); notify('회원정보를 수정했습니다.'); });
bindForm('#reset-form', async (values, form) => {
  await auth.resetPassword(values); form.reset(); location.hash = 'login'; notify('비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.');
});
$('#toggle-password').addEventListener('click', (event) => {
  const input = $('#password');
  const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
  event.currentTarget.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 보기');
});
function logoutMember() {
  try { auth.logout(); refreshSession(); location.hash = 'login'; notify('로그아웃했습니다.'); }
  catch (error) { notify(error.message, true); }
}
$('#logout').addEventListener('click', logoutMember);
$('#workspace-logout').addEventListener('click', logoutMember);
$('#delete-account').addEventListener('click', () => {
  if (!confirm('이 브라우저에 저장된 회원정보를 삭제하고 탈퇴할까요?')) return;
  try {
    const user = auth.currentUser();
    if (user) removeUserBookmarks(user.id);
    auth.deleteAccount(); refreshSession(); location.hash = 'login'; notify('회원 탈퇴가 완료되었습니다.');
  }
  catch (error) { notify(error.message, true); }
});
window.addEventListener('hashchange', () => { try { showPage(); } catch (error) { notify(error.message, true); } });
window.addEventListener('storage', () => { try { showPage(); } catch (error) { notify(error.message, true); } });

async function init() {
  options($('#content-type'), CONTENT_TYPES, '전체');
  try {
    const config = await api.getConfig();
    state.mode = config.tourApiConfigured ? 'live' : 'sample';
    $('#data-mode').value = state.mode;
    mapKey = config.kakaoMapJsKey || LOGIN_MAP_CONFIG.appKey;
    restaurantApp.configureImages(config.restaurantImagesConfigured);
  } catch (error) { notify(error.message, true); }
  configReady = true;
  loginScene.configureMap(mapKey);
  restaurantApp.configureMap(mapKey);
  try { showPage(); } catch (error) { notify(error.message, true); }
  if (document.body.dataset.page === 'tour') await initializeTour();
}

init();
