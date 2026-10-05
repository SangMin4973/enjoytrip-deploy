import test from 'node:test';
import assert from 'node:assert/strict';
import { readPosts, createPost, findPost, updatePost, deletePost } from '../js/board-store.js';
import { makeServer } from '../server.mjs';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const input = { subject: ' 여행의 한 끼 ', writer: ' 여행자 ', content: ' 첫째 줄\n둘째 줄 ' };

test('기존 게시글 번호와 추가 필드를 보존하며 작성·조회·수정·삭제한다', () => {
  memory.clear();
  const legacy = { index: 7, subject: '기존 글', writer: '기존 작성자', content: '기존 내용', date: '2025-01-02', views: 3, extra: '보존' };
  memory.set('boards', JSON.stringify([legacy]));
  const created = createPost(input);
  assert.equal(created.index, 8);
  assert.equal(created.subject, '여행의 한 끼');
  assert.equal(created.content, '첫째 줄\n둘째 줄');
  assert.deepEqual(readPosts()[0], legacy);
  assert.equal(findPost('7', { countView: true }).views, 4);
  assert.equal(findPost('7').views, 4);
  updatePost('7', { ...input, subject: '수정 글' });
  const updated = findPost(7);
  assert.equal(updated.date, legacy.date);
  assert.equal(updated.views, 4);
  assert.equal(updated.extra, '보존');
  deletePost(7);
  assert.equal(readPosts().length, 1);
  assert.equal(findPost(8).subject, '여행의 한 끼');
  assert.throws(() => findPost(7), /찾을 수 없습니다/);
  assert.throws(() => updatePost(7, input), /수정할 게시글/);
  assert.throws(() => findPost(null), /주소/);
  assert.throws(() => findPost('../.env'), /주소/);
});

test('공백·과도한 입력과 손상된 저장소를 거부하고 기존 데이터를 덮어쓰지 않는다', () => {
  memory.clear();
  for (const key of ['subject', 'writer', 'content']) assert.throws(() => createPost({ ...input, [key]: '   ' }), /입력해/);
  assert.throws(() => createPost({ ...input, subject: '가'.repeat(121) }), /120자/);
  for (const raw of ['{broken', '{}', '[{"index":0}]', JSON.stringify([{ index: 0, ...input }, { index: 0, ...input }])]) {
    memory.set('boards', raw);
    assert.throws(() => createPost(input), /읽지 못|형식/);
    assert.equal(memory.get('boards'), raw);
  }
  memory.clear();
});

test('서버가 게시판 네 화면·모듈·스타일을 제공하고 서버 파일은 계속 차단한다', async context => {
  const server = makeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/board/list.html', '/board/write.html', '/board/view.html?index=7', '/board/modify.html?index=7', '/css/board.css', '/js/board.js', '/js/board-store.js']) assert.equal((await fetch(base + path)).status, 200, path);
  for (const path of ['/board/unknown.html', '/board/../server.mjs', '/.env', '/server/tour.js']) assert.equal((await fetch(base + path)).status, 404, path);
});
