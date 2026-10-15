import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { javaSortingInput, sortingCandidates, SORT_MODES } from '../scripts/sorting-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const classes = path.join(root, 'algorithm-java', 'out');
const bundledJava = path.join(root, '.java-runtime', 'bin', 'java');
export const javaCommand = () => existsSync(bundledJava) ? bundledJava
  : process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const failure = (message, status = 503) => Object.assign(new Error(message), { status });

export function parseRankingOutput(output, candidates, mode) {
  const lines = output.trimEnd().split('\n').map(line => line.replace(/\r$/, ''));
  if (lines.shift() !== `MATZIP_RANK_V1\t${candidates.length}` || lines.length !== candidates.length) throw new Error('Invalid Java output');
  const remaining = new Set(candidates.map(item => item.id));
  const items = lines.map(line => {
    const fields = line.split('\t');
    const id = Buffer.from(fields[0], 'base64').toString('utf8');
    const score = fields[1] === 'null' ? null : Number(fields[1]);
    if (fields.length !== 2 || !remaining.delete(id) || (score !== null && (!Number.isFinite(score) || score < 1 || score > 5))
      || (mode !== 'recommended' && score !== null)) throw new Error('Invalid Java output');
    return { id, score };
  });
  return { mode, items, ...(mode === 'recommended' ? { priorMean: 4, priorWeight: 50 } : {}) };
}

// 동시 실행·시간·출력 크기를 제한합니다. 요청 때 컴파일하거나 외부 API를 호출하지 않습니다.
export function createRestaurantRanking({ command = javaCommand(), classPath = classes, timeout = 5000, maxConcurrent = 2 } = {}) {
  let running = 0;
  return async function rank(input, { signal } = {}) {
    let candidates, payload;
    try {
      if (!Object.hasOwn(SORT_MODES, input.mode)) throw new Error();
      candidates = sortingCandidates(input.restaurants);
      // 이름·주소·사진은 정렬에 필요하지 않으므로 Java 입력에서도 제외합니다.
      payload = javaSortingInput(candidates.map(item => ({ ...item, name: '' })), { mode: input.mode });
    } catch { throw failure('정렬 방식과 음식점 목록을 확인해 주세요.', 400); }
    if (signal?.aborted) throw failure('정렬 요청이 취소되었습니다.', 499);
    if (running >= maxConcurrent) throw failure('정렬 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    running++;
    try {
      return await new Promise((resolve, reject) => {
        const child = spawn(command, ['-Dfile.encoding=UTF-8', '-Xms8m', '-Xmx32m', '-XX:+UseSerialGC', '-cp', classPath, 'WebRankingMain'], {
          cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
          // Java에는 API 키와 DB 비밀 설정을 전달하지 않습니다.
          env: { PATH: process.env.PATH, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
        });
        let output = '', settled = false;
        const finish = (error, result) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (error) { child.kill(); reject(error); } else resolve(result);
        };
        const abort = () => finish(failure('정렬 요청이 취소되었습니다.', 499));
        const timer = setTimeout(() => finish(failure('정렬 시간이 초과됐습니다. 다시 시도해 주세요.', 504)), timeout);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          output += chunk;
          if (Buffer.byteLength(output) > 524288) finish(failure('정렬 결과를 읽지 못했습니다.'));
        });
        child.once('error', () => finish(failure('Java 정렬을 실행하지 못했습니다. 서버의 Java 빌드를 확인해 주세요.')));
        child.stdin.on('error', () => finish(failure('Java 정렬 입력을 전달하지 못했습니다.')));
        child.once('close', code => {
          if (settled) return;
          if (code !== 0) { finish(failure('Java 정렬을 완료하지 못했습니다.')); return; }
          try { finish(null, parseRankingOutput(output, candidates, input.mode)); }
          catch { finish(failure('Java 정렬 결과를 읽지 못했습니다.')); }
        });
        child.stdin.end(payload);
      });
    } finally { running--; }
  };
}
