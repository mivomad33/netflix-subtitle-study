**한국어** | [English](DEVELOPMENT.en.md)

# 개발 문서

[README로 돌아가기](README.md)

## 개발 서버

```bash
npm install
npm start
```

Webpack Dev Server가 시작되어 변경 사항이 `build` 폴더에 실시간으로 반영됩니다. Chrome의 `chrome://extensions/`에서 `build` 폴더를 로드하면 됩니다.

### 원서 리더 화면 보기

개발 서버를 띄운 뒤 `http://localhost:3000/reader-dev.html`을 열면 확장 프로그램을 로드하지 않고도 원서 리더, 메모 모아 보기, 백업 화면을 볼 수 있습니다. 이 페이지는 서비스 워커와 Firestore 대신 메모리 저장소와 로그인된 가짜 사용자([fakeAuth.ts](src/pages/Reader/dev/fakeAuth.ts))를 쓰고, 저장소 내용을 그 페이지의 `localStorage`에 저장합니다.

- `?auth=signedOut`, `?auth=loading`, `?auth=unconfigured`, `?auth=expired`: 로그인 전, 로그인 상태 확인 중, Firebase 설정 없음, 로그인 만료 화면을 봅니다.
- `?signin=cancelled`: 로그인 창을 닫은 것처럼 로그인이 실패합니다.
- `?usage=full`: 사용량이 20MB 상한에 닿은 것처럼 보입니다.
- `?seed=demo`: 직접 쓴 예시 본문으로 책과 메모를 채웁니다.
- `?seed=perf`: 책 20권(그중 한 권은 200만 자)과 메모 5,000개를 채웁니다.
- 브라우저 콘솔의 `window.nfStudyDev`에서 `reset()`, `seedDemo()`, `seedPerf()`를 부를 수 있습니다.
- 소리 내어 읽기는 기본으로 소리를 내지 않는 가짜 음성([fakeSpeech.ts](src/pages/Reader/dev/fakeSpeech.ts))을 씁니다. 글자 수에 맞춰 읽기 시작·끝 신호를 보내므로 읽는 문장 표시와 자동 스크롤을 볼 수 있습니다. `?voices=`로 음성 묶음을 고르고, 고른 값은 새로 고쳐도 남습니다.
  - `device`(기본): Natural 음성 둘, Premium 음성 하나와 `basic`의 음성들(목록에는 앞의 셋만 보임)
  - `basic`: 기본 기기 음성 둘, 효과음 음성(Bubbles), 한국어 음성, 온라인 영어 음성(목록에는 기본 음성 둘과 안내가 보임)
  - `none`: 음성 없음(영어 음성 없음 안내)
  - `unsupported`: `speechSynthesis`가 없는 브라우저처럼
  - `real`: 이 브라우저의 실제 음성
  - 가짜 음성이 읽은 글은 `window.nfStudyDev.speech.spoken`에 시각과 함께 남습니다.

`reader-dev.html`, 메모리 저장소, 가짜 음성, 가짜 로그인은 개발 빌드에만 들어가며 `npm run build` 결과물에는 들어가지 않습니다. 진입점은 [dev.tsx](src/pages/Reader/dev.tsx)와 [seed.ts](src/pages/Reader/dev/seed.ts)입니다. 데모 시드에는 학습 완료한 장이 섞여 있어 진행률 0%, 중간, 100%인 책이 함께 보입니다.

### 넷플릭스 학습 패널 화면 보기

개발 서버를 띄운 뒤 `http://localhost:3000/netflix-dev.html`을 열면 넷플릭스 밖에서 학습 패널과 대시보드를 볼 수 있습니다. 직접 쓴 가짜 대사와 가짜 플레이어를 쓰고, 서비스 워커 대신 메모리 저장소를 브리지 처리기에 바로 붙입니다. 기본은 로그인한 상태입니다.

- `?auth=out`: 로그아웃 상태(로그인 안내가 보임)
- `?auth=wait`: 로그인 상태를 확인하는 중
- `?error=<오류 종류>`: 저장이 그 오류로 실패합니다. 오류 종류는 [errors.ts](src/shared/storage/errors.ts)의 `quota-exceeded`, `resource-exhausted`, `unavailable`, `unauthenticated` 등입니다.
- `?dashboard=1`: 대시보드를 연 채로 시작합니다.

진입점은 [dev.tsx](src/pages/Content/dev.tsx)이고, 개발 빌드에만 들어갑니다.

