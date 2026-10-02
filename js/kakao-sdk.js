let loading;

// 로그인 배경과 관광정보 지도에서 SDK를 한 번만 불러옵니다.
export function loadKakaoSdk(key) {
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
  if (loading) return loading;
  if (!key) return Promise.reject(new Error('지도 키가 없습니다.'));
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('지도 로딩 시간 초과')), 10000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(key)}`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        clearTimeout(timeout);
        reject(new Error('지도 SDK 오류'));
        return;
      }
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(window.kakao.maps);
      });
    };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('지도 SDK 오류')); };
    document.head.append(script);
  });
  return loading;
}
