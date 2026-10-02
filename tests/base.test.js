import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_TYPES, getMockPlaces } from '../js/data.js';
import * as auth from '../js/auth.js';
import { fetchTour, normalizePlace } from '../server/tour.js';
import { makeServer } from '../server.mjs';

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key),
};

test('지역·시군구·유형 필터와 페이지가 샘플 결과를 제한한다', () => {
  for (const type of CONTENT_TYPES) {
    const result = getMockPlaces({ area: '11', district: '110', type: type.code });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].typeCode, type.code);
  }
  const first = getMockPlaces({ area: '26', size: 10, page: 1 });
  const second = getMockPlaces({ area: '26', size: 10, page: 2 });
  assert.equal(first.total, 16);
  assert.equal(second.items.length, 6);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 16);
  assert.equal(getMockPlaces({ keyword: '없는장소' }).total, 0);
});

test('회원 가입·중복 검증·로그인·수정·재설정·탈퇴 흐름', async () => {
  stored.clear();
  const input = { id: 'tester', name: '테스터', email: 'test@example.com', password: 'password123' };
  await auth.register(input);
  assert.equal(auth.currentUser(), null);
  assert.ok(!stored.get('enjoytrip.base.users').includes('password123'));
  await assert.rejects(auth.register(input), /아이디/);
  await assert.rejects(auth.login('tester', 'wrongpassword'), /올바르지/);
  await auth.login('tester', 'password123');
  assert.equal(auth.currentUser().name, '테스터');
  await auth.updateProfile({ name: '수정 이름', email: 'updated@example.com', password: 'updated123' });
  auth.logout();
  await assert.rejects(auth.login('tester', 'password123'), /올바르지/);
  await auth.login('tester', 'updated123');
  await assert.rejects(auth.resetPassword({ id: 'tester', email: 'wrong@example.com', password: 'reset1234' }), /일치/);
  await auth.resetPassword({ id: 'tester', email: 'updated@example.com', password: 'reset1234' });
  assert.equal(auth.currentUser(), null);
  await auth.login('tester', 'reset1234');
  assert.equal(auth.currentUser().name, '수정 이름');
  auth.deleteAccount();
  assert.equal(auth.currentUser(), null);
  await assert.rejects(auth.login('tester', 'reset1234'), /올바르지/);
});

test('입력 오류와 손상된 회원 데이터를 저장 완료로 처리하지 않는다', async () => {
  stored.clear();
  await assert.rejects(auth.register({ id: 'a', name: '테스트', email: 'x@y.com', password: 'password123' }), /아이디/);
  stored.set('enjoytrip.base.users', '{broken');
  assert.throws(() => auth.currentUser(), /읽을 수/);
  stored.clear();
});

test('관광 API 단일 항목 정규화, 키 인코딩과 제공자 오류 처리', async () => {
  let requested;
  const response = await fetchTour('areaBasedList2', { lDongRegnCd: '11' }, {
    key: 'example%2Bkey%3D',
    fetchImpl: async (url) => {
      requested = new URL(url);
      return { ok: true, json: async () => ({ response: { header: { resultCode: '0000' }, body: { totalCount: 1, items: { item: { contentid: '123', title: '관광지' } } } } }) };
    },
  });
  assert.equal(requested.searchParams.get('serviceKey'), 'example+key=');
  assert.equal(requested.searchParams.get('lDongRegnCd'), '11');
  assert.equal(response.items.length, 1);
  assert.deepEqual(normalizePlace({ contentid: 123, contenttypeid: 12, mapx: '', mapy: '0', overview: '설명<br>다음' }), {
    id: '123', name: '이름 없음', typeCode: '12', address: '', longitude: null, latitude: null,
    phone: '', overview: '설명\n다음', source: '한국관광공사 TourAPI',
  });
  await assert.rejects(fetchTour('areaBasedList2', {}, { key: '' }), /SERVICE_KEY/);
  await assert.rejects(fetchTour('areaBasedList2', {}, { key: 'example', fetchImpl: async () => ({ ok: true, json: async () => ({ response: { header: { resultCode: '30' } } }) }) }), /실패/);
});

test('로컬 서버가 화면을 제공하고 환경설정·서버 소스를 노출하지 않는다', async (context) => {
  const server = makeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/js/main.js`)).status, 200);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.ok(!Object.hasOwn(config, 'tourApiServiceKey'));
  assert.equal((await fetch(`${base}/api/tour/places?area=invalid`)).status, 400);
});
