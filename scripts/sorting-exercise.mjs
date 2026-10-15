import { mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { javaSortingInput, loadGoogleSortingData, SORT_MODES } from './sorting-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'algorithm-java', 'out');
const source = path.join(root, 'algorithm-java', 'src');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, ...options });
  if (result.error) {
    if (result.error.code === 'ENOENT') throw new Error(`${command}를 찾지 못했습니다. JDK의 bin 폴더를 PATH에 등록해 주세요.`);
    if (result.error.code === 'ETIMEDOUT') throw new Error('Java 실행이 15초를 초과했습니다. 정렬 코드의 종료 조건을 확인해 주세요.');
    throw new Error('Java 도구를 실행하지 못했습니다.');
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

function argumentsFor(values) {
  const [action = 'sample', ...args] = values;
  if (!['build', 'sample', 'google', 'check'].includes(action)) throw new Error('명령은 build, sample, google, check 중 하나입니다.');
  const options = { mode: 'rating' };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!['--mode', '--region', '--menu'].includes(name) || args[i + 1] === undefined || args[i + 1].startsWith('--'))
      throw new Error('옵션은 --mode rating|count, --region 지역, --menu 메뉴 형식입니다.');
    options[name.slice(2)] = args[i + 1];
  }
  if (!Object.hasOwn(SORT_MODES, options.mode)) throw new Error('--mode는 rating 또는 count입니다.');
  if (action === 'google' && !options.region?.trim()) throw new Error('--region으로 검색 지역을 입력해 주세요.');
  return { action, options };
}

async function main() {
  const { action, options } = argumentsFor(process.argv.slice(2));
  await mkdir(output, { recursive: true });
  const javaFiles = (await readdir(source)).filter(name => name.endsWith('.java')).map(name => path.join(source, name));
  const built = run('javac', ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-d', output, ...javaFiles]);
  if (built !== 0) { process.exitCode = built; return; }
  if (action === 'build') { console.log('Java 컴파일 완료: algorithm-java/out'); return; }
  let restaurants, expectedIds = [];
  if (action === 'google') {
    const envFile = path.join(root, '.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const result = await loadGoogleSortingData(options.region, options.menu, {
      onProgress: ({ pagesFetched, count }) => console.log(`Google 검색 수집: ${pagesFetched}/3페이지 · ${count}곳`),
    });
    restaurants = result.candidates;
    console.log(`실제 Google 데이터 ${restaurants.length}곳을 메모리로 전달합니다. 검색 ${result.pagesFetched}회, 사진·Details 추가 호출 없음.`);
    if (result.truncated) console.log('최대 3페이지·45곳 범위의 결과이며 추가 결과가 있을 수 있습니다.');
  } else {
    const fixture = JSON.parse(await readFile(path.join(root, 'algorithm-java', 'fixtures', 'sample.json'), 'utf8'));
    restaurants = fixture.restaurants;
    expectedIds = fixture.expected[options.mode];
    console.log('합성 연습 데이터입니다. 외부 API를 호출하지 않습니다.');
  }
  process.exitCode = run('java', ['-Dfile.encoding=UTF-8', '-Xmx128m', '-cp', output, 'SortingMain', ...(action === 'check' ? ['--check'] : [])], {
    input: javaSortingInput(restaurants, { mode: options.mode, expectedIds }),
  });
}

main().catch(error => { console.error(`[실패] ${error.message}`); process.exitCode = 1; });