## 빌드

```bash
npm run build
```

`build` 폴더에 결과물을 만들고, `zip` 폴더에 배포용 압축 파일을 만듭니다.

확장 프로그램 ID는 [manifest.json](src/manifest.json)의 `key`로 고정되어 있습니다(`flhkacfjjpipfoicbnmednajnhebihmb`). 그래서 `build` 폴더를 옮기거나 다시 로드해도 ID가 같습니다. Google 로그인 창의 리디렉션 주소(`https://flhkacfjjpipfoicbnmednajnhebihmb.chromiumapp.org/`)와 Firebase 인증의 승인된 도메인(`chrome-extension://flhkacfjjpipfoicbnmednajnhebihmb`)이 이 ID에 맞춰져 있습니다.

### Firebase 설정

빌드할 때 [webpack.config.js](webpack.config.js)가 Firebase 웹 설정을 저장소 루트의 `firebase.config.local.json`(JSON)에서 읽어 번들에 넣습니다. 이 파일은 `.gitignore`에 있어 커밋하지 않습니다. 파일 대신 환경 변수 `NF_FIREBASE_CONFIG`에 같은 JSON을 넣거나, `NF_FIREBASE_CONFIG_FILE`로 다른 파일 경로를 줄 수도 있습니다(`NF_FIREBASE_CONFIG`가 먼저입니다).

이 프로젝트(`nf-subtitle-study-21cae`)에 접근 권한이 있으면 Firebase CLI로 파일을 만듭니다. `--out`을 빼면 같은 JSON을 화면에 출력합니다.

```bash
npx firebase-tools login
npx firebase-tools apps:sdkconfig WEB 1:777101314338:web:f8782f201bed5f99347d7b --project nf-subtitle-study-21cae --out firebase.config.local.json
```

빌드는 JSON에서 `apiKey`, `authDomain`, `projectId`, `appId`, `oauthClientId`, `siteUrl`만 쓰고 나머지 필드는 버립니다. `apiKey`, `projectId`, `appId` 중 하나라도 없으면 설정이 없는 것으로 봅니다. 아래 두 필드는 선택이며, 빼면 이 프로젝트의 값을 씁니다([config.ts](src/shared/firebase/config.ts)).

- `oauthClientId`: Google 로그인 창에 쓰는 웹 OAuth 클라이언트 ID
- `siteUrl`: 개인정보처리방침(`/privacy/`)과 저작권 안내(`/copyright/`)가 있는 사이트 주소. 기본은 `https://nf-subtitle-study-21cae.web.app`

설정 파일이 없어도 `npm run build`는 성공합니다(CI가 이 경우입니다). 그 빌드는 설정 자리에 빈 값을 넣고 Firebase 없이 돌아, 원서 리더와 메모 모아 보기에는 로그인 대신 "Firebase 설정이 없습니다" 안내가 보이고, 넷플릭스에서는 로그아웃 상태처럼 자막 학습 기능만 기본 설정으로 씁니다.

### 자기 Firebase 프로젝트로 빌드하기

이 프로젝트의 설정을 받을 수 없으면 자기 Firebase 프로젝트를 만들어 그 설정으로 빌드합니다. 아래의 확장 프로그램 ID는 `flhkacfjjpipfoicbnmednajnhebihmb`입니다(`key`를 바꿨다면 바뀐 ID를 씁니다).

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 만듭니다. 무료 Spark 요금제로 충분합니다.
2. Cloud Firestore 데이터베이스를 만듭니다.
3. Authentication에서 Google 로그인 제공업체를 켜고, 승인된 도메인에 `chrome-extension://<확장 프로그램 ID>`를 더합니다.
4. 웹 앱을 등록합니다.
5. Google Cloud 콘솔에서 OAuth 동의 화면을 설정하고, 웹 애플리케이션 유형의 OAuth 클라이언트의 승인된 리디렉션 URI에 `https://<확장 프로그램 ID>.chromiumapp.org/`를 더합니다.
6. 저장소 루트에서 보안 규칙과 색인 설정을 배포합니다: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <프로젝트 ID>`
7. `npx firebase-tools apps:sdkconfig WEB <웹 앱 ID> --project <프로젝트 ID> --out firebase.config.local.json`으로 설정 파일을 만들고, 그 JSON에 5의 클라이언트 ID를 `oauthClientId`로 더합니다. 자기 방침 페이지가 있으면 `siteUrl`도 더합니다.
8. `npm run build`로 빌드합니다.

### 보안 규칙과 Hosting 배포

보안 규칙([firestore.rules](firestore.rules)), 색인 설정([firestore.indexes.json](firestore.indexes.json)), 개인정보처리방침·저작권 안내 페이지([site/](site/))는 저장소 루트의 [firebase.json](firebase.json)으로 배포합니다. Hosting은 `site` 폴더를 올립니다. 기본 프로젝트는 [.firebaserc](.firebaserc)의 `nf-subtitle-study-21cae`입니다.

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
```

