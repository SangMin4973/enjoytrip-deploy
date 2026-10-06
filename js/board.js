import { currentUser, initializeSharedAuth } from './auth.js';
import { sharedRequest } from './shared-client.js';
import { initializeContextEditor, renderPostContext, postSummary, kindLabel, node } from './board-context.js';

const $ = selector => document.querySelector(selector);
const page = document.body.dataset.boardPage;
const index = new URLSearchParams(location.search).get('index');
const urlFor = (name, id) => `./${name}.html?${new URLSearchParams({ index: String(id) })}`;
const apiFor = id => `/api/board/posts/${encodeURIComponent(String(id))}`;
function feedback(message, error = false) {
  const box = $('#board-feedback'); box.textContent = message; box.dataset.error = String(error); box.hidden = !message;
  box.setAttribute('role', error ? 'alert' : 'status');
}
function requireMember() {
  const user = currentUser();
  if (!user) throw new Error('공유 계정으로 로그인한 뒤 글을 작성해 주세요. 맛집 찾기 화면에서 회원가입·로그인을 할 수 있습니다.');
  return user;
}

function initializeList() {
  let currentPage = 1, query = '', type = 'all', revision = 0;
  async function render() {
    const request = ++revision; $('#board-list').setAttribute('aria-busy', 'true');
    try {
      const result = await sharedRequest(`/api/board/posts?${new URLSearchParams({ page: currentPage, q: query, type })}`);
      if (request !== revision) return;
      const pages = Math.max(1, Math.ceil(result.matched / 8));
      if (currentPage > pages) { currentPage = pages; return render(); }
      $('#post-total').textContent = result.total.toLocaleString('ko-KR');
      $('#search-count').hidden = !query && type === 'all'; $('#search-count').textContent = `검색 결과 ${result.matched}개`;
      $('#board-list').replaceChildren();
      for (const post of result.posts) {
        const row = node('tr'), title = node('td'), link = node('a', 'post-link', post.subject);
        link.href = urlFor('view', post.index);
        const meta = node('span', 'post-mobile-meta');
        for (const text of [post.writer, post.created_at.slice(0, 10)]) meta.append(node('span', '', text));
        title.append(postSummary(post), link, meta);
        row.append(node('td', 'post-number', String(post.index)), title, node('td', 'post-writer', post.writer),
          node('td', 'post-date', post.created_at.slice(0, 10)), node('td', 'post-views', String(post.comment_count)));
        $('#board-list').append(row);
      }
      $('#board-empty').hidden = result.matched !== 0;
      $('#empty-title').textContent = query || type !== 'all' ? '찾는 이야기가 없어요.' : '첫 번째 맛집 이야기를 기다리고 있어요.';
      $('#empty-description').textContent = '음식점 후기와 별점을 남기거나 나만의 북마크를 소개해 주세요.';
      $('#empty-write').hidden = !!query; $('#clear-search').hidden = !query && type === 'all';
      $('#board-pagination').hidden = pages <= 1; $('#board-page-label').textContent = `${currentPage} / ${pages}`;
      $('#board-previous').disabled = currentPage <= 1; $('#board-next').disabled = currentPage >= pages;
      feedback('');
    } catch (error) { if (request === revision) { $('#board-list').replaceChildren(); feedback(error.message, true); } }
    finally { if (request === revision) $('#board-list').setAttribute('aria-busy', 'false'); }
  }
  function filters() { document.querySelectorAll('[data-post-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.postType === type))); }
  $('#board-search-form').addEventListener('submit', event => { event.preventDefault(); query = $('#board-query').value.trim(); currentPage = 1; render(); });
  document.querySelectorAll('[data-post-type]').forEach(button => button.addEventListener('click', () => { type = button.dataset.postType; currentPage = 1; filters(); render(); }));
  $('#clear-search').addEventListener('click', () => { $('#board-query').value = ''; query = ''; type = 'all'; currentPage = 1; filters(); render(); });
  for (const [selector, delta] of [['#board-previous', -1], ['#board-next', 1]]) $(selector).addEventListener('click', () => { currentPage += delta; render(); });
  return render();
}

async function initializeEditor() {
  const user = requireMember(), form = $(page === 'write' ? '#writeFrm' : '#modifyFrm');
  let post;
  if (page === 'modify') {
    post = await sharedRequest(apiFor(index));
    if (post.authorId !== user.id) throw new Error('본인이 작성한 글만 수정할 수 있습니다.');
    for (const key of ['subject', 'content']) form.elements[key].value = post[key];
    $('#back').href = urlFor('view', post.index);
  }
  form.elements.writer.value = user.name; form.elements.writer.readOnly = true;
  const context = initializeContextEditor($('#post-context-editor'), user, post);
  form.hidden = false;
  function count() { $('#content-count').textContent = `${form.elements.content.value.length.toLocaleString('ko-KR')} / 10,000`; }
  form.elements.content.addEventListener('input', count); count();
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true; feedback('');
    try {
      const values = { subject: form.elements.subject.value, content: form.elements.content.value, ...context() };
      const saved = await sharedRequest(page === 'modify' ? apiFor(index) : '/api/board/posts', { method: page === 'modify' ? 'PATCH' : 'POST', body: values });
      location.href = urlFor('view', saved.index);
    } catch (error) { feedback(error.message, true); button.disabled = false; }
  });
}

