import { randomBytes, createHash, timingSafeEqual, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { boardError } from '../js/board-schema.js';

const derive = promisify(pbkdf2), ITERATIONS = 310000, COOKIE = 'matzip_session';
const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, createdAt: user.created_at });
function profile(input) {
  const id = String(input.id || '').trim(), name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase();
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(id)) throw boardError('아이디는 영문, 숫자, 밑줄로 4~20자 입력해 주세요.');
  if (!name || name.length > 30) throw boardError('이름은 1~30자로 입력해 주세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw boardError('올바른 이메일을 입력해 주세요.');
  return { id, name, email };
}
function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw boardError('비밀번호는 8~128자로 입력해 주세요.');
  return value;
}
async function record(value) {
  const salt = randomBytes(16).toString('hex');
  return { salt, password_hash: (await derive(password(value), salt, ITERATIONS, 32, 'sha256')).toString('hex'), iterations: ITERATIONS };
}
async function matches(user, value) {
  const actual = await derive(password(value), user.salt, user.iterations, 32, 'sha256');
  const expected = Buffer.from(user.password_hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function token(request) {
  return request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
function cookie(response, value, seconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`);
}

export function createSharedAuth(db) {
  const attempts = new Map();
  function limit(request) {
    // Render의 프록시가 마지막에 추가한 주소만 사용합니다.
    const address = (request.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim() || request.socket.remoteAddress;
    const now = Date.now(), state = attempts.get(address);
    if (!state || state.until <= now) attempts.set(address, { count: 1, until: now + 300000 });
    else if (++state.count > 30) throw boardError('로그인 시도가 많습니다. 5분 후 다시 시도해 주세요.', 429);
    if (attempts.size > 1000) for (const [id, value] of attempts) if (value.until <= now) attempts.delete(id);
  }
  async function session(request) {
    const value = token(request);
    if (!/^[a-f0-9]{64}$/.test(value)) return null;
    const [session] = await db.request('matzip_sessions', { query: { token_hash: `eq.${hash(value)}`, expires_at: `gt.${new Date().toISOString()}`, select: 'user_id,confirmed_until', limit: '1' } });
    if (!session) return null;
    const [user] = await db.request('matzip_members', { query: { id: `eq.${session.user_id}`, select: '*', limit: '1' } });
    return user ? { user, tokenHash: hash(value), confirmedUntil: session.confirmed_until } : null;
  }
  async function requireUser(request, { confirmed = false } = {}) {
    const current = await session(request);
    if (!current) throw boardError('로그인 후 이용해 주세요.', 401);
    if (confirmed && (!current.confirmedUntil || Date.parse(current.confirmedUntil) < Date.now())) throw boardError('비밀번호를 다시 확인해 주세요.', 403);
    return current;
  }
  async function route(path, request, response, input = {}) {
    if (path === '/api/auth/me' && request.method === 'GET') {
      const current = await session(request); return { user: current ? publicUser(current.user) : null };
    }
    if (request.method !== 'POST') throw boardError('지원하지 않는 요청입니다.', 405);
    if (path === '/api/auth/register') {
      limit(request); const values = profile(input), secret = await record(input.password);
      const [created] = await db.request('matzip_members', { method: 'POST', body: { ...values, ...secret } });
      return { user: publicUser(created) };
    }
    if (path === '/api/auth/login') {
      limit(request); const identifier = String(input.identifier || '').trim();
      if (!identifier || identifier.length > 254) throw boardError('아이디 또는 이메일을 입력해 주세요.');
      const [user] = await db.request('matzip_members', { query: { [identifier.includes('@') ? 'email' : 'id']: `eq.${identifier.includes('@') ? identifier.toLowerCase() : identifier}`, select: '*', limit: '1' } });
      // 없는 계정에도 비밀번호 연산을 수행합니다.
      const candidate = user || { salt: '0'.repeat(32), iterations: ITERATIONS, password_hash: '0'.repeat(64) };
      if (!(await matches(candidate, input.password)) || !user) throw boardError('아이디·이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      const value = randomBytes(32).toString('hex'), seconds = input.remember === false ? 43200 : 2592000;
      await db.request('matzip_sessions', { method: 'POST', body: { token_hash: hash(value), user_id: user.id, expires_at: new Date(Date.now() + seconds * 1000).toISOString() } });
      cookie(response, value, seconds); return { user: publicUser(user) };
    }
    if (path === '/api/auth/logout') {
      if (/^[a-f0-9]{64}$/.test(token(request))) await db.request('matzip_sessions', { method: 'DELETE', query: { token_hash: `eq.${hash(token(request))}` } });
      cookie(response, '', 0); return { user: null };
    }
    const current = await requireUser(request, { confirmed: ['/api/auth/profile', '/api/auth/delete'].includes(path) });
    if (path === '/api/auth/confirm') {
      limit(request);
      if (!(await matches(current.user, input.password))) throw boardError('비밀번호가 일치하지 않습니다.', 403);
      await db.request('matzip_sessions', { method: 'PATCH', query: { token_hash: `eq.${current.tokenHash}` }, body: { confirmed_until: new Date(Date.now() + 600000).toISOString() } });
      return { confirmed: true };
    }
    if (path === '/api/auth/profile') {
      const values = profile({ ...input, id: current.user.id }); delete values.id;
      if (input.password) Object.assign(values, await record(input.password));
      const [updated] = await db.request('matzip_members', { method: 'PATCH', query: { id: `eq.${current.user.id}` }, body: values });
      if (input.password) {
        await db.request('matzip_sessions', { method: 'DELETE', query: { user_id: `eq.${current.user.id}`, token_hash: `neq.${current.tokenHash}` } });
        await db.request('matzip_sessions', { method: 'PATCH', query: { token_hash: `eq.${current.tokenHash}` }, body: { confirmed_until: null } });
      }
      return { user: publicUser(updated) };
    }
    if (path === '/api/auth/delete') {
      await db.request('matzip_members', { method: 'DELETE', query: { id: `eq.${current.user.id}` } });
      cookie(response, '', 0); return { user: null };
    }
    throw boardError('없는 인증 API입니다.', 404);
  }
  return { route, requireUser };
}
