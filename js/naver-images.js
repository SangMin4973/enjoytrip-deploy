import { buildRestaurantSearchQuery } from './restaurant-search.js';

export function initNaverImageGallery() {
  const list = document.querySelector('#restaurant-image-list');
  const feedback = document.querySelector('#restaurant-image-feedback');
  const count = document.querySelector('#restaurant-image-count');
  const retry = document.querySelector('#retry-images');
  const dialog = document.querySelector('#restaurant-image-dialog');
  const enlarged = document.querySelector('#restaurant-image-enlarged');
  const enlargedFeedback = document.querySelector('#restaurant-image-enlarged-feedback');
  let revision = 0, controller, restaurant, images = [];

  function clear() {
    revision++; controller?.abort(); controller = undefined; restaurant = undefined; images = [];
    list.replaceChildren(); list.setAttribute('aria-busy', 'false'); retry.hidden = true;
    count.textContent = ''; feedback.textContent = '';
    if (dialog.open) dialog.close();
  }

  async function load(selected) {
    clear(); restaurant = selected;
    const requestRevision = revision;
    controller = new AbortController();
    list.setAttribute('aria-busy', 'true');
    feedback.textContent = '가게 이미지를 검색하고 있어요…';
    const query = buildRestaurantSearchQuery(selected);
    document.querySelector('#restaurant-image-query').textContent = `“${query}” 검색 결과예요. 해당 가게의 사진인지 확인해 주세요.`;
    try {
      const response = await fetch(`/api/naver/images?q=${encodeURIComponent(query)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '이미지를 불러오지 못했어요.');
      if (!Array.isArray(result.images)) throw new Error('이미지 검색 결과를 읽지 못했어요.');
      if (revision !== requestRevision) return;
      images = result.images.slice(0, 5);
      count.textContent = `${images.length}개 / 최대 5개`;
      feedback.textContent = images.length ? '사진을 누르면 크게 볼 수 있어요.' : '검색된 가게 이미지가 없어요.';
      images.forEach((item, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'restaurant-image-card'; button.dataset.imageIndex = index;
        button.setAttribute('aria-label', `${selected.name} 검색 이미지 ${index + 1} 확대`);
        const image = document.createElement('img'); image.src = item.thumbnail; image.alt = item.title || `${selected.name} 검색 이미지 ${index + 1}`;
        image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        const caption = document.createElement('span'); caption.textContent = `${index + 1} / ${images.length}`;
        image.addEventListener('error', () => { image.hidden = true; caption.textContent = '미리보기 없음 · 확대'; }, { once: true });
        button.append(image, caption); list.append(button);
      });
    } catch (error) {
      if (revision !== requestRevision) return;
      count.textContent = '검색 실패'; feedback.textContent = error.name === 'TimeoutError' ? '이미지 검색이 오래 걸리고 있어요. 다시 시도해 주세요.' : error.message;
      retry.hidden = false;
    } finally {
      if (revision === requestRevision) list.setAttribute('aria-busy', 'false');
    }
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-image-index]');
    if (!button) return;
    const item = images[Number(button.dataset.imageIndex)];
    if (!item) return;
    document.querySelector('#restaurant-image-dialog-title').textContent = `${restaurant.name} · 이미지 ${Number(button.dataset.imageIndex) + 1}`;
    document.querySelector('#restaurant-image-caption').textContent = item.title;
    enlargedFeedback.textContent = '이미지를 불러오는 중…'; enlarged.hidden = false; enlarged.src = item.url;
    document.querySelector('#restaurant-image-original').href = item.url;
    dialog.showModal();
  });
  enlarged.addEventListener('load', () => { enlargedFeedback.textContent = ''; });
  enlarged.addEventListener('error', () => { enlarged.hidden = true; enlargedFeedback.textContent = '원본 이미지를 표시하지 못했어요. 아래 링크에서 확인해 주세요.'; });
  dialog.addEventListener('close', () => { enlarged.removeAttribute('src'); enlargedFeedback.textContent = ''; });
  retry.addEventListener('click', () => { if (restaurant) load(restaurant); });
  return { load, clear };
}