async function initializeView() {
  const post = await sharedRequest(apiFor(index));
  $('#subject').textContent = post.subject; $('#writer').textContent = post.writer;
  $('#date').textContent = post.date; $('#date').dateTime = post.date;
  $('#content').textContent = post.content; $('#post-label').textContent = `${kindLabel(post)} #${post.index}`;
  $('#modify').href = urlFor('modify', post.index); $('#viewFrm').hidden = false;
  $('#post-actions').hidden = post.authorId !== currentUser()?.id;
  renderPostContext(post, $('#post-context-view')); document.title = `${post.subject} · 맛집기행`;
  const dialog = $('#delete-dialog');
  $('#delete').addEventListener('click', () => { $('#delete-feedback').hidden = true; dialog.showModal(); });
  for (const selector of ['#cancel-delete', '#cancel-delete-icon']) $(selector).addEventListener('click', () => dialog.close());
  $('#confirm-delete').addEventListener('click', async () => {
    const button = $('#confirm-delete'); button.disabled = true;
    try { await sharedRequest(apiFor(index), { method: 'DELETE', body: {} }); location.href = './list.html'; }
    catch (error) { $('#delete-feedback').textContent = error.message; $('#delete-feedback').hidden = false; button.disabled = false; }
  });
  $('#post-discussion').hidden = false;
  function comments(items) {
    $('#comment-list').replaceChildren(); $('#comment-count').textContent = items.length; $('#views').textContent = items.length;
    if (!items.length) $('#comment-list').append(node('p', 'context-hint', '아직 댓글이 없어요. 첫 의견을 남겨보세요.'));
    items.forEach(comment => {
      const card = node('article', 'comment-item'), meta = node('div', 'comment-meta');
      meta.append(node('strong', '', comment.writer), node('time', '', new Date(comment.created_at).toLocaleString('ko-KR')));
      if (comment.authorId === currentUser()?.id) {
        const button = node('button', 'comment-delete', '댓글 삭제'); button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await sharedRequest(`${apiFor(index)}/comments/${comment.id}`, { method: 'DELETE', body: {} }); comments((await sharedRequest(apiFor(index))).comments); }
          catch (error) { $('#comment-feedback').textContent = error.message; button.disabled = false; }
        }); meta.append(button);
      }
      card.append(meta, node('p', '', comment.content)); $('#comment-list').append(card);
    });
  }
  comments(post.comments);
  $('#comment-form').hidden = !currentUser(); $('#comment-login').hidden = !!currentUser(); $('#comment-author').textContent = currentUser()?.name || '';
  $('#comment-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true; $('#comment-feedback').textContent = '';
    try { await sharedRequest(`${apiFor(index)}/comments`, { method: 'POST', body: { content: $('#comment-content').value } }); $('#comment-content').value = ''; comments((await sharedRequest(apiFor(index))).comments); }
    catch (error) { $('#comment-feedback').textContent = error.message; }
    finally { button.disabled = false; }
  });
}

try {
  const config = await sharedRequest('/api/config');
  if (!config.sharedBoardConfigured) throw new Error('공유 게시판을 준비하는 중입니다. DB 연결 후 이용해 주세요. 이전 브라우저 게시글은 삭제하지 않았습니다.');
  await initializeSharedAuth(true);
  document.querySelector('.board-footer > span').textContent = '후기와 북마크를 함께 나누는 공간.';
  if (page === 'list') await initializeList();
  else if (page === 'write' || page === 'modify') await initializeEditor();
  else if (page === 'view') await initializeView();
} catch (error) {
  document.querySelector('.board-editor')?.setAttribute('hidden', '');
  feedback(error.message, true);
}
