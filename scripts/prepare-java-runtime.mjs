import { spawnSync } from 'node:child_process';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, rename } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.java-runtime');
const render = process.env.RENDER === 'true';
// 기존 Render의 npm ci 빌드에서도 실행됩니다. 로컬에서는 npm run sorting:build를 사용합니다.
if (process.argv.includes('--render-only') && !render) process.exit(0);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error('Java 빌드를 완료하지 못했습니다. JDK 설치와 빌드 로그를 확인해 주세요.');
}

async function installRuntime() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('자동 Java 설치는 Render Linux x64 전용입니다.');
  const response = await fetch('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse', { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Java 배포 정보를 받지 못했습니다.');
  const release = (await response.json())[0], pkg = release?.binary?.package;
  if (!pkg || !/^https:\/\/github\.com\/adoptium\/temurin17-binaries\/releases\/download\//.test(pkg.link)
    || !/^[a-f0-9]{64}$/.test(pkg.checksum) || pkg.size > 300 * 1024 * 1024) throw new Error('Java 배포 정보를 확인하지 못했습니다.');
  console.log(`Render Java 준비: ${release.version.semver}`);
  const download = await fetch(pkg.link, { signal: AbortSignal.timeout(180000) });
  if (!download.ok) throw new Error('Java 다운로드에 실패했습니다.');
  const staging = path.join(root, 'tmp', 'java-install');
  await mkdir(staging, { recursive: true });
  const archivePath = path.join(staging, 'jdk.tar.gz');
  const digest = createHash('sha256'); let size = 0;
  await pipeline(download.body, async function* (source) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > 300 * 1024 * 1024) throw new Error('Java 다운로드 크기가 제한을 초과했습니다.');
      digest.update(chunk); yield chunk;
    }
  }, createWriteStream(archivePath));
  if (digest.digest('hex') !== pkg.checksum) throw new Error('Java 다운로드 체크섬이 다릅니다.');
  run('tar', ['-xzf', archivePath, '-C', staging]);
  const folder = (await readdir(staging, { withFileTypes: true })).find(entry => entry.isDirectory() && entry.name.startsWith('jdk-'));
  if (!folder || !existsSync(path.join(staging, folder.name, 'bin', 'javac'))) throw new Error('Java 압축 해제를 확인하지 못했습니다.');
  await rename(path.join(staging, folder.name), runtime);
  // 이 스크립트가 만든 고정 경로의 다운로드 파일만 정리합니다.
  await rm(archivePath);
}

try {
  if (render && !existsSync(path.join(runtime, 'bin', 'javac'))) await installRuntime();
  const javac = render ? path.join(runtime, 'bin', 'javac') : 'javac';
  const source = path.join(root, 'algorithm-java', 'src'), output = path.join(root, 'algorithm-java', 'out');
  await mkdir(output, { recursive: true });
  const sources = (await readdir(source)).filter(name => name.endsWith('.java')).map(name => path.join(source, name));
  run(javac, ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-d', output, ...sources]);
  console.log('웹 Java 정렬 빌드 완료');
} catch (error) { console.error(error.message); process.exitCode = 1; }
