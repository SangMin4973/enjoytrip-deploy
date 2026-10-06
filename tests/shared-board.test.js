import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { validatePost } from '../js/board-schema.js';

const place = { id: 'kakao-12345', name: '테스트 식당', address: '부산 해운대구' };
const review = { type: 'review', subject: '한 끼 후기', content: '음식이 맛있어요.', rating: 4, restaurant: place };
function fakeDb() {
  const tables = { matzip_members: [], matzip_sessions: [], matzip_posts: [], matzip_comments: [] }; let next = 1;
  const fetchImpl = async (url, options) => {
    const table = url.pathname.replace('/rest/v1/', ''), body = options.body ? JSON.parse(options.body) : null;
    assert.equal(options.headers.apikey, 'server-key');
    if (table === 'rpc/matzip_board_list') {
      const matched = tables.matzip_posts.filter(p => (body.post_type === 'all' || p.type === body.post_type)
        && JSON.stringify(p).toLowerCase().includes(body.search_text.toLowerCase()));
      return Response.json({ total: tables.matzip_posts.length, matched: matched.length, posts: matched.slice((body.page_number - 1) * 8, body.page_number * 8).map(p=>({ ...p, comment_count: tables.matzip_comments.filter(c=>c.post_id===p.index).length })) });
    }
    const rows = tables[table]; assert.ok(rows, table);
    const matched = rows.filter(row => [...url.searchParams].every(([key, value]) => {
      if (['select', 'limit', 'order'].includes(key)) return true;
      const [operator, ...parts] = value.split('.'), expected = parts.join('.');
      if (operator === 'eq') return String(row[key]) === expected;
      if (operator === 'neq') return String(row[key]) !== expected;
      if (operator === 'gt') return String(row[key]) > expected;
      throw new Error(operator);
    }));
    if (options.method === 'POST') {
      if (table === 'matzip_members' && rows.some(r=>r.id.toLowerCase()===body.id.toLowerCase() || r.email===body.email)) return Response.json({ code: '23505', message: 'private secret' }, { status: 409 });
      const row = { ...structuredClone(body), created_at: new Date().toISOString() };
      if (table === 'matzip_posts') row.index = next++;
      if (table === 'matzip_comments') row.id = randomUUID();
      rows.push(row); return Response.json([row]);
    }
    if (options.method === 'PATCH') matched.forEach(row => Object.assign(row, structuredClone(body)));
    if (options.method === 'DELETE') tables[table] = rows.filter(row => !matched.includes(row));
    return Response.json(matched);
  };
  return { tables, fetchImpl };
}