## 검사와 테스트

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run check:build
```

파일을 고칠 때마다 테스트를 다시 돌리려면 `npm test`를 씁니다.

`npm run check:build`([check-build.mjs](scripts/check-build.mjs))는 `npm run build` 뒤에 결과물을 검사합니다.

- 빌드된 manifest의 권한이 정확히 `storage`, `unlimitedStorage`, `identity`이고, `host_permissions`가 없고, `key`가 있고, `chrome_url_overrides`가 없는지
- 번들이 네트워크로 연결하는 외부 주소가 허용 목록(Firestore, Firebase 인증, Google 로그인, 방침 사이트)에만 있는지, 외부 스크립트·스타일을 불러오지 않는지. 연결하지 않는 주소(화면 링크, 라이브러리 오류 안내 등)도 목록에 있어야 하며, 목록에 없는 외부 주소가 있으면 실패합니다.
- 넷플릭스 페이지에 들어가는 번들에 Firebase 코드가 없는지
- `build`에 개발용 메모리 저장소, 가짜 음성, 가짜 로그인, E2E 빌드의 에뮬레이터 연결 코드가 들어가지 않았는지(표시 문자열 `NF_STUDY_DEV_STORAGE_SHIM`, `NF_STUDY_FAKE_SPEECH`, `NF_STUDY_DEV_FAKE_AUTH`, `NF_STUDY_E2E_EMULATOR_LOGIN`)
- 빌드 결과와 git 추적 파일에 서비스 계정 키나 OAuth 클라이언트 보안 비밀 모양의 값이 없는지(찾는 문자열은 `scripts/check-build.mjs`에 있다)
- git에 `.pem` 파일, 백업 JSON, `firebase.config.local.json`, Firebase 로그 파일이 올라가 있지 않은지

### 에뮬레이터 테스트

```bash
npm run test:emulator
```

`firebase emulators:exec`로 Firebase 에뮬레이터(Auth 9099, Firestore 8080, 프로젝트 `demo-nf-study`)를 띄우고 `*.emulator.test.ts`를 실행합니다([vitest.emulator.config.ts](vitest.emulator.config.ts)). 보안 규칙([rules.emulator.test.ts](src/test/rules.emulator.test.ts)), Firestore 저장소, 백업, 탈퇴를 시험합니다. `demo-` 프로젝트라서 실제 Firebase 프로젝트, 설정 파일, 로그인이 필요 없습니다.

에뮬레이터에는 Java 21이 필요합니다. macOS에서 Homebrew로 `openjdk@21`을 설치했다면 먼저 PATH에 더합니다.

```bash
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
```

### E2E 테스트

```bash
npm run test:e2e
```

`npm run build`(이 PC의 설정 파일로 `build`에)와 `npm run build:e2e`(에뮬레이터에 붙는 빌드를 `build-e2e`에)를 차례로 만든 뒤, 에뮬레이터를 띄우고 [extension.e2e.test.ts](e2e/extension.e2e.test.ts)를 실행합니다([vitest.e2e.config.ts](vitest.e2e.config.ts)). Playwright로 Chromium에 확장 프로그램을 로드해 다음을 봅니다.

- 실제 빌드의 로그인 전 원서 리더에 로그인 버튼과 방침 링크가 있는지
- 로그아웃하면 Firestore 캐시를 지워 앞 계정의 데이터가 보이지 않는지
- 서비스 워커가 멈췄다 다시 붙어도 넷플릭스 쪽이 다른 클라이언트의 변경을 받는지

로컬에서만 돌리며 CI에는 넣지 않았습니다. Java 21과 Firebase 설정 파일(실제 빌드의 로그인 화면을 보므로)이 필요합니다. Playwright는 `~/.cache/design-tools/node_modules/playwright/index.mjs`에서 불러오고, `PLAYWRIGHT_MODULE`로 다른 경로를 줄 수 있습니다. 스크린샷은 `docs/specs/20261108-0925-firebase-sync/screens/`에 남깁니다.

`npm run build:e2e`(`NF_E2E=1`)는 데모 설정으로 에뮬레이터(`127.0.0.1`)에 붙고, 로그인 창 대신 테스트가 정한 가짜 Google 계정으로 로그인하는 서비스 워커([e2e.ts](src/pages/Background/e2e.ts))를 넣습니다. 테스트에만 쓰는 빌드이며 설치용이 아닙니다.

### 성능 측정

개발 서버를 띄운 상태에서 실행합니다. Playwright는 `~/.cache/design-tools`에 설치된 것을 씁니다(`DESIGN_TOOLS_DIR`로 바꿀 수 있습니다).

```bash
node scripts/perf/measure.mjs
```

[measure.mjs](scripts/perf/measure.mjs)는 `reader-dev.html?seed=perf`에서 여섯 가지 시간을 잽니다. 200만 자 본문 미리 보기(3초 이하), 20만 자 장 열기(1초 이하), 메모 5,000개 검색(0.5초 이하), 진행률이 들어간 책 목록 열기(1초 이하), 장 글자 수가 없는 예전 모양의 책 20권으로 책 목록을 처음 열기(1초 이하), 20만 자 장에서 "여기서부터 읽기"를 누른 뒤 첫 발화 요청까지(가짜 음성, 0.5초 이하)입니다.

## CI

GitHub Actions([ci.yml](.github/workflows/ci.yml))가 모든 push와 pull request에서 `npm ci`, 타입 검사, ESLint, 테스트, 에뮬레이터 테스트(Java 21 설치, 에뮬레이터 파일 캐시), 빌드, `check:build`를 차례로 실행합니다. 빌드는 Firebase 설정 파일 없이 하며, 비밀 값이 필요 없습니다. E2E 테스트는 실행하지 않습니다. Node 버전은 [.nvmrc](.nvmrc)에 고정되어 있습니다(24).

## 저장 데이터 구조

모든 학습 데이터는 로그인한 사용자의 Cloud Firestore(서울, `asia-northeast3`) 영역 `users/{uid}`에 저장합니다. 확장 프로그램 안에서 Firebase(로그인과 Firestore)는 서비스 워커에서만 돌고, 화면과 content script는 `chrome.runtime` 포트로 서비스 워커에 부탁합니다.

### Firestore 문서 구조

화면과 저장 코드는 키 이름으로 읽고 씁니다. 키 이름은 [keys.ts](src/shared/storage/keys.ts)에, 읽고 쓰는 코드는 [repo.ts](src/shared/storage/repo.ts)에, 메모 형식은 [types.ts](src/shared/memo/types.ts)에 있습니다. [firestoreLayout.ts](src/shared/storage/firestoreLayout.ts)가 키를 Firestore 문서에 대응시키고, [firestoreArea.ts](src/shared/storage/firestoreArea.ts)가 서비스 워커에서 읽고 씁니다. 문서는 두 컬렉션에 있습니다.

- `users/{uid}/kv/{docId}`: 작은 데이터를 묶어 둔 문서. 필드는 `e`(항목 이름 → 값의 맵) 하나입니다. 서비스 워커가 `kv` 컬렉션 전체를 한 번 구독해 메모리에 두므로, 메모처럼 개수가 많은 것은 문서 몇 개에 묶어 읽기 횟수를 줄입니다. 쓰기는 맵 항목 단위로 하므로 두 탭이 같은 문서의 서로 다른 항목을 저장해도 덮어쓰지 않습니다.
- `users/{uid}/ch/{docId}`: 장 본문 조각. 본문은 크고 장을 열 때만 필요해서 따로 둡니다. 필드는 `t`(본문 JSON의 일부), `i`(조각 번호), `n`(조각 수), `v`(판)입니다.

키마다 들어가는 곳은 다음과 같습니다. 문서 id에 들어가는 책·장·영상 id는 URL 인코딩합니다.

- `memo:{id}` → `kv/memos-{0~31}`의 항목 `{id}`: 메모 하나. 메모 id의 해시(FNV-1a)로 32개 문서에 나눕니다. 넷플릭스 메모와 원서 메모가 같은 형식이며, 원문(문장이나 문단), 원문 안의 위치, 고른 글을 함께 저장해 원문이 같은 곳에만 다시 붙입니다.
- `book:{id}` → `kv/book-{id}`의 항목 `m`: 책 정보(제목, 저자, 장 목록 등). 장마다 글자 수 `charCount`가 있어 학습 진행률을 본문을 읽지 않고 계산합니다. 이 항목이 없는 책(그런 백업에서 가져온 책)은 책 목록이나 리더가 처음 열 때 본문을 한 번 읽어 채웁니다.
- `bookch:{bookId}:{chapterId}` → `ch/{bookId:chapterId}~{조각 번호}`: 한 장의 본문(문단 배열). JSON으로 만들어 30만 자씩 나눈 조각(최대 100개)으로 저장합니다. 장마다 조각 수, 판, 저장 크기는 `kv/chsizes`에 두고, 같은 장을 다시 열 때 판이 같으면 Firestore 캐시의 조각을 씁니다.
- `pos:{bookId}` → `kv/positions`의 항목 `{bookId}`: 책의 마지막 읽기 위치(장과 문단)
- `done:{bookId}:{chapterId}` → `kv/done-{0~7}`의 항목 `{bookId}:{chapterId}`: 장 하나의 학습 완료(`done`, `updatedAt`). 끈 것도 `done: false`로 남겨, 백업을 합칠 때 장마다 나중에 바꾼 쪽을 고릅니다. 책을 지우면 함께 지워집니다.
- `reader:settings` → `kv/settings`의 항목 `reader`: 원서 리더 설정. 글자 크기(`fontSize`)와 소리 내어 읽기 설정(`voiceURI`, `rate`, `repeat`, `autoPause`). 예전의 `allowOnlineVoices`는 쓰지 않지만 저장된 값과 백업은 그대로 받아들입니다.
- `nf:settings` → `kv/settings`의 항목 `netflix`: 넷플릭스 학습 패널 설정 객체 하나(패널·영상 위 자막·언어별 자막 표시, 자동 멈춤, 페이지 끝 멈춤, 대사 없는 구간 넘기기, 스마트 탐색, 문장 반복, 글자 크기, 패널 너비 비율). 형식은 [netflixRecords.ts](src/shared/bridge/netflixRecords.ts)에 있습니다.
- `nf:checklist:{videoId}` → `kv/nf-checklists`의 항목 `{videoId}`: 영상의 회차별, 페이지별 5단계 체크리스트
- `nf:itemsPerPage:{videoId}` → `kv/nf-pages`의 항목 `{videoId}`: 영상의 페이지당 대사 수
- `nf:studied:{videoId}` → `kv/nf-studied`의 항목 `{videoId}`: 학습한 영상의 메타데이터(ID, 제목, 커버 이미지, 총 페이지 수, 업데이트 시간 등)
- `meta:netflixUnplaced:{videoId}` → `kv/nfu-{videoId}`의 항목 `ids`: 학습 패널이 그 영상의 대사에서 찾지 못한 넷플릭스 메모 id 목록. 메모 모아 보기가 "위치를 찾지 못함"을 붙일 때 쓰고, 패널을 열 때마다 다시 쓰므로 백업에는 넣지 않습니다.

### 저장 상한과 보안 규칙

- 앱이 [Firestore 저장 크기 계산법](https://firebase.google.com/docs/firestore/storage-size)대로 문서 크기를 세고(문서 id 색인 몫을 더해 실제보다 작게 세지 않음), 쓰기 뒤 합계가 20MB(20×1024×1024바이트)를 넘으면 쓰기를 보내지 않고 `quota-exceeded` 오류를 냅니다. 원서 리더가 이 사용량을 보입니다.
- Firestore가 무료 한도 초과(`resource-exhausted`)를 돌려주면 하루 한도가 태평양 시간 자정에 다시 채워진다는 안내와 다시 시도 버튼을 보입니다. 화면은 오류 종류 코드로 안내를 고르고 원래 오류 문구는 보이지 않습니다([storageErrors.ts](src/shared/ui/storageErrors.ts)).
- 보안 규칙([firestore.rules](firestore.rules))은 로그인한 사용자가 자기 `users/{uid}`만 읽고 쓰게 하고 나머지는 모두 거부합니다. 규칙은 문서의 바이트 크기를 잴 수 없어서 문서 id 모양, 맵 항목 수, 목록 길이, 문자열 길이에 상한을 둡니다.
- 필드 색인은 [firestore.indexes.json](firestore.indexes.json)에서 끕니다.

### 로그인과 탈퇴

- 서비스 워커([googleSignIn.ts](src/pages/Background/googleSignIn.ts))가 `chrome.identity.launchWebAuthFlow`로 Google 로그인 창을 열어(범위 `openid email`) ID 토큰을 받고, [backend.ts](src/pages/Background/backend.ts)가 그 토큰으로 Firebase Authentication에 로그인합니다. 크롬 프로필 로그인이 없어도 됩니다. 로그인 상태는 서비스 워커의 IndexedDB에 남아 크롬을 다시 켜도 유지됩니다.
- Firestore 캐시(IndexedDB)는 로그아웃하거나 탈퇴할 때 지웁니다.
- 탈퇴([account.ts](src/pages/Background/account.ts))는 그 사용자의 Firestore 문서를 모두 지운 뒤 마지막에 Firebase 계정을 지웁니다. 최근 로그인이 필요하면 로그인 창으로 다시 인증하고, 중간에 끊기면 다시 탈퇴할 때 남은 데이터부터 지웁니다.

### 백업 파일

[backup.ts](src/pages/Reader/logic/backup.ts)가 만드는 백업 파일은 형식 `nf-study-backup`, 버전 2이며, 위 키 가운데 `meta:`를 뺀 항목을 키 이름 그대로 `data`에 담습니다. 버전 2에서 넷플릭스 학습 기록(`nf:` 키)을 더했고, 버전 1 파일도 그대로 받습니다. 가져오기는 키마다 `updatedAt`이 새 쪽을 남기고 아무것도 지우지 않으며, 합친 뒤 20MB를 넘으면 가져오지 않습니다.

### 옛 로컬 데이터 지우기

업데이트한 확장 프로그램은 이전 버전이 이 PC에 둔 데이터를 Firestore로 옮기지 않고 지웁니다.

- 서비스 워커가 처음 돌 때 [localCleanup.ts](src/pages/Background/localCleanup.ts)가 `chrome.storage.local`에서 `memo:`, `book:`, `bookch:`, `pos:`, `done:`, `meta:`로 시작하는 키와 `reader:settings`를 지우고, 지운 표시 `cleanup:localData:v1`을 남겨 다시 돌지 않게 합니다. 이제 `chrome.storage.local`에는 학습 데이터를 두지 않습니다.
- 넷플릭스 페이지가 열릴 때마다 [legacyCleanup.ts](src/pages/Content/utils/legacyCleanup.ts)가 넷플릭스 `localStorage`에서 [storageKeys.ts](src/pages/Content/constants/storageKeys.ts)의 옛 학습 기록 키를 지웁니다. `NF_studied_videos`, `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_isEnglishVisible`, `NF_isKoreanVisible`, `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`, `NF_fontSize`, `NF_studyPanelWidthRatio`와 `NF_itemsPerPage_`, `NF_checklist_`, `NF_annotations_`로 시작하는 키입니다. 새 코드는 이 키를 쓰지 않으므로 지운 표시 없이 매번 지웁니다. 목록에 없는 키와 넷플릭스 자체 키는 건드리지 않습니다.

### 넷플릭스 localStorage

넷플릭스 페이지의 `localStorage`에는 자막 처리에 쓰는 두 값만 남깁니다([storageKeys.ts](src/pages/Content/constants/storageKeys.ts)). 학습 기록이 아니라 그 브라우저의 자막 처리 상태라서 계정에 저장하지 않습니다.

- `NF_lingoActive`, `NF_preferredTextLocale`

### 넷플릭스 페이지·확장 프로그램 화면과 서비스 워커 사이 통신

넷플릭스 페이지에 넣은 학습 스크립트는 `chrome.*` API를 쓸 수 없으므로, content script([storeBridge.ts](src/pages/ContentLoader/storeBridge.ts))에 `window.postMessage`로 요청합니다. content script는 같은 창, 같은 출처에서 온 아는 작업인지 [protocol.ts](src/shared/bridge/protocol.ts)로 검사한 뒤, `chrome.runtime.connect`로 연 포트(`nf-study-netflix`)로 서비스 워커에 넘깁니다. content script에서는 Firebase가 돌지 않습니다. 서비스 워커([server.ts](src/pages/Background/server.ts))는 그 포트가 이 확장 프로그램의 넷플릭스 페이지(`https://www.netflix.com`)에서 왔는지 보고, [handler.ts](src/shared/bridge/handler.ts)로 넷플릭스 메모와 넷플릭스 학습 기록 작업만 처리합니다. 넷플릭스 쪽에는 로그인 여부 하나와 오류 종류 코드만 돌려줍니다. 대시보드의 원서 리더·메모 모아 보기 링크도 이 통로로 요청하며, 탭은 서비스 워커가 엽니다.

