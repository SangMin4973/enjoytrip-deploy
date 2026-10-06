import { readPosts, findPost, createPost, updatePost, deletePost } from './board-store.js';
import { currentUser } from './auth.js';

const $ = selector => document.querySelector(selector);
const page = document.body.dataset.boardPage;
const index = new URLSearchParams(location.search).get('index');
const urlFor = (pageName, id) => `./${pageName}.html?${new URLSearchParams({ index: String(id) })}`;
const number = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');

function feedback(message, error = false) {
  const box = $('#board-feedback');
  box.textContent = message; box.dataset.error = String(error); box.hidden = !message;
  box.setAttribute('role', error ? 'alert' : 'status');
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function initializeList() {
  let currentPage = 1, query = '';
  const size = 8;
  function render() {
    try {
      const posts = readPosts().sort((a, b) => Number(b.index) - Number(a.index));
      const matched = posts.filter(post => [post.subject, post.writer, post.content].some(value => value.toLocaleLowerCase('ko-KR').includes(query)));
      const pages = Math.max(1, Math.ceil(matched.length / size));
      currentPage = Math.min(currentPage, pages);
      $('#post-total').textContent = number(posts.length);
      $('#search-count').hidden = !query;
      $('#search-count').textContent = `검색 결과 ${number(matched.length)}개`;
      $('#board-list').replaceChildren();
      for (const post of matched.slice((currentPage - 1) * size, currentPage * size)) {
        const row = node('tr');
        const title = node('td'), link = node('a', 'post-link', post.subject);
        link.href = urlFor('view', post.index);
        const meta = node('span', 'post-mobile-meta');
        for (const text of [post.writer, post.date || '날짜 미등록', `조회 ${number(post.views)}`]) meta.append(node('span', '', text));
        title.append(link, meta);
        row.append(node('td', 'post-number', String(Number(post.index) + 1)), title,
          node('td', 'post-writer', post.writer), node('td', 'post-date', post.date || '날짜 미등록'), node('td', 'post-views', number(post.views)));
        $('#board-list').append(row);
      }
      $('#board-empty').hidden = matched.length !== 0;
      $('#empty-title').textContent = query ? '찾는 이야기가 없어요.' : '첫 번째 이야기를 기다리고 있어요.';
      $('#empty-description').textContent = query ? '다른 검색어로 찾아보거나 전체 이야기를 확인해 보세요.' : '기억에 남은 한 끼, 짧은 이야기로 시작해 보세요.';
      $('#empty-write').hidden = !!query; $('#clear-search').hidden = !query;
      $('#board-pagination').hidden = pages <= 1;
      $('#board-page-label').textContent = `${currentPage} / ${pages}`;
      $('#board-previous').disabled = currentPage <= 1; $('#board-next').disabled = currentPage >= pages;
      feedback('');
    } catch (error) {
      $('#board-list').replaceChildren(); $('#board-empty').hidden = true; $('#board-pagination').hidden = true;
      feedback(error.message, true);
    }
  }
  $('#board-search-form').addEventListener('submit', event => { event.preventDefault(); query = $('#board-query').value.trim().toLocaleLowerCase('ko-KR'); currentPage = 1; render(); });
  $('#board-query').addEventListener('input', () => { if (!$('#board-query').value && query) { query = ''; currentPage = 1; render(); } });
  $('#clear-search').addEventListener('click', () => { $('#board-query').value = ''; query = ''; currentPage = 1; render(); });
  for (const [selector, delta] of [['#board-previous', -1], ['#board-next', 1]]) $(selector).addEventListener('click', () => { currentPage += delta; render(); });
  window.addEventListener('storage', event => { if (event.key === 'boards' || event.key === null) render(); });
  render();
}

function initializeEditor() {
  const form = $(page === 'write' ? '#writeFrm' : '#modifyFrm');
  if (page === 'modify') {
    const post = findPost(index);
    for (const key of ['subject', 'writer', 'content']) form.elements[key].value = post[key];
    $('#back').href = urlFor('view', post.index); form.hidden = false;
  } else {
    try { form.elements.writer.value = currentUser()?.name || ''; } catch { /* 회원 저장소 오류는 게시글 작성과 분리합니다. */ }
  }
  function count() { $('#content-count').textContent = `${form.elements.content.value.length.toLocaleString('ko-KR')} / 10,000`; }
  form.elements.content.addEventListener('input', count); count();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const post = page === 'modify' ? updatePost(index, values) : createPost(values);
      location.href = urlFor('view', post.index);
    } catch (error) { feedback(error.message, true); button.disabled = false; }
  });
}

function initializeView() {
  const post = findPost(index, { countView: true });
  $('#subject').textContent = post.subject; $('#writer').textContent = post.writer;
  $('#date').textContent = post.date || '날짜 미등록';
  if (/^\d{4}-\d{2}-\d{2}$/.test(post.date || '')) $('#date').dateTime = post.date;
  $('#views').textContent = number(post.views); $('#content').textContent = post.content;
  $('#post-label').textContent = `이야기 #${Number(post.index) + 1}`;
  $('#modify').href = urlFor('modify', post.index);
  $('#viewFrm').hidden = false; $('#post-actions').hidden = false;
  document.title = `${post.subject} · 맛집기행`;
  const dialog = $('#delete-dialog');
  $('#delete').addEventListener('click', () => { $('#delete-feedback').hidden = true; dialog.showModal(); });
  for (const selector of ['#cancel-delete', '#cancel-delete-icon']) $(selector).addEventListener('click', () => dialog.close());
  $('#confirm-delete').addEventListener('click', () => {
    try { deletePost(index); location.href = './list.html'; }
    catch (error) { $('#delete-feedback').textContent = error.message; $('#delete-feedback').hidden = false; }
  });
}

try {
  if (page === 'list') initializeList();
  else if (page === 'write' || page === 'modify') initializeEditor();
  else if (page === 'view') initializeView();
} catch (error) { feedback(error.message, true); }
