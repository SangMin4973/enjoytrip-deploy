import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tourRoute } from './server/tour.js';
import { createYoutubeSearch } from './server/youtube.js';
import { createRestaurantImageSearch } from './server/restaurant-images.js';
import { createNaverImageSearch } from './server/naver-images.js';
import { createSharedDb } from './server/shared-db.js';
import { createSharedAuth } from './server/shared-auth.js';
import { createSharedBoard } from './server/shared-board.js';

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function bodyJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw Object.assign(new Error('JSON 형식으로 요청해 주세요.'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 131072) throw Object.assign(new Error('요청 크기가 너무 큽니다.'), { status: 413 }); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw Object.assign(new Error('요청 내용이 올바르지 않습니다.'), { status: 400 }); }
}

export function makeServer({ tourOptions = {}, youtubeOptions = {}, imageOptions = {}, naverImageOptions = {}, sharedDbOptions = {} } = {}) {
  const db = createSharedDb(sharedDbOptions), auth = createSharedAuth(db), board = createSharedBoard(db, auth);
  const searchYoutube = createYoutubeSearch(youtubeOptions);
  const searchImage = createRestaurantImageSearch(imageOptions);
  const searchNaverImages = createNaverImageSearch(naverImageOptions);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/board/')) {
        if (!db.configured) { json(response, 503, { error: '공유 DB를 연결하는 중입니다. 잠시 후 이용해 주세요.' }); return; }
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) { json(response, 405, { error: '지원하지 않는 요청입니다.' }); return; }
        const mutating = request.method !== 'GET';
        if (mutating) {
          let origin; try { origin = new URL(request.headers.origin); } catch { /* 누락된 Origin은 거부합니다. */ }
          if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host || request.headers['sec-fetch-site'] === 'cross-site') {
            json(response, 403, { error: '같은 사이트에서만 변경 요청을 보낼 수 있습니다.' }); return;
          }
        }
        const input = mutating ? await bodyJson(request) : {};
        json(response, 200, url.pathname.startsWith('/api/auth/') ? await auth.route(url.pathname, request, response, input) : await board.route(url, request, input));
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { json(response, 405, { error: '지원하지 않는 요청입니다.' }); return; }
      // 배포 상태 확인은 외부 API 호출이나 비밀 설정 없이 응답합니다.
      if (url.pathname === '/healthz') {
        json(response, 200, { status: 'ok' });
        return;
      }
      if (url.pathname === '/api/config') {
        json(response, 200, { sharedBoardConfigured: db.configured, tourApiConfigured: !!process.env.TOUR_API_SERVICE_KEY?.trim(), kakaoMapJsKey: process.env.KAKAO_MAP_JS_KEY || '',
          restaurantImagesConfigured: !!(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY?.trim() && process.env.GOOGLE_CUSTOM_SEARCH_CX?.trim()) });
        return;
      }
      if (url.pathname.startsWith('/api/tour/')) {
        const result = await tourRoute(url.pathname, url.searchParams, tourOptions);
        json(response, result === null ? 404 : 200, result ?? { error: '없는 API입니다.' });
        return;
      }
      if (url.pathname === '/api/youtube/search') {
        json(response, 200, await searchYoutube(url.searchParams.get('q')));
        return;
      }
      if (url.pathname === '/api/naver/images') {
        json(response, 200, await searchNaverImages(url.searchParams.get('q')));
        return;
      }
      if (url.pathname === '/api/restaurant-image') {
        json(response, 200, await searchImage(url.searchParams.get('q')));
        return;
      }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      // 환경변수, .git, 서버 소스 등은 정적 파일로 노출하지 않습니다.
      if (!/^\/(index\.html|board\/(list|view|write|modify)\.html|css\/[\w-]+\.css|js\/[\w-]+\.js|resources\/[\w.-]+\.png|resources\/food-login\/(food-reference\.png|pixel-town-map\.png|fonts\/(Galmuri11(?:-Bold)?\.woff2|OFL\.md)))$/.test(pathname)) {
        json(response, 404, { error: '파일을 찾을 수 없습니다.' }); return;
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) { json(response, 403, { error: '접근할 수 없습니다.' }); return; }
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      json(response, error.code === 'ENOENT' ? 404 : error.status || 400, {
        error: error.code === 'ENOENT' ? '파일을 찾을 수 없습니다.' : error.message,
        ...(['TourApiError', 'YoutubeApiError', 'ImageSearchError', 'NaverImageError'].includes(error.name) ? { code: error.code } : {}),
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portArgument = process.argv.find((argument) => argument.startsWith('--port='));
  const port = Number(portArgument?.slice('--port='.length) || process.env.PORT || 5173);
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const server = makeServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `${port} 포트가 사용 중입니다. .env의 PORT 값을 바꿔 주세요.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const address = server.address();
    const displayHost = address.address.includes(':') ? `[${address.address}]` : address.address;
    console.log(`EnjoyTrip: http://${displayHost}:${address.port}`);
  });
}
