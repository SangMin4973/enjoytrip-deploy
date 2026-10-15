# Java 정렬·보정 추천 실습

**별점순·평가 개수순 병합 정렬은 구현되어 있습니다.** 다음 직접 구현 대상은 `src/BayesianRanker.java`의 **TODO 1 `score()`와 TODO 2 `compare()`**입니다. 데이터 호출·변환·컴파일·실행·결과 출력·검사는 준비되어 있습니다.

## 1. 먼저 실행해 보기

프로젝트 루트(이 문서의 한 단계 위, `package.json`이 있는 폴더)에서 실행합니다.

```powershell
# 합성 데이터 8곳 → 완성된 Java 기본 정렬. API 키·네트워크 불필요.
npm run sorting:sample

# 실제 Google 검색 → 최대 3페이지·45곳 수집 → Java 입력
npm run sorting:google -- --region "해운대" --menu "국밥"

# 평가 개수 기준의 구현을 실행하고 싶은 경우
npm run sorting:sample -- --mode count

# 기본 정렬 경계 조건·동점 안정성·원본 보존 검사
npm run sorting:test

# 보정 추천의 실행 연결 확인 (현재는 미구현 안내)
npm run recommendation:sample

# 직접 구현 후 점수·추천 순서·결측·설정 경계 검사
npm run recommendation:check

# 추천 샘플 ID 순서 비교 (C=4, m=50 기준)
npm run sorting:check -- --mode recommended

# 보정 설정 변경 시 sample 명령으로 확인
npm run recommendation:sample -- --prior-mean 4.2 --prior-weight 100
```

각 명령은 Java 소스를 자동으로 다시 컴파일하므로 코드를 수정한 뒤 같은 명령을 실행하면 됩니다. JDK 8 이상과 기존 프로젝트의 Node.js 22 이상이 필요합니다. 로컬에서 확인한 JDK는 Java 8입니다. 추가 라이브러리·Maven·Gradle·DB 설정은 필요 없습니다.

기본 정렬은 결과가 출력됩니다. 보정 추천은 현재 `[미구현] BayesianRanker TODO 1: score`가 표시되는 것이 정상이며 추천 완료나 검사 통과를 의미하지 않습니다. `BayesianRanker.java`의 `throw new UnsupportedOperationException(...)` 두 곳을 본인 코드로 교체하세요. 샘플 명령은 미구현이어도 안내 후 종료 코드 0, check 명령은 미구현 시 종료 코드 2입니다.

실제 검색은 기존 `.env` 또는 환경변수의 `GOOGLE_PLACES_API_KEY`를 사용합니다. **실행할 때마다 Google 검색이 최대 3회 발생하며 과금·할당량이 적용될 수 있습니다.** Google 장소 정보를 입력 파일로 저장하지 않고 메모리와 표준 입력으로 전달합니다. 사진·Details·Supabase 요청은 하지 않습니다. API 키는 Java에 전달하지 않습니다. 알고리즘을 고치는 동안에는 반복 과금 없는 `sorting:sample`을 사용하세요.

## 2. 파일 구성과 데이터 흐름

```text
algorithm-java/
├─ src/
│  ├─ StableMergeSort.java       완성된 병합 정렬·비교 기준 재사용
│  ├─ BayesianRanker.java      ← 직접 구현할 파일: TODO 1~2
│  ├─ RankedRestaurant.java     원본 참조 + 별도 보정 점수
│  ├─ AlgorithmTest.java         기본 정렬 경계 조건 검사
│  ├─ RecommendationTest.java    추천 TODO 구현 후 실행할 검사
│  ├─ Benchmark.java             합성 데이터 성능 측정
│  ├─ RestaurantCandidate.java   음식점 데이터 클래스
│  ├─ SortMode.java              별점순 / 평가 개수순 / 추천순 구분
│  ├─ CandidateInput.java        입력 파싱 (구현 완료)
│  └─ SortingMain.java           입력 출력·정렬 호출·결과 검증 (구현 완료)
├─ fixtures/sample.json         실제 식당이 아닌 합성 데이터·예상 ID 순서
├─ out/                        자동 생성 .class, Git 제외
└─ README.md

scripts/sorting-data.mjs        기존 API 수집 재사용·정렬 입력 변환
scripts/sorting-exercise.mjs    컴파일·데이터 호출·Java 실행
```

```text
샘플 JSON 또는 기존 Google 검색 모듈
    → 최대 45곳 수집·ID 중복 제거 (기존 Google 순서)
    → id, name, source, rating, userRatingCount, originalIndex만 추출
    → Java 표준 입력
    → RestaurantCandidate[]
    → 기본 정렬: StableMergeSort / 보정 추천: BayesianRanker → 같은 병합 정렬
    → 사용자 결과 출력 / 샘플 예상 ID 순서 비교
```

데이터 호출은 기존 키 관리·응답 정규화 모듈을 재사용하는 로컬 Node 실행 도구가 담당합니다. **Java가 정렬을 담당하는 독립 실행 실습이며, 현재 웹 요청이 Java를 실행하는 구조는 아닙니다.** 웹 화면과 Render 설정은 변경하지 않았습니다. 별도 로그인·API 공개 경로·Java 서버를 추가하지 않습니다.

## 3. 전달받는 데이터

