import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTour, parseTourResponse, tourRoute } from '../server/tour.js';
import { makeServer } from '../server.mjs';

function success(items, total = items.length) {
  return JSON.stringify({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: { item: items }, totalCount: total } } });
}

test('실제 발생한 HTTP 403 JSON 인증 오류에서 서비스키 오류 30을 읽는다', () => {
  const text = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: {
    errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키', returnReasonCode: '30',
  } } });
  assert.throws(() => parseTourResponse(text, 403), (error) => error.code === '30' && /등록되지 않은 서비스키/.test(error.message));
});

test('매뉴얼의 XML 인증 오류와 사용량·권한·만료 오류를 구분한다', () => {
  for (const [code, expected] of [['20', '접근이 거부'], ['22', '한도를 초과'], ['30', '등록되지 않은 서비스키'], ['31', '만료'], ['32', '등록되지 않은 IP']]) {
    const xml = `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    assert.throws(() => parseTourResponse(xml, 403), (error) => error.code === code && error.message.includes(expected));
  }
  assert.throws(() => parseTourResponse('<html>Bad Gateway</html>', 502), /HTTP 오류 \(502\)/);
  assert.throws(() => parseTourResponse('<html>not JSON</html>'), /응답 형식/);
  assert.throws(() => parseTourResponse('{}'), /결과코드/);
});

test('키 누락·네트워크·시간 초과를 각각 전달하고 키를 오류 메시지에 노출하지 않는다', async () => {
  await assert.rejects(fetchTour('ldongCode2', {}, { key: '' }), (error) => error.code === 'MISSING_KEY' && error.status === 503);
  await assert.rejects(fetchTour('ldongCode2', {}, { key: 'secret-value', fetchImpl: async () => { throw new TypeError('secret-value'); } }), (error) => error.code === 'NETWORK_ERROR' && !error.message.includes('secret-value'));
  await assert.rejects(fetchTour('ldongCode2', {}, { key: 'secret-value', fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }), (error) => error.code === 'TIMEOUT' && error.status === 504);
});

test('매뉴얼 v4.4의 시도·시군구·목록·한글검색·상세 요청 파라미터를 사용한다', async () => {
  const requested = [];
  const options = { key: 'example%2Bkey%3D', fetchImpl: async (url) => {
    const parsed = new URL(url);
    requested.push(parsed);
    const items = parsed.pathname.endsWith('/ldongCode2') ? [{ code: '11', name: '서울특별시' }]
      : [{ contentid: '126128', contenttypeid: '12', title: '관광지', addr1: '주소', mapx: '126.9', mapy: '37.5', overview: '상세 설명' }];
    return { status: 200, text: async () => success(items) };
  } };
  const areas = await tourRoute('/api/tour/areas', new URLSearchParams(), options);
  assert.deepEqual(areas, [{ code: '11', name: '서울특별시' }]);
  await tourRoute('/api/tour/districts', new URLSearchParams({ area: '11' }), options);
  await tourRoute('/api/tour/places', new URLSearchParams({ area: '11', district: '110', type: '39', page: '2', size: '10' }), options);
  await tourRoute('/api/tour/places', new URLSearchParams({ area: '11', keyword: '전통 시장' }), options);
  const detail = await tourRoute('/api/tour/detail', new URLSearchParams({ id: '126128', type: '12' }), options);
  for (const url of requested) {
    assert.ok(url.pathname.startsWith('/B551011/KorService2/'));
    assert.equal(url.searchParams.get('serviceKey'), 'example+key=');
    assert.equal(url.searchParams.get('_type'), 'json');
    assert.equal(url.searchParams.get('MobileOS'), 'WEB');
    assert.equal(url.searchParams.get('MobileApp'), 'EnjoyTripBase');
    assert.ok(!url.pathname.endsWith('/areaCode2'));
  }
  assert.equal(requested[0].searchParams.get('lDongListYn'), 'N');
  assert.equal(requested[0].searchParams.has('lDongRegnCd'), false);
  assert.equal(requested[1].searchParams.get('lDongRegnCd'), '11');
  assert.equal(requested[2].searchParams.get('lDongSignguCd'), '110');
  assert.equal(requested[2].searchParams.get('contentTypeId'), '39');
  assert.equal(requested[2].searchParams.get('pageNo'), '2');
  assert.ok(requested[3].pathname.endsWith('/searchKeyword2'));
  assert.equal(requested[3].searchParams.get('keyword'), '전통 시장');
  assert.equal(requested[4].searchParams.get('contentId'), '126128');
  assert.equal(detail.overview, '상세 설명');
  assert.deepEqual(parseTourResponse(success([], 0)), { items: [], total: 0 });
});

test('로컬 중계 서버가 인증 실패 코드를 브라우저에 전달한다', async (context) => {
  const server = makeServer({ tourOptions: { key: 'example', fetchImpl: async () => ({
    status: 403,
    text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30' } } }),
  }) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tour/areas`);
  assert.equal(response.status, 502);
  const result = await response.json();
  assert.equal(result.code, '30');
  assert.match(result.error, /등록되지 않은 서비스키/);
});
