# Java 정렬 실습 준비

정렬은 아직 구현하지 않았습니다. **`src/StableMergeSort.java`의 TODO 1~3만 직접 작성**하면 됩니다. 데이터 호출·변환·컴파일·입출력·실행·샘플 결과 비교는 준비되어 있습니다.

## 1. 먼저 실행해 보기

프로젝트 루트(이 문서의 한 단계 위, `package.json`이 있는 폴더)에서 실행합니다.

```powershell
# 합성 데이터 8곳 → Java 입력 → 미구현 안내. API 키·네트워크 불필요.
npm run sorting:sample

# 실제 Google 검색 → 최대 3페이지·45곳 수집 → Java 입력
npm run sorting:google -- --region "해운대" --menu "국밥"

# 평가 개수 기준의 구현을 실행하고 싶은 경우
npm run sorting:sample -- --mode count
```

각 명령은 Java 소스를 자동으로 다시 컴파일하므로 코드를 수정한 뒤 같은 명령을 실행하면 됩니다. JDK 8 이상과 기존 프로젝트의 Node.js 22 이상이 필요합니다. 로컬에서 확인한 JDK는 Java 8입니다. 추가 라이브러리·Maven·Gradle·DB 설정은 필요 없습니다.

현재는 입력 목록이 출력된 뒤 `[미구현] TODO 2: mergeSort`가 표시되는 것이 정상입니다. 비교·정렬을 끝냈다는 뜻이 아닙니다. TODO의 `throw new UnsupportedOperationException(...)`을 본인 코드로 교체하세요. 샘플 명령은 데이터 연결 확인이므로 미구현이어도 종료 코드 0입니다.

실제 검색은 기존 `.env` 또는 환경변수의 `GOOGLE_PLACES_API_KEY`를 사용합니다. **실행할 때마다 Google 검색이 최대 3회 발생하며 과금·할당량이 적용될 수 있습니다.** Google 장소 정보를 입력 파일로 저장하지 않고 메모리와 표준 입력으로 전달합니다. 사진·Details·Supabase 요청은 하지 않습니다. API 키는 Java에 전달하지 않습니다. 알고리즘을 고치는 동안에는 반복 과금 없는 `sorting:sample`을 사용하세요.

## 2. 파일 구성과 데이터 흐름

```text
algorithm-java/
├─ src/
│  ├─ StableMergeSort.java     ← 직접 구현할 파일: TODO 1~3
│  ├─ RestaurantCandidate.java   음식점 데이터 클래스
│  ├─ SortMode.java              별점순 / 평가 개수순 구분
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
    → StableMergeSort.sort(input, mode)
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

## 4. 직접 구현할 세 곳

### TODO 1: `compare(a, b, mode)`

기획서의 비교 규칙을 구현합니다. 이 단계에서는 정렬하지 않고 두 음식점의 우선순위만 반환합니다.

| 우선순위 | `RATING_DESC` | `COUNT_DESC` |
| --- | --- | --- |
| 1 | 평가 정보 유효 여부 | 평가 정보 유효 여부 |
| 2 | 별점 내림차순 | 평가 개수 내림차순 |
| 3 | 평가 개수 내림차순 | 별점 내림차순 |
| 4 | 최초 입력 순서 유지 | 최초 입력 순서 유지 |

유효한 평가: `source`가 `google`이고, 별점이 존재하며 평가 개수가 양수인 장소. 평가가 없는 장소도 목록에서 지우지 않고 뒤에 두며 그 안에서는 원래 순서를 유지합니다. 반환값은 음수면 a가 앞, 양수면 b가 앞, 0이면 동점입니다. 동점 시 병합에서 기존 순서를 유지하거나 `originalIndex`로 비교할 수 있습니다.

### TODO 2: `mergeSort(items, buffer, left, right, mode)`

정렬 범위는 **`[left, right)`**, 즉 right 미포함입니다. 빈 배열·원소 1개 처리, 분할, 재귀 호출, 병합 호출을 작성하세요.

### TODO 3: `merge(items, buffer, left, mid, right, mode)`

`[left, mid)`와 `[mid, right)`를 비교해 병합하세요. 동점 순서 유지, 남은 원소 처리, 버퍼에서 원래 배열로 반영하는 부분도 직접 구현할 영역입니다.

입력 복사와 버퍼 생성은 `sort()`에 준비돼 있습니다. `Arrays.sort()`·`Collections.sort()` 대신 본인의 병합 정렬을 작성하는 실습입니다. 보정 추천 점수·거리 계산·다른 알고리즘은 이번 파일에 구현하지 않았습니다.

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
- D·G·H는 평가 정보 없음 그룹이며 원래 순서를 유지합니다.

샘플 하나의 통과가 전체 알고리즘의 정확성을 보장하지는 않습니다. 빈 배열·1곳·역순·전체 동점·평가 없음만 있는 입력도 `fixtures/sample.json`을 바꿔 추가로 연습할 수 있습니다. expected 배열도 입력과 맞춰 수정하세요.

기존 `npm test`는 Node 회귀 검사와 입력 전달 검사를 실행합니다. Render에는 JDK가 있다고 가정하지 않으므로 Java 컴파일·사용자 알고리즘 검사는 명시적인 위 명령으로만 실행합니다.
