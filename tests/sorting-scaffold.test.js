import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sortingCandidates, javaSortingInput, loadGoogleSortingData } from '../scripts/sorting-data.mjs';
import { createGooglePlaces } from '../server/google-places.js';

test('Java 정렬 입력은 전체 수집 순서·결측·최초 인덱스를 보존하고 키·사진·주소를 복제하지 않는다', () => {
  const input = [
    { id: 'google-one', name: '한글 식당', source: 'google', rating: 4.1, userRatingCount: 30, photos: ['private-photo'], key: 'private-key', address: '전달하지 않을 주소' },
    { id: 'google-two', name: '두 번째', source: 'google', rating: 5, userRatingCount: 1 },
    { id: 'kakao-3', name: '이전 장소', source: 'kakao' },
  ];
  const snapshot = structuredClone(input), result = sortingCandidates(input);
  assert.deepEqual(result.map(item => item.id), ['google-one', 'google-two', 'kakao-3']);
  assert.deepEqual(result.map(item => item.originalIndex), [0, 1, 2]);
  assert.equal(result[2].rating, null); assert.equal(result[2].userRatingCount, 0);
  assert.deepEqual(input, snapshot); assert.notEqual(result[0], input[0]);
  const serialized = JSON.stringify(result);
  for (const value of ['private-photo', 'private-key', '전달하지 않을 주소']) assert.ok(!serialized.includes(value));
});

test('Java 입력 전송은 한글·탭·개행이 포함된 이름을 손실 없이 구분하고 두 모드와 빈 배열을 지원한다', () => {
  const name = '한글\t이름\n둘째 줄';
  const result = javaSortingInput([{ id: 'one', name, source: 'google', rating: null, userRatingCount: 0 }], { mode: 'count', expectedIds: ['one'] }).trimEnd().split('\n');
  assert.equal(result[0], 'MATZIP_SORT_V1\tCOUNT_DESC\t1');
  const fields = result[1].split('\t'); assert.equal(fields.length, 6);
  assert.equal(Buffer.from(fields[1], 'base64').toString('utf8'), name);
  assert.deepEqual(fields.slice(2), ['google', 'null', '0', '0']);
  assert.equal(result[2], 'EXPECTED\tb25l');
  assert.equal(javaSortingInput([]), 'MATZIP_SORT_V1\tRATING_DESC\t0\nEXPECTED\n');
  assert.throws(() => javaSortingInput([], { mode: 'wrong' }), /모드/);
});

test('정렬 입력 변환에서 중복 ID·알 수 없는 출처를 거부하고 비정상 별점·평가 개수를 결측으로 처리한다', () => {
  const item = { id: 'one', name: '식당', source: 'google' };
  assert.throws(() => sortingCandidates([item, item]), /중복/);
  assert.throws(() => sortingCandidates([{ ...item, source: 'unknown' }]), /출처/);
  assert.throws(() => sortingCandidates(null), /배열/);
  for (const rating of [NaN, Infinity, 0, 6, '5', undefined]) assert.equal(sortingCandidates([{ ...item, rating }])[0].rating, null);
  for (const userRatingCount of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined])
    assert.equal(sortingCandidates([{ ...item, userRatingCount }])[0].userRatingCount, 0);
});

test('정렬 실습 데이터 호출은 기존 Google 검색·페이지 수집을 재사용하며 사진·Details를 추가 호출하지 않는다', async () => {
  const requests = [], key = 'private-server-key';
  const place = id => ({ id, displayName: { text: `식당 ${id}` }, location: { latitude: 35, longitude: 129 }, rating: 4.5, userRatingCount: 10,
    photos: [{ name: `places/${id}/photos/one`, authorAttributions: [{ displayName: '출처' }] }] });
  const google = createGooglePlaces({ key, fetchImpl: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json(requests.length === 1 ? { places: [place('one'), place('two')], nextPageToken: 'next' } : { places: [place('two'), place('three')] });
  } });
  const result = await loadGoogleSortingData(' 해운대 ', ' 국밥 ', { google });
  assert.equal(requests.length, 2); assert.ok(requests.every(item => item.url.pathname === '/v1/places:searchText'));
  assert.equal(requests[0].body.textQuery, '해운대 국밥'); assert.equal(requests[1].body.pageToken, 'next');
  assert.deepEqual(result.candidates.map(item => item.id), ['google-one', 'google-two', 'google-three']);
  assert.equal(result.pagesFetched, 2); assert.equal(result.truncated, false);
  assert.ok(result.candidates.every(item => !Object.hasOwn(item, 'photos')));
  assert.ok(!javaSortingInput(result.candidates).includes(key));
  await assert.rejects(loadGoogleSortingData('', '', { google }), /지역/);
  await assert.rejects(loadGoogleSortingData('가'.repeat(201), '', { google }), /200자/);
  await assert.rejects(loadGoogleSortingData('해운대', '', { google: { configured: false } }), /GOOGLE_PLACES_API_KEY/);
  assert.equal(requests.length, 2);
});

test('연습용 예상 결과는 세 모드에서 모든 입력 ID를 포함하고 실제 Google 데이터 없이 실행할 수 있다', async () => {
  const fixture = JSON.parse(await readFile(new URL('../algorithm-java/fixtures/sample.json', import.meta.url), 'utf8'));
  const ids = new Set(fixture.restaurants.map(item => item.id));
  for (const mode of ['rating', 'count', 'recommended']) {
    assert.deepEqual(new Set(fixture.expected[mode]), ids);
    assert.equal(fixture.expected[mode].length, fixture.restaurants.length);
    assert.ok(javaSortingInput(fixture.restaurants, { mode, expectedIds: fixture.expected[mode] }).startsWith('MATZIP_SORT_V1'));
  }
});
