# 맛집기행 첫 웹 배포 — Render

이 단계에서는 HTML/CSS/JavaScript 화면과 Node.js API 중계 서버를 하나의 HTTPS 웹 서비스로 배포합니다. 회원·북마크·게시글은 여전히 각 브라우저의 localStorage에 저장됩니다. 서버 인증이나 기기 간 동기화는 다음 개발 단계입니다.

2026-10-06 첫 배포를 완료했습니다. 공개 주소는 [맛집기행](https://matzip-journey.onrender.com), 배포용 저장소는 [enjoytrip-deploy](https://github.com/SangMin4973/enjoytrip-deploy)입니다. 아래 설정으로 운영 중이며 확인 결과는 `docs/TEST_PLAN.md`에 기록했습니다. 코드를 갱신할 때는 `git push deploy main`으로 배포 저장소에 반영합니다.

## 1. 배포할 저장소 준비

현재 원격 저장소는 SSAFY GitLab(`lab.ssafy.com`)입니다. Render에서 연결할 수 있는 GitHub·GitLab.com·Bitbucket 저장소를 준비하는 경로를 권장합니다. 접근 권한이 있는 비공개 GitHub 저장소도 연결할 수 있습니다.

현재 프로젝트 폴더가 저장소 루트입니다. 새 저장소를 연결할 경우 기존 `origin`을 유지하고 `deploy` 같은 별도 원격 이름을 사용하면 수업용 저장소를 그대로 사용할 수 있습니다. 배포용 저장소 주소가 확정된 뒤 원격을 추가하고 변경사항을 커밋·푸시합니다. 저장소 주소에 토큰이나 비밀번호를 넣지 않습니다.

공개 Git URL을 이용한 수동 배포도 가능하지만 Render가 인증 없이 복제할 수 있어야 합니다. SSAFY 저장소를 이 목적으로 공개 전환할 필요는 없습니다. 공개 URL 경로에는 연결된 Git 공급자와 같은 자동 배포·비공개 인증 지원이 없습니다.

올릴 파일에는 `package-lock.json`, `render.yaml`, 변경된 `server.mjs`가 포함되어야 합니다. `.env`는 기존 `.gitignore`에 의해 제외됩니다. API 키는 Render의 환경변수에 설정합니다.

## 2. Render 웹 서비스 만들기

[Render Dashboard](https://dashboard.render.com/)에서 로그인하고 다음 중 하나를 선택합니다. 같은 저장소로 두 서비스를 만들 필요는 없습니다.

### 직접 설정: New → Web Service

배포용 저장소를 연결하고 아래 설정을 입력합니다.

| 설정 | 값 |
| --- | --- |
| Name | `matzip-journey` 또는 원하는 이름 |
| Branch | 변경사항을 푸시한 브랜치 |
| Region | Singapore |
| Runtime | Node |
| Root Directory | 프로젝트가 저장소 루트이면 비움 |
| Build Command | `npm ci && npm test` |
| Start Command | `npm start` |
| Instance Type | Free — 첫 공개 체험용 |
| Health Check Path | `/healthz` |

프로젝트를 상위 저장소의 하위 폴더로 올렸다면 Root Directory에 `package.json`이 있는 상대 경로를 입력합니다.

### 설정 파일 사용: New → Blueprint

배포용 저장소를 선택해 루트의 `render.yaml`을 적용합니다. 파일에는 Free 인스턴스와 Singapore 지역이 명시되어 있습니다. 생성 화면에서 `KAKAO_MAP_JS_KEY` 값을 입력합니다. YouTube와 TourAPI 키는 필요할 때 생성된 서비스의 Environment에서 추가합니다.

Blueprint에 새 키를 `sync: false`로 추가해도 기존 서비스에 입력 화면이 다시 뜨지는 않으므로 기존 서비스의 키는 Environment에서 직접 추가합니다.

## 3. 환경변수 입력

직접 Web Service를 만드는 경우 아래 값을 설정합니다. Blueprint는 첫 네 값이 이미 포함되어 있습니다.

| 변수 | 값 / 용도 |
| --- | --- |
| `NODE_VERSION` | `24` — 로컬 검증과 같은 Node.js 주 버전 |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` — Render 프록시의 접속 허용 |
| `KAKAO_MAP_JS_KEY` | 본인 카카오 앱의 JavaScript 키 — 지도·음식점 검색 |
| `YOUTUBE_API_KEY` | 선택: 앱 내 관련 영상 검색 |
| `TOUR_API_SERVICE_KEY` | 선택: 실제 관광정보 조회 |

`PORT`는 Render가 제공하는 값을 사용합니다. 로컬 `.env`의 `PORT=5179`를 배포 환경에 복사할 필요가 없습니다. 현재 사용하지 않는 Google 이미지 검색 키도 첫 배포에 필요하지 않습니다.

카카오 JavaScript 키는 지도 실행을 위해 브라우저에 전달됩니다. YouTube·TourAPI 키는 서버에서만 사용됩니다. 비밀 키를 채팅·문서·커밋에 넣지 말고 서비스의 Environment 입력란에 입력합니다.

## 4. 배포 후 카카오 도메인 등록

Render 배포 완료 후 서비스 화면의 실제 `https://...onrender.com` 주소를 확인합니다. 서비스 이름만으로 주소를 미리 확정하지 않습니다.

[Kakao Developers](https://developers.kakao.com/)의 본인 앱 JavaScript 키 설정에서 **JavaScript SDK 도메인**에 해당 주소를 등록합니다. 주소에는 `/#login` 같은 화면 경로를 넣지 않습니다. 기존 localhost 도메인은 유지할 수 있습니다.

사용자 지정 도메인을 나중에 연결하면 새 주소도 등록합니다. 카카오 지도 사용 권한과 JavaScript 키 종류도 함께 확인합니다.

## 5. 배포 완료 확인

1. `https://실제배포주소/healthz`가 HTTP 200과 `{"status":"ok"}`를 반환합니다. 외부 API 연결 성공을 뜻하는 것은 아닙니다.
2. 루트 주소에서 로그인 화면을 엽니다. 새 주소는 별도 브라우저 저장소이므로 테스트 계정을 새로 만듭니다.
3. 지역·메뉴 검색에서 실제 음식점과 지도 핀을 확인합니다.
4. 음식점을 선택하고 관련 영상 조회·재생을 확인합니다. YouTube 키를 생략했다면 영상 조회 오류 안내와 외부 검색 링크를 확인합니다.
5. 북마크 저장과 새로고침 후 복원을 확인합니다.
6. `/board/list.html`에 직접 접속합니다.
7. 아이폰 Safari에서도 로그인·검색·지도·북마크를 확인합니다.
8. `/.env`, `/server.mjs`, `/render.yaml`은 404가 반환되어야 합니다.

Render의 HTTPS 인증서는 플랫폼에서 관리하므로 첫 배포에 도메인 구매나 직접 인증서 설치가 필요하지 않습니다.

## 자주 발생하는 문제

| 증상 | 확인할 내용 |
| --- | --- |
| 배포 실패 / 열린 포트 없음 | `HOST=0.0.0.0`, 실행 명령 `npm start`, Render의 `PORT` 사용 |
| `npm ci` 실패 | `package-lock.json`이 저장소에 포함되었는지 |
| Node.js 버전 관련 오류 | `NODE_VERSION=24` 설정 |
| 지도·음식점 검색 실패 | 본인 JavaScript 키, 실제 배포 도메인 등록, 카카오 지도 권한 |
| 영상 검색 실패 | YouTube API 활성화·키·할당량. 서버 호출에 브라우저 리퍼러 제한 키를 사용하지 않음 |
| 관광정보 실제 모드 실패 | TourAPI 키와 사용 승인 |
| 기존 계정·북마크가 없음 | localhost와 배포 주소의 localStorage는 서로 별도 |
| 한동안 접속하지 않은 뒤 첫 로딩이 느림 | Free 웹 서비스는 15분 동안 요청이 없으면 중지되며 재개에 시간이 필요함 |

Free 인스턴스는 첫 체험용입니다. 상시 운영이나 App Store 심사에 사용할 때에는 서버 가용성과 사용량 한도에 맞는 플랜을 선택합니다. 외부 API 할당량과 호출 제한도 별도로 관리해야 합니다.

## 공식 문서

- [Render Web Services](https://render.com/docs/web-services)
- [Render Blueprint 설정](https://render.com/docs/blueprint-spec)
- [Node.js 버전 설정](https://render.com/docs/node-version)
- [Git 공급자 연결](https://render.com/docs/git-provider)
- [Free 인스턴스 제한](https://render.com/docs/free)
- [카카오 지도 Web API 설정](https://apis.map.kakao.com/web/guide/)
