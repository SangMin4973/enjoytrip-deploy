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
    if (result.error.code === 'ETIMEDOUT') throw new Error(`Java 실행이 ${(options.timeout || 15000) / 1000}초를 초과했습니다. 정렬 코드의 종료 조건을 확인해 주세요.`);
    throw new Error('Java 도구를 실행하지 못했습니다.');
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

function argumentsFor(values) {
  const [action = 'sample', ...args] = values;
  if (!['build', 'sample', 'google', 'check', 'test', 'recommendation-test', 'benchmark'].includes(action)) throw new Error('알 수 없는 실습 명령입니다.');
  const options = { mode: 'rating', priorMean: 4, priorWeight: 50 };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!['--mode', '--region', '--menu', '--prior-mean', '--prior-weight'].includes(name) || args[i + 1] === undefined || args[i + 1].startsWith('--'))
      throw new Error('옵션은 --mode rating|count|recommended, --region 지역, --menu 메뉴, --prior-mean C, --prior-weight m 형식입니다.');
    const key = { '--prior-mean': 'priorMean', '--prior-weight': 'priorWeight' }[name] || name.slice(2);
    options[key] = key === 'priorMean' || key === 'priorWeight' ? Number(args[i + 1]) : args[i + 1];
  }
  if (!Object.hasOwn(SORT_MODES, options.mode)) throw new Error('--mode는 rating, count, recommended입니다.');
  if (!Number.isFinite(options.priorMean) || options.priorMean < 1 || options.priorMean > 5
    || !Number.isFinite(options.priorWeight) || options.priorWeight < 0) throw new Error('C는 1~5, m은 0 이상인 유한한 수여야 합니다.');
  if (action === 'benchmark' && options.mode === 'recommended') throw new Error('성능 측정은 완성된 rating 또는 count 모드를 사용하세요.');
  if (action === 'check' && options.mode === 'recommended' && (options.priorMean !== 4 || options.priorWeight !== 50))
    throw new Error('추천 샘플 정답 검사는 C=4, m=50 기준입니다. 다른 설정은 sample 명령으로 확인하세요.');
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
  if (['test', 'recommendation-test', 'benchmark'].includes(action)) {
    const className = { test: 'AlgorithmTest', 'recommendation-test': 'RecommendationTest', benchmark: 'Benchmark' }[action];
    process.exitCode = run('java', ['-Dfile.encoding=UTF-8', '-Xmx128m', '-cp', output, className,
      ...(action === 'benchmark' ? [SORT_MODES[options.mode]] : [])], { timeout: action === 'benchmark' ? 60000 : 15000 });
    return;
  }
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
  process.exitCode = run('java', ['-Dfile.encoding=UTF-8', '-Xmx128m', '-cp', output, 'SortingMain', ...(action === 'check' ? ['--check'] : []),
    '--prior-mean', String(options.priorMean), '--prior-weight', String(options.priorWeight)], {
    input: javaSortingInput(restaurants, { mode: options.mode, expectedIds }),
  });
}

main().catch(error => { console.error(`[실패] ${error.message}`); process.exitCode = 1; });
