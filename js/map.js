import { loadKakaoSdk } from './kakao-sdk.js';

let map;
let markers = [];

export async function initMap(key) {
  const message = document.querySelector('#map-message');
  if (!key) {
    message.textContent = '지도는 선택 기능입니다. 카카오 지도 키를 설정하면 조회한 장소를 지도에 표시합니다.';
    return;
  }
  try {
    await loadKakaoSdk(key);
    const container = document.querySelector('#map');
    container.hidden = false;
    map = new window.kakao.maps.Map(container, { center: new window.kakao.maps.LatLng(37.5665, 126.978), level: 7 });
    message.textContent = '조회 결과의 좌표를 표시합니다. 샘플 모드의 위치는 가상 좌표입니다.';
  } catch {
    message.textContent = `지도를 불러오지 못했습니다. 카카오 앱의 JavaScript 키와 JavaScript SDK 도메인에 ${location.origin}이 등록되어 있는지 확인해 주세요. 목록 조회는 계속 사용할 수 있습니다.`;
  }
}

export function updateMap(places) {
  if (!map) return;
  map.relayout();
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
  const bounds = new window.kakao.maps.LatLngBounds();
  for (const place of places) {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue;
    const position = new window.kakao.maps.LatLng(place.latitude, place.longitude);
    bounds.extend(position);
    markers.push(new window.kakao.maps.Marker({ map, position, title: place.name }));
  }
  if (markers.length) map.setBounds(bounds);
}
