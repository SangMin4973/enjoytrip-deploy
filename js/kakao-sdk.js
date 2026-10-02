let loading;

// 모든 지도와 실제 장소 검색에서 services를 포함한 SDK를 공유합니다.
export function loadKakaoSdk(key) {
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
  if (loading) return loading;
  if (!key) return Promise.reject(new Error('지도 키가 없습니다.'));
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = message => { clearTimeout(timeout); script.remove(); reject(new Error(message)); };
    const timeout = setTimeout(() => fail('카카오맵 로딩 시간이 초과됐어요. 다시 시도해 주세요.'), 10000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=${encodeURIComponent(key)}`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        fail('카카오맵 SDK를 불러오지 못했어요. 앱 권한과 등록 도메인을 확인해 주세요.');
        return;
      }
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(window.kakao.maps);
      });
    };
    script.onerror = () => fail('카카오맵 SDK를 불러오지 못했어요. 앱 권한과 등록 도메인을 확인해 주세요.');
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
