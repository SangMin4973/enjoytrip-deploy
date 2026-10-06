export async function sharedRequest(path, { method = 'GET', body } = {}) {
  let response;
  try { response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('공유 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '요청을 처리하지 못했어요.'), { status: response.status });
  return result;
}
