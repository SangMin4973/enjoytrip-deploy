import { buildRestaurantSearchQuery } from './restaurant-search.js';

export function initNaverImageGallery() {
  const dialog = document.querySelector('#restaurant-image-dialog');
  const enlarged = document.querySelector('#restaurant-image-enlarged');
  const enlargedFeedback = document.querySelector('#restaurant-image-enlarged-feedback');
  const jobs = new WeakMap();
  const newBatch = () => ({ controller: new AbortController(), queue: [], running: 0, results: new Map() });
  let batch = newBatch();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const job = jobs.get(entry.target);
      if (job) enqueue(job);
    }
  }, { root: document.querySelector('#restaurant-list'), rootMargin: '100px' });

  function clear() {
    batch.controller.abort(); observer.disconnect();
    batch = newBatch();
    if (dialog.open) dialog.close();
  }

  function openImage(restaurant, item, index) {
    document.querySelector('#restaurant-image-dialog-title').textContent = `${restaurant.name} · 이미지 ${index + 1}`;
    document.querySelector('#restaurant-image-caption').textContent = item.title;
    enlargedFeedback.textContent = '이미지를 불러오는 중…'; enlarged.hidden = false; enlarged.src = item.url;
    document.querySelector('#restaurant-image-original').href = item.url;
    dialog.showModal();
  }

  function enqueue(job) {
    if (job.queued) return;
    job.queued = true;
    if (job.detail) batch.queue.unshift(job);
    else batch.queue.push(job);
    pump(batch);
  }

  function searchImages(query, state) {
    if (!state.results.has(query)) {
      const request = (async () => {
        const response = await fetch(`/api/naver/images?q=${encodeURIComponent(query)}`, { signal: AbortSignal.any([state.controller.signal, AbortSignal.timeout(15000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '이미지를 불러오지 못했어요.');
        if (!Array.isArray(result.images)) throw new Error('이미지 검색 결과를 읽지 못했어요.');
        return result.images.slice(0, 5);
      })();
      state.results.set(query, request);
      request.catch(() => { if (state.results.get(query) === request) state.results.delete(query); });
    }
    return state.results.get(query);
  }

  function pump(state) {
    if (state !== batch || state.controller.signal.aborted) return;
    while (state.running < 2 && state.queue.length) {
      const job = state.queue.shift();
      if (!job.box.isConnected) continue;
      state.running++;
      load(job, state).finally(() => { state.running--; pump(state); });
    }
  }

  async function load(job, state) {
    const { restaurant, box, feedback, row } = job;
    box.setAttribute('aria-busy', 'true');
    feedback.textContent = '가게 이미지 검색 중…';
    try {
      const query = buildRestaurantSearchQuery(restaurant);
      const images = await searchImages(query, state);
      if (state !== batch || !box.isConnected) return;
      row.replaceChildren();
      feedback.textContent = images.length ? '' : '검색된 가게 이미지가 없어요.';
      images.forEach((item, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'restaurant-image-card';
        button.setAttribute('aria-label', `${restaurant.name} 검색 이미지 ${index + 1} 확대`);
        button.title = '네이버 검색 이미지 · 클릭해서 확대';
        const image = document.createElement('img'); image.src = item.thumbnail; image.alt = item.title || `${restaurant.name} 검색 이미지 ${index + 1}`;
        image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.hidden = true; button.textContent = '확대'; }, { once: true });
        button.append(image);
        button.addEventListener('click', event => { event.stopPropagation(); openImage(restaurant, item, index); });
        row.append(button);
      });
    } catch (error) {
      if (state !== batch || !box.isConnected) return;
      row.replaceChildren(); feedback.textContent = '가게 이미지를 불러오지 못했어요.';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'restaurant-image-retry'; retry.textContent = '이미지 다시 검색';
      retry.addEventListener('click', event => {
        event.stopPropagation(); retry.remove(); job.queued = false; enqueue(job);
      });
      box.append(retry);
    } finally {
      if (state === batch && box.isConnected) box.setAttribute('aria-busy', 'false');
    }
  }

  function add(restaurant, box, { detail = false } = {}) {
    box.className = detail ? 'restaurant-detail-images' : 'restaurant-card-images';
    box.setAttribute('aria-label', `${restaurant.name} 검색 이미지`);
    const row = document.createElement('div'); row.className = 'restaurant-image-list';
    for (let index = 0; index < 5; index++) {
      const placeholder = document.createElement('span'); placeholder.className = 'restaurant-image-placeholder'; placeholder.setAttribute('aria-hidden', 'true'); row.append(placeholder);
    }
    const feedback = document.createElement('p'); feedback.className = 'restaurant-image-feedback'; feedback.setAttribute('role', 'status');
    box.append(row, feedback);
    const job = { restaurant, box, row, feedback, queued: false, detail };
    jobs.set(box, job);
    if (detail) enqueue(job);
    else observer.observe(box);
  }

  enlarged.addEventListener('load', () => { enlargedFeedback.textContent = ''; });
  enlarged.addEventListener('error', () => { enlarged.hidden = true; enlargedFeedback.textContent = '원본 이미지를 표시하지 못했어요. 아래 링크에서 확인해 주세요.'; });
  dialog.addEventListener('close', () => { enlarged.removeAttribute('src'); enlargedFeedback.textContent = ''; });
  return { add, clear };
}