원서 리더와 메모 모아 보기는 [extClient.ts](src/shared/rpc/extClient.ts)로 포트(`nf-study-ext`)를 열어 저장소 전체와 로그인, 로그아웃, 탈퇴, 사용량을 부탁합니다. 메시지 형식은 [protocol.ts](src/shared/rpc/protocol.ts)에 있습니다. 서비스 워커는 쉬면 멈추므로 포트는 20초마다 신호를 보내고, 끊기면 다시 붙어 보내던 요청을 다시 보내며, 그 사이 놓친 변경을 다시 읽습니다([portClient.ts](src/shared/rpc/portClient.ts)). 다른 화면이나 다른 PC에서 바뀐 것은 서비스 워커가 Firestore 구독으로 받아, 열린 포트에 무엇이 바뀌었는지 알립니다.

## 주요 파일

- 자막 가로채기와 정렬: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- 학습 패널: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- 하이라이트와 메모(넷플릭스): [SentenceList.tsx](src/pages/Content/components/SentenceList.tsx), [useAnnotations.ts](src/pages/Content/hooks/useAnnotations.ts), [annotationHelper.ts](src/pages/Content/utils/annotationHelper.ts)
- 하이라이트·메모 공통 화면: [annotationUi.tsx](src/shared/ui/annotationUi.tsx), [AnnotationEditor.tsx](src/shared/ui/AnnotationEditor.tsx), [annotations.css](src/shared/ui/annotations.css)
- 메모 모델과 공통 저장소: [src/shared/memo/](src/shared/memo/), [src/shared/storage/](src/shared/storage/)
- Firestore 문서 구조와 보안 규칙: [firestoreLayout.ts](src/shared/storage/firestoreLayout.ts), [firestoreArea.ts](src/shared/storage/firestoreArea.ts), [firestore.rules](firestore.rules)
- 서비스 워커(로그인, Firebase, 탈퇴, 옛 데이터 지우기): [src/pages/Background/](src/pages/Background/), [config.ts](src/shared/firebase/config.ts)
- 확장 프로그램 화면·content script와 서비스 워커 사이 포트: [src/shared/rpc/](src/shared/rpc/)
- 넷플릭스 페이지와 서비스 워커 사이 통신: [src/shared/bridge/](src/shared/bridge/), [storeBridge.ts](src/pages/ContentLoader/storeBridge.ts), [storeClient.ts](src/pages/Content/utils/storeClient.ts), [studyStore.ts](src/pages/Content/utils/studyStore.ts)
- 로그인·계정 화면: [src/pages/Reader/account/](src/pages/Reader/account/), 넷플릭스 로그인 안내 [StudyNotices.tsx](src/pages/Content/components/StudyNotices.tsx)
- 개인정보처리방침·저작권 안내 페이지: [site/](site/)
- 본문 정리와 장 나누기: [bookText.ts](src/shared/text/bookText.ts)
- 원서 리더, 메모 모아 보기, 백업: [src/pages/Reader/](src/pages/Reader/)
- 학습 진행률: [progress.ts](src/pages/Reader/logic/progress.ts), [ProgressBar.tsx](src/pages/Reader/components/ProgressBar.tsx)
- 소리 내어 읽기: [src/pages/Reader/tts/](src/pages/Reader/tts/)(문장 나누기, 음성 고르기, 크롬 음성 문제를 피하는 발화 관리), [ReadAloud.tsx](src/pages/Reader/components/ReadAloud.tsx)
- 툴바 팝업: [Popup.tsx](src/pages/Popup/Popup.tsx)
- 체크리스트: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- 대시보드: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- 영상 위 자막: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)

## 디자인 기준

확장 프로그램의 새 화면(원서 리더, 메모 모아 보기, 팝업)은 학습 패널의 모양에서 뽑은 [디자인 기준](docs/design.md)을 따릅니다. 색, 글꼴, 버튼, 하이라이트·메모 모양을 바꿀 때는 이 문서를 먼저 봅니다.
