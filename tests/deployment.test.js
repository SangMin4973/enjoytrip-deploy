import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// makeServer()만 검사하면 실제 실행 시 HOST/PORT 설정 누락을 발견할 수 없습니다.
test('배포 실행이 HOST와 PORT 환경변수를 사용하고 상태 확인·화면·비밀 파일 차단을 제공한다', { timeout: 15000 }, async context => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, HOST: '0.0.0.0', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  context.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`서버 시작 실패 (${code}): ${stderr}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/EnjoyTrip: http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  assert.ok(port > 0);
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok' });
  const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/board/list.html`)).status, 200);
  for (const path of ['/.env', '/render.yaml', '/package-lock.json', '/server.mjs']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