test('공유 게시판은 두 세션에서 읽히며 글·댓글 작성자를 서버에서 검증한다', async t => {
  const db = fakeDb(), server = makeServer({ sharedDbOptions: { url: 'https://example.supabase.co', key: 'server-key', fetchImpl: db.fetchImpl } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, method = 'GET', body, cookie = '') {
    const response = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { response, data: await response.json() };
  }
  async function member(id) {
    const input = { id, name: id, email: `${id}@example.invalid`, password: 'TestPass2026!' };
    const registered = await call('/api/auth/register', 'POST', input); assert.equal(registered.response.status, 200);
    assert.ok(!JSON.stringify(registered.data).includes('password_hash'));
    const login = await call('/api/auth/login', 'POST', { identifier: id, password: input.password });
    assert.equal(login.response.status, 200);
    const setCookie = login.response.headers.get('set-cookie'); assert.match(setCookie, /HttpOnly; SameSite=Lax/);
    return setCookie.split(';')[0];
  }
  const alice = await member('alice'), bob = await member('bobby');
  assert.equal((await call('/api/auth/me', 'GET', null, alice)).data.user.id, 'alice');
  assert.equal((await call('/api/board/posts', 'POST', review)).response.status, 401);
  const created = await call('/api/board/posts', 'POST', { ...review, writer: '위조', author_id: 'bobby' }, alice);
  assert.equal(created.response.status, 200); assert.equal(created.data.writer, 'alice'); assert.equal(created.data.authorId, 'alice');
  const id = created.data.index;
  assert.equal((await call(`/api/board/posts/${id}`, 'GET', null, bob)).data.rating, 4);
  assert.equal((await call(`/api/board/posts/${id}`, 'PATCH', review, bob)).response.status, 403);
  assert.equal((await call(`/api/board/posts/${id}`, 'DELETE', {}, bob)).response.status, 403);
  const comment = await call(`/api/board/posts/${id}/comments`, 'POST', { content: '저도 추천해요.', writer: '위조' }, bob);
  assert.equal(comment.data.writer, 'bobby');
  assert.equal((await call(`/api/board/posts/${id}`, 'GET')).data.comments.length, 1);
  assert.equal((await call(`/api/board/posts/${id}/comments/${comment.data.id}`, 'DELETE', {}, alice)).response.status, 403);
  assert.equal((await call(`/api/board/posts/${id}/comments/${comment.data.id}`, 'DELETE', {}, bob)).response.status, 200);
  const snapshot = { type: 'bookmark', subject: '나의 맛집', content: '주말에 가기 좋아요.', bookmark: { name: '나의 목록', restaurants: [place, place] } };
  const shared = await call('/api/board/posts', 'POST', snapshot, alice);
  snapshot.bookmark.name = '변경된 원본';
  assert.equal(shared.data.bookmark.restaurants.length, 1); assert.equal(shared.data.bookmark.name, '나의 목록');
  const filtered = await call('/api/board/posts?type=bookmark&q=테스트'); assert.equal(filtered.data.matched, 1);
  assert.equal((await call(`/api/board/posts/${id}`, 'PATCH', { ...review, rating: 1 }, alice)).data.rating, 1);
  assert.equal((await call(`/api/board/posts/${id}`, 'DELETE', {}, alice)).response.status, 200);
  assert.equal((await call(`/api/board/posts/${id}`)).response.status, 404);
  const logout = await call('/api/auth/logout', 'POST', {}, alice); assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call('/api/board/posts', 'POST', review, alice)).response.status, 401);
  assert.equal((await call('/api/auth/profile', 'POST', { name: '변경', email: 'bobby@example.invalid' }, bob)).response.status, 403);
  assert.equal((await call('/api/auth/confirm', 'POST', { password: 'TestPass2026!' }, bob)).response.status, 200);
  assert.equal((await call('/api/auth/profile', 'POST', { name: '변경 이름', email: 'new@example.invalid' }, bob)).data.user.name, '변경 이름');
  db.tables.matzip_sessions.forEach(s => { if (s.user_id === 'bobby') s.expires_at = '2000-01-01T00:00:00Z'; });
  assert.equal((await call('/api/auth/me', 'GET', null, bob)).data.user, null);
  assert.equal((await call('/api/board/posts', 'POST', review, bob)).response.status, 401);
});

test('공유 글 입력 검증은 별점·실제 장소·빈 북마크·길이를 제한한다', () => {
  for (const rating of [0, 6, 1.5, null, '5']) assert.throws(() => validatePost({ ...review, rating }), /별점/);
  assert.throws(() => validatePost({ ...review, restaurant: { ...place, id: 'example-0' } }), /실제 음식점/);
  assert.throws(() => validatePost({ type: 'bookmark', subject: '제목', content: '내용', bookmark: { name: '목록', restaurants: [] } }), /1~100/);
  assert.throws(() => validatePost({ ...review, subject: '가'.repeat(121) }), /120/);
  assert.equal(validatePost({ ...review, restaurant: { ...place, injected: '무시' } }).restaurant.injected, undefined);
});

test('공유 API는 교차 사이트 요청과 비밀 키 노출을 차단한다', async t => {
  const db = fakeDb(), server = makeServer({ sharedDbOptions: { url: 'https://example.supabase.co', key: 'server-key', fetchImpl: db.fetchImpl } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for (const origin of ['', 'https://other.example']) {
    const response=await fetch(base+'/api/board/posts',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(review)});
    assert.equal(response.status,403);
  }
  const config=await (await fetch(base+'/api/config')).json(); assert.equal(config.sharedBoardConfigured,true); assert.ok(!JSON.stringify(config).includes('server-key'));
  for (const path of ['/server/shared-db.js','/server/shared-auth.js','/supabase/schema.sql','/.env']) assert.equal((await fetch(base+path)).status,404);
});