| Java 필드 | 타입 | 의미 |
| --- | --- | --- |
| `id` | `String` | 음식점 고유 ID |
| `name` | `String` | 가게 이름 |
| `source` | `String` | `google` 또는 이전 북마크의 `kakao` |
| `rating` | `Double` | 1~5, 없거나 비정상이면 `null` |
| `userRatingCount` | `long` | 평가 개수, 없거나 비정상이면 0 |
| `originalIndex` | `int` | 전체 수집 순서, 0부터 시작 |

실제 Google 검색의 입력은 Google 장소뿐이며 합성 샘플에는 이전 카카오 장소도 포함돼 있습니다. 주소·사진 URL·API 키는 Java 입력에서 제외했습니다. 원본 데이터와 결과 배열을 분리하고 ID를 바꾸지 마세요. `rating`을 사용하기 전에 null을 확인해야 합니다.

## 4. 직접 구현할 두 곳

### TODO 1: `BayesianRanker.score(restaurant, priorMean, priorWeight)`

기획서의 보정 점수를 계산합니다. 정렬에 사용할 값은 반올림하지 마세요.

```text
S = (v × R + m × C) / (v + m)
R: 평균 별점, v: 평가 개수
C: 기준 평균(기본 4.0), m: 사전 가중치(기본 50)
```

실행 연결에서 Google의 유효한 1~5 별점과 양의 평가 개수를 갖춘 장소만 이 메서드에 전달합니다. C는 유한한 1~5, m은 유한한 0 이상으로 검사하며 m=0도 검사 대상입니다. 원본 별점에 보정 점수를 덮어쓰지 마세요.

### TODO 2: `BayesianRanker.compare(a, b)`

점수 보유 여부 → 보정 점수 내림차순 → 원본 별점 내림차순 → 평가 개수 내림차순 → 최초 순서로 비교합니다. 음수면 a가 앞, 양수면 b가 앞, 0이면 동점입니다.

점수가 없는 장소는 `RankedRestaurant.score`가 null입니다. 삭제하지 말고 뒤에서 최초 순서를 유지하세요.

`RankedRestaurant`는 원본 음식점 참조와 별도 점수를 담는 일시적인 결과이며 원본을 변경하지 않습니다. `StableMergeSort.sort(array, comparator)`로 비교 기준을 전달해 기존 병합 정렬을 재사용합니다. 기존 정렬 경로에 RECOMMENDED를 전달하면 평가 수순으로 잘못 실행하는 대신 명시적으로 거부합니다.

Java는 독립 실행 모듈이며 웹 정렬은 아직 연결하지 않았습니다. 웹에서 Java를 직접 실행할지, 웹용 별도 알고리즘을 둘지는 후속 결정 사항입니다.

## 5. 구현 후 확인

```powershell
# 별점순 예상 결과 비교
npm run sorting:check

# 평가 개수순 예상 결과 비교
npm run sorting:check -- --mode count

# 컴파일만 실행
npm run sorting:build
```

`sorting:check`는 알고리즘 미구현 시 종료 코드 **2**, 오답·입력/실행 오류는 **1**, 예상 ID 순서 일치는 **0**입니다. 미구현을 테스트 통과로 표시하지 않습니다. 실제 Google 검색에는 정답 ID가 없으므로 샘플에서 먼저 확인하세요.

샘플 예상 결과:

- 별점순: C → F → B → E → A → D → G → H
- 평가 개수순: B → E → A → C → F → D → G → H
- 보정 추천순(C=4, m=50): B → E → A → C → F → D → G → H
- D·G·H는 평가 정보 없음 그룹이며 원래 순서를 유지합니다.

이 샘플에서 평가 개수순과 추천순 결과가 같아도 두 기준은 다릅니다. RecommendationTest는 기획서의 A(5.0/1), B(4.7/500), C(4.5/100) 예시도 사용해 B→C→A 순서와 점수 오차 1e-9 이하, m=0, 결측·동점·원본 보존·잘못된 설정·반올림 없는 비교를 검사합니다. 추천 TODO가 남으면 미구현으로 종료하며 통과로 표시하지 않습니다. 사용자 설정을 바꾼 경우 정답 ID 검사는 기본 C=4, m=50에서만 실행하고 다른 값은 sample로 확인합니다.

기존 `npm test`는 Node 회귀 검사와 입력 전달 검사를 실행합니다. Render에는 JDK가 있다고 가정하지 않으므로 Java 컴파일·사용자 알고리즘 검사는 명시적인 위 명령으로만 실행합니다.

## 6. 성능 측정

```powershell
npm run sorting:benchmark
npm run sorting:benchmark -- --mode count
```

API 없이 합성 데이터 15·45·1,000·10,000·100,000개와 랜덤·정렬됨·역순·동점 다수 입력을 사용합니다. seed=42, 조건별 워밍업 2회 후 5회 측정의 중앙값을 출력하고 결과 순서도 검사합니다.

copy_median_ms는 배열 복사만 별도 측정한 값입니다. sort_total_median_ms는 원본 복사·버퍼 생성·병합 정렬을 모두 포함하며 두 값을 차감하지 않습니다. 입력 생성·정답 검증·API 대기는 제외합니다. 추가 공간은 O(n)이며 관측 힙은 측정하지 않습니다. 결과는 실행 환경에 따라 달라집니다. 성능 측정은 완성된 rating/count 모드 대상이며 추천·웹 성능 측정은 후속 단계입니다.
