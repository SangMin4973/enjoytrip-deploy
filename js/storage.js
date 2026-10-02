const PREFIX = 'enjoytrip.base.';

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    throw new Error('브라우저 저장 데이터를 읽을 수 없습니다. 저장소 설정과 데이터 상태를 확인해 주세요.');
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    throw new Error('브라우저에 저장하지 못했습니다. 저장 공간이나 브라우저 설정을 확인해 주세요.');
  }
}

export function removeStorage(key) {
  localStorage.removeItem(PREFIX + key);
}
