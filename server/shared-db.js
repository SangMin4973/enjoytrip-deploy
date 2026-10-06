import { boardError } from '../js/board-schema.js';

export function createSharedDb({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch } = {}) {
  const configured = !!(url?.trim() && key?.trim());
  if (configured && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) throw new Error('SUPABASE_URL 형식이 올바르지 않습니다.');
  async function request(table, { query = {}, method = 'GET', body, prefer = 'return=representation' } = {}) {
    if (!configured) throw boardError('공유 DB 설정이 필요합니다.', 503);
    const endpoint = new URL(`/rest/v1/${table}`, url);
    endpoint.search = new URLSearchParams(query);
    let response;
    try { response = await fetchImpl(endpoint, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000) }); }
    catch { throw boardError('공유 DB에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503); }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (result.code === '23505') throw boardError('이미 사용 중인 아이디 또는 이메일입니다.', 409);
      throw boardError('공유 DB 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
    }
    if (response.status === 204) return [];
    try { return await response.json(); }
    catch { throw boardError('공유 DB 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', 503); }
  }
  return { configured, request };
}
