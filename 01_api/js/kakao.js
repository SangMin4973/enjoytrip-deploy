// TODO: 01-02. 카카오맵을 초기화 하는 함수를 살펴보세요. 

import { KAKAO_MAP_KEY } from "./keys.js";

// 카카오 맵 SDK를 동적으로 로드하기 위한 헬퍼 함수
export function loadKakaoMap() {
  return new Promise((resolve) => {
    if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => kakao.maps.load(resolve);
    document.head.appendChild(script);
  });
}


// END

// marker 목록
export let geocoder = null;
export const markers = [];
export let map = null;

// 지도를 초기화하는 함수
export const initMap = (containerId = "map") => {
  if (map) {
    return; // 이미 초기화 되었다면 종료
  }
  const mapContainer = document.getElementById(containerId); // 지도를 표시할 div
  const mapOption = {
    center: new kakao.maps.LatLng(33.450701, 126.570667), // 지도의 중심좌표
    level: 3, // 지도의 확대 레벨
  };
  map = new kakao.maps.Map(mapContainer, mapOption);
  geocoder = new kakao.maps.services.Geocoder();
};

export const updateMap = async (infos) => {
  markers.forEach((m) => m.setMap(null));
  markers.length = 0; // 마커와 경계 초기화

  const bounds = new kakao.maps.LatLngBounds(); // 지도 경계 초기화
  try {
    // TODO: 01-07. 좌표가 없는 경우 geocoder를 통해 좌표를 갱신해주자.
     const promises = infos.filter(info => !info.x || info.y)
     .map(info => new Promise(resolve => {
      geocoder.addressSearch(info.address, (result, status)=>{
        if(status === kakao.maps.services.Status.OK){
          info.x = result[0].x;
          info.y = result[0].y;
        } else{
          console.warn("변환 실패", info.address)
          info.x = info.y = -1;
        }
        resolve();
      })
     }))

    // END

    await Promise.all(promises); // 모두 resolve 되면.

    for (let info of infos) {
      // 잘못된 좌표가 들어오는 경우는 filtering(우리나라만 취급)
      if (124.5 <= info.x && info.x <= 132 && 33.0 <= info.y && info.y <= 38.6) {
        setOverlay(info, bounds);
      } else {
        console.warn("좌표가 유효하지 않습니다:", info);
      }
    }
    // 지도 경계 설정
    map.setBounds(bounds);
  } catch (e) {
    console.log(e);
  }
};

// 실제 마커를 등록하고 경계를 확장하는 함수
const setOverlay = (info, bounds) => {
  const coords = new kakao.maps.LatLng(info.y, info.x);
  bounds.extend(coords);
  const marker = new kakao.maps.Marker({ map: map, position: coords });
  markers.push(marker);

  // https://apis.map.kakao.com/web/sample/addMarkerMouseEvent/
  // 마커에 커서가 오버됐을 때 마커 위에 표시할 인포윈도우를 생성합니다
  const iwContent = `<div style="padding:5px;">${info.label}</div>`;

  // 인포윈도우를 생성합니다
  const infowindow = new kakao.maps.InfoWindow({
    content: iwContent,
  });

  // 마커에 마우스오버 이벤트를 등록합니다
  kakao.maps.event.addListener(marker, "mouseover", function () {
    // 마커에 마우스오버 이벤트가 발생하면 인포윈도우를 마커위에 표시합니다
    infowindow.open(map, marker);
  });

  // 마커에 마우스아웃 이벤트를 등록합니다
  kakao.maps.event.addListener(marker, "mouseout", function () {
    // 마커에 마우스아웃 이벤트가 발생하면 인포윈도우를 제거합니다
    infowindow.close();
  });
};
