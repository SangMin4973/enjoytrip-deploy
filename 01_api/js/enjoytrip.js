import { DATA_GO_KR_API_KEY } from "./keys.js";
import { getFetch, updateSelect } from "./common.js";
import { map, updateMap } from "./kakao.js"; // map 객체 추가 import

const selectClass1 = document.querySelector("#selectClass1");
const selectClass2 = document.querySelector("#selectClass2");
const selectClass3 = document.querySelector("#selectClass3");
const selectSido = document.querySelector("#selectSido");
const selectGugun = document.querySelector("#selectGugun");

const endPoint = "https://apis.data.go.kr/B551011/KorService2";
const commonConfig = {
  serviceKey: DATA_GO_KR_API_KEY,
  numOfRows: 100,
  pageNo: 1,
  MobileOS: "WEB",
  MobileApp: "WEB",
  _type: "json",
};

export const initEnjoyTrip = async () => {
  try {
    const [json1, json2] = await Promise.all([
      getFetch(`${endPoint}/lclsSystmCode2`, {
        ...commonConfig,
        lclsSystmListYn: "N",
      }),
      getFetch(`${endPoint}/ldongCode2`, {
        ...commonConfig,
        lDongListYn: "N",
      }),
    ]);

    updateSelect(selectClass1, json1.response.body.items.item);
    updateSelect(selectClass2);
    updateSelect(selectClass3);

    updateSelect(selectSido, json2.response.body.items.item);
    updateSelect(selectGugun);
  } catch (e) {
    console.log(e);
  }
};

selectClass1.addEventListener("change", async function () {
  try {
    const json = await getFetch(`${endPoint}/lclsSystmCode2`, {
      ...commonConfig,
      lclsSystmListYn: "N",
      lclsSystm1: selectClass1.value,
    });
    updateSelect(selectClass2, json.response.body.items.item);
    updateSelect(selectClass3);
  } catch (e) {
    console.log(e);
  }
});

selectClass2.addEventListener("change", async function () {
  try {
    const json = await getFetch(`${endPoint}/lclsSystmCode2`, {
      ...commonConfig,
      lclsSystmListYn: "N",
      lclsSystm1: selectClass1.value,
      lclsSystm2: selectClass2.value,
    });
    updateSelect(selectClass3, json.response.body.items.item);
  } catch (e) {
    console.log(e);
  }
});

selectSido.addEventListener("change", async function () {
  try {
    const json = await getFetch(`${endPoint}/ldongCode2`, {
      ...commonConfig,
      lDongListYn: "N",
      lDongRegnCd: selectSido.value,
    });
    updateSelect(selectGugun, json.response.body.items.item);
  } catch (e) {
    console.log(e);
  }
});

document.querySelector("#btn_trip_search").addEventListener("click", async () => {
  const queryObj = {
    ...commonConfig,
    numOfRows: 20, // 마커 표시는 20개로 제한
  };

  if (selectSido.value) {
    queryObj.lDongRegnCd = selectSido.value;
  }
  if (selectGugun.value) {
    queryObj.lDongSignguCd = selectGugun.value;
  }
  if (selectClass1.value) {
    queryObj.lclsSystm1 = selectClass1.value;
  }
  if (selectClass2.value) {
    queryObj.lclsSystm2 = selectClass2.value;
  }
  if (selectClass3.value) {
    queryObj.lclsSystm3 = selectClass3.value;
  }

  try {
    const json = await getFetch(`${endPoint}/areaBasedList2`, queryObj);
    const spots = json.response.body.items.item;
    if (!spots || spots.length === 0) {
      alert("조회된 결과가 없습니다.");
      return;
    }
    spots.forEach((element) => {
      element.x = element.mapx;
      element.y = element.mapy;
      element.address = element.addr1;
      element.label = element.title;
    });
    updateMap(spots);
  } catch (e) {
    console.log(e);
  }
});

// 주변 관광지 조회 버튼 클릭 시 이벤트 처리
document.querySelector("#btn_around_search").addEventListener("click", async () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        await searchAround(lat, lng);
      },
      async (error) => {
        console.warn("Geolocation 획득 실패, 지도 중심 좌표로 조회합니다.");
        const center = map.getCenter();
        await searchAround(center.getLat(), center.getLng());
      },
    );
  } else {
    const center = map.getCenter();
    await searchAround(center.getLat(), center.getLng());
  }
});

// 위치 기반 관광 정보 조회 API (/locationBasedList2) 호출 함수
async function searchAround(lat, lng) {
  const queryObj = {
    ...commonConfig,
    mapX: lng, // 경도 (WGS84)
    mapY: lat, // 위도 (WGS84)
    radius: 2000, // 반경 2km
    numOfRows: 30, // 30개 결과 표출
  };

  // 카테고리 필터가 설정되어 있다면 함께 쿼리 처리
  if (selectClass1.value) queryObj.lclsSystm1 = selectClass1.value;
  if (selectClass2.value) queryObj.lclsSystm2 = selectClass2.value;
  if (selectClass3.value) queryObj.lclsSystm3 = selectClass3.value;

  try {
    const json = await getFetch(`${endPoint}/locationBasedList2`, queryObj);
    const spots = json.response.body.items.item;
    if (!spots || spots.length === 0) {
      alert("주변에 조회된 관광 정보가 없습니다.");
      return;
    }
    spots.forEach((element) => {
      element.x = element.mapx;
      element.y = element.mapy;
      element.address = element.addr1;
      element.label = element.title;
    });

    // 지도 중심을 검색 위치로 이동
    map.setCenter(new kakao.maps.LatLng(lat, lng));
    updateMap(spots);
  } catch (e) {
    console.log(e);
  }
}
