import { buildRestaurantSearchQuery } from './restaurant-search.js';

// 화면에 들어온 카드만 조회합니다. 목록을 바꾸면 대기·진행 요청을 취소합니다.
export function populateRestaurantImages(list, restaurants) {
  const controller = new AbortController(), queue = [];
  const byId = new Map(restaurants.map(item => [item.id, item]));
  let running = 0, stopped = false;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const restaurant = byId.get(entry.target.closest('[data-id]')?.dataset.id);
      if (restaurant) queue.push({ box: entry.target, restaurant });
    }
    drain();
  }, { root: list });

  async function load({ box, restaurant }) {
    try {
      const response = await fetch(`/api/restaurant-image?q=${encodeURIComponent(buildRestaurantSearchQuery(restaurant))}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]),
      });
      const result = await response.json();
      if (!response.ok) {
        if (['ACCESS_DENIED', 'MISSING_CONFIG', 'INVALID_CONFIG', 'QUOTA_EXCEEDED'].includes(result.code)) { stopped = true; queue.length = 0; observer.disconnect(); }
        throw new Error(result.error);
      }
      if (!result.image || !box.isConnected || controller.signal.aborted) return;
      const image = document.createElement('img');
      image.alt = `${restaurant.name} 검색 이미지`; image.referrerPolicy = 'no-referrer'; image.src = result.image.url;
      image.addEventListener('load', () => {
        if (!box.isConnected || controller.signal.aborted) return;
        const caption = document.createElement('span'); caption.textContent = '검색 이미지';
        box.replaceChildren(image, caption); box.classList.remove('photo-unavailable'); box.classList.add('photo-search');
        box.title = result.image.title || 'Google 이미지 검색 첫 결과';
      }, { once: true });
    } catch (error) {
      if (!controller.signal.aborted && box.isConnected) box.title = error.message || '이미지를 불러오지 못했습니다.';
    }
  }
  function drain() {
    while (!stopped && !controller.signal.aborted && running < 2 && queue.length) {
      running++;
      load(queue.shift()).finally(() => { running--; drain(); });
    }
  }
  list.querySelectorAll('.restaurant-photo').forEach(box => observer.observe(box));
  return () => { observer.disconnect(); queue.length = 0; controller.abort(); };
}
