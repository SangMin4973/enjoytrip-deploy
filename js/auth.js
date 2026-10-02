import { readStorage, writeStorage, removeStorage } from './storage.js';

function users() {
  const value = readStorage('users', []);
  if (!Array.isArray(value)) throw new Error('회원 저장 데이터의 형식이 올바르지 않습니다.');
  return value;
}

function validateProfile({ id, name, email }) {
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(id)) throw new Error('아이디는 영문, 숫자, 밑줄로 4~20자 입력해 주세요.');
  if (!name?.trim() || name.trim().length > 30) throw new Error('이름은 1~30자로 입력해 주세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('올바른 이메일을 입력해 주세요.');
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('비밀번호는 8~128자로 입력해 주세요.');
  }
}

const hex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

async function passwordRecord(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  validatePassword(password);
  if (!crypto.subtle) throw new Error('회원 기능은 localhost 또는 HTTPS에서 실행해 주세요.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000,
  }, key, 256);
  return { salt, passwordHash: hex(new Uint8Array(bits)) };
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export function currentUser() {
  const expiresAt = readStorage('sessionExpiresAt', null);
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) {
    logout();
    return null;
  }
  return publicUser(users().find((user) => user.id === readStorage('session', null)));
}

export async function register({ id, name, email, password }) {
  id = id.trim(); name = name.trim(); email = email.trim();
  validateProfile({ id, name, email });
  const record = await passwordRecord(password);
  // 해시 계산 이후 다시 읽어 중복 가입이나 이전 저장 내용을 덮어쓰지 않습니다.
  const all = users();
  if (all.some((user) => user.id.toLowerCase() === id.toLowerCase())) throw new Error('이미 사용 중인 아이디입니다.');
  if (all.some((user) => user.email.toLowerCase() === email.toLowerCase())) throw new Error('이미 등록된 이메일입니다.');
  const user = { id, name, email, ...record, createdAt: new Date().toISOString() };
  writeStorage('users', [...all, user]);
  return publicUser(user);
}

export async function login(identifier, password, { remember = true } = {}) {
  const value = identifier.trim();
  const user = users().find((entry) => entry.id === value || entry.email.toLowerCase() === value.toLowerCase());
  if (!user || (await passwordRecord(password, user.salt)).passwordHash !== user.passwordHash) {
    throw new Error('이메일·아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const duration = (remember ? 30 * 24 : 12) * 60 * 60 * 1000;
  writeStorage('sessionExpiresAt', Date.now() + duration);
  writeStorage('session', user.id);
  return publicUser(user);
}

export function logout() {
  removeStorage('session');
  removeStorage('sessionExpiresAt');
}

export async function updateProfile({ name, email, password }) {
  const user = currentUser();
  if (!user) throw new Error('먼저 로그인해 주세요.');
  name = name.trim(); email = email.trim();
  validateProfile({ id: user.id, name, email });
  const record = password ? await passwordRecord(password) : {};
  const all = users();
  if (all.some((entry) => entry.id !== user.id && entry.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('이미 등록된 이메일입니다.');
  }
  writeStorage('users', all.map((entry) => entry.id === user.id ? { ...entry, name, email, ...record } : entry));
  return currentUser();
}

export function deleteAccount() {
  const user = currentUser();
  if (!user) throw new Error('먼저 로그인해 주세요.');
  writeStorage('users', users().filter((entry) => entry.id !== user.id));
  logout();
}

// 수업용 데모: 이메일 발송/본인 인증 서버가 없어 실제 서비스 인증으로 쓸 수 없습니다.
export async function resetPassword({ id, email, password }) {
  const user = users().find((entry) => entry.id === id.trim() && entry.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) throw new Error('아이디와 이메일이 일치하는 회원이 없습니다.');
  const record = await passwordRecord(password);
  writeStorage('users', users().map((entry) => entry.id === user.id ? { ...entry, ...record } : entry));
  if (readStorage('session', null) === user.id) logout();
}
