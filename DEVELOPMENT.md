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

개발 서버를 띄운 뒤 `http://localhost:3000/reader-dev.html`을 열면 확장 프로그램을 로드하지 않고도 원서 리더, 메모 모아 보기, 백업 화면을 볼 수 있습니다. 이 페이지는 `chrome.*` 대신 메모리 저장소를 쓰고, 그 내용을 그 페이지의 `localStorage`에 저장합니다.

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

`reader-dev.html`, 메모리 저장소, 가짜 음성은 개발 빌드에만 들어가며 `npm run build` 결과물에는 들어가지 않습니다. 진입점은 [dev.tsx](src/pages/Reader/dev.tsx)와 [seed.ts](src/pages/Reader/dev/seed.ts)입니다. 데모 시드에는 학습 완료한 장이 섞여 있어 진행률 0%, 중간, 100%인 책이 함께 보입니다.

## 빌드

```bash
npm run build
```

`build` 폴더에 결과물을 만들고, `zip` 폴더에 배포용 압축 파일을 만듭니다.

확장 프로그램 ID는 [manifest.json](src/manifest.json)의 `key`로 고정되어 있습니다(`flhkacfjjpipfoicbnmednajnhebihmb`). 그래서 `build` 폴더를 옮기거나 다시 로드해도 같은 `chrome.storage.local`을 씁니다.

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

- 빌드된 manifest의 권한이 정확히 `storage`와 `unlimitedStorage`이고, `host_permissions`가 없고, `key`가 있고, `chrome_url_overrides`가 없는지
- 확장 프로그램 화면의 번들에 외부 스크립트·스타일 불러오기나 `fetch`·XHR가 없는지
- `build`에 개발용 메모리 저장소와 가짜 음성이 들어가지 않았는지(표시 문자열 `NF_STUDY_DEV_STORAGE_SHIM`, `NF_STUDY_FAKE_SPEECH`)
- git에 `.pem` 파일이나 백업 JSON이 올라가 있지 않은지

### 성능 측정

개발 서버를 띄운 상태에서 실행합니다. Playwright는 `~/.cache/design-tools`에 설치된 것을 씁니다(`DESIGN_TOOLS_DIR`로 바꿀 수 있습니다).

```bash
node scripts/perf/measure.mjs
```

[measure.mjs](scripts/perf/measure.mjs)는 `reader-dev.html?seed=perf`에서 여섯 가지 시간을 잽니다. 200만 자 본문 미리 보기(3초 이하), 20만 자 장 열기(1초 이하), 메모 5,000개 검색(0.5초 이하), 진행률이 들어간 책 목록 열기(1초 이하), 장 글자 수가 없는 예전 모양의 책 20권으로 책 목록을 처음 열기(1초 이하), 20만 자 장에서 "여기서부터 읽기"를 누른 뒤 첫 발화 요청까지(가짜 음성, 0.5초 이하)입니다.

## CI

GitHub Actions([ci.yml](.github/workflows/ci.yml))가 모든 push와 pull request에서 `npm ci`, 타입 검사, ESLint, 테스트, 빌드, `check:build`를 차례로 실행합니다. Node 버전은 [.nvmrc](.nvmrc)에 고정되어 있습니다(24).

## 저장 데이터 구조

데이터는 두 곳에 나눠 저장합니다.

### 확장 프로그램 저장소

하이라이트·메모와 원서는 확장 프로그램 자체 저장소 `chrome.storage.local`에 저장합니다. `unlimitedStorage` 권한으로 용량 한도를 풉니다. 넷플릭스 사이트 데이터를 지워도 남지만, 확장 프로그램을 제거하면 지워지므로 원서 리더에 백업 내보내기·가져오기([backup.ts](src/pages/Reader/logic/backup.ts))가 있습니다. 키 이름은 [keys.ts](src/shared/storage/keys.ts)에, 읽고 쓰는 코드는 [repo.ts](src/shared/storage/repo.ts)에, 메모 형식은 [types.ts](src/shared/memo/types.ts)에 있습니다.

- `memo:{id}`: 메모 하나. 메모마다 키가 하나라서 두 탭이 서로 다른 메모를 저장해도 덮어쓰지 않습니다. 넷플릭스 메모와 원서 메모가 같은 형식이며, 원문(문장이나 문단), 원문 안의 위치, 고른 글을 함께 저장해 원문이 같은 곳에만 다시 붙입니다.
- `book:{id}`: 책 정보(제목, 저자, 장 목록 등). 장마다 글자 수 `charCount`가 있어 학습 진행률을 본문을 읽지 않고 계산합니다. 이 항목 전에 저장한 책(또는 그런 백업에서 가져온 책)은 책 목록이나 리더가 처음 열 때 본문을 한 번 읽어 채웁니다.
- `bookch:{bookId}:{chapterId}`: 한 장의 본문(문단 배열)
- `pos:{bookId}`: 책의 마지막 읽기 위치(장과 문단)
- `done:{bookId}:{chapterId}`: 장 하나의 학습 완료(`done`, `updatedAt`). 장마다 키가 하나라서 두 탭이 서로 다른 장을 바꿔도 덮어쓰지 않습니다. 끈 것도 `done: false`로 남겨, 백업을 합칠 때 장마다 나중에 바꾼 쪽을 고릅니다. 책을 지우면 함께 지워집니다.
- `reader:settings`: 원서 리더 설정. 글자 크기(`fontSize`)와 소리 내어 읽기 설정(`voiceURI`, `rate`, `repeat`, `autoPause`). 예전의 `allowOnlineVoices`는 쓰지 않지만 저장된 값과 백업은 그대로 받아들인다
- `meta:legacyMigration`: 예전 메모 옮기기의 진행 기록과 완료 표시
- `meta:netflixUnplaced:{videoId}`: 학습 패널이 그 영상의 대사에서 찾지 못한 넷플릭스 메모 id 목록. 메모 모아 보기가 "위치를 찾지 못함"을 붙일 때 쓰고, 패널을 열 때마다 다시 쓰므로 백업에는 넣지 않습니다.

### 넷플릭스 localStorage

학습 기록과 설정은 지금처럼 넷플릭스 페이지의 `localStorage`에 저장합니다. 키 이름은 [storageKeys.ts](src/pages/Content/constants/storageKeys.ts)에 모여 있습니다.

- `NF_studied_videos`: 학습한 영상의 메타데이터(ID, 제목, 커버 이미지, 총 페이지 수, 업데이트 시간 등)
- `NF_checklist_{videoId}`: 영상의 회차별, 페이지별 5단계 체크리스트
- `NF_itemsPerPage_{videoId}`: 영상의 페이지당 대사 수
- `NF_isEnglishVisible`, `NF_isKoreanVisible`: 자막 표시 설정
- `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`: 재생 설정
- `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_studyPanelWidthRatio`, `NF_fontSize`: 화면 설정
- `NF_lingoActive`, `NF_preferredTextLocale`: 자막 처리에 쓰는 값
- `NF_annotations_{videoId}`: 예전 하이라이트와 메모. 확장 프로그램 저장소로 옮긴 뒤에는 읽지도 쓰지도 않지만, 원본으로 그대로 남겨 둡니다.

### 예전 메모 옮기기

넷플릭스 페이지가 열리면 [storeClient.ts](src/pages/Content/utils/storeClient.ts)의 `ensureLegacyMigration`이 모든 `NF_annotations_*` 값을 모아 보내고, [legacyMigration.ts](src/shared/storage/legacyMigration.ts)가 확장 프로그램 저장소로 복사합니다.

- `NF_studied_videos`에 그 영상이 있으면 영상 제목, 시즌, 회차를 메모에 더합니다.
- 원본은 지우거나 고치지 않습니다.
- 같은 id의 메모가 이미 있으면 덮어쓰지 않으므로 여러 번 실행해도 중복되지 않습니다. 이미 옮긴 영상은 다시 옮기지 않아, 옮긴 뒤 지운 메모가 되살아나지 않습니다.
- 영상별로 따로 처리하므로 깨진 JSON 하나가 다른 영상을 막지 않습니다. 실패한 영상이 하나라도 있으면 완료 표시를 남기지 않고 다음에 넷플릭스 페이지를 열 때 다시 시도합니다.

### 넷플릭스 페이지와 저장소 사이 통신

넷플릭스 페이지에 넣은 학습 스크립트는 `chrome.*` API를 쓸 수 없으므로, content script([storeBridge.ts](src/pages/ContentLoader/storeBridge.ts))에 `window.postMessage`로 요청합니다. content script는 같은 창, 같은 출처에서 온 메시지인지, 아는 작업인지, 넷플릭스 메모만 다루는지 [protocol.ts](src/shared/bridge/protocol.ts)와 [handler.ts](src/shared/bridge/handler.ts)에서 검사한 뒤 저장소를 읽고 씁니다. 대시보드의 원서 리더·메모 모아 보기 링크도 이 통로로 요청하며, 탭은 서비스 워커([index.ts](src/pages/Background/index.ts))가 엽니다.

## 주요 파일

- 자막 가로채기와 정렬: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- 학습 패널: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- 하이라이트와 메모(넷플릭스): [SentenceList.tsx](src/pages/Content/components/SentenceList.tsx), [useAnnotations.ts](src/pages/Content/hooks/useAnnotations.ts), [annotationHelper.ts](src/pages/Content/utils/annotationHelper.ts)
- 하이라이트·메모 공통 화면: [annotationUi.tsx](src/shared/ui/annotationUi.tsx), [AnnotationEditor.tsx](src/shared/ui/AnnotationEditor.tsx), [annotations.css](src/shared/ui/annotations.css)
- 메모 모델과 공통 저장소: [src/shared/memo/](src/shared/memo/), [src/shared/storage/](src/shared/storage/)
- 넷플릭스 페이지와 저장소 사이 통신: [src/shared/bridge/](src/shared/bridge/), [storeBridge.ts](src/pages/ContentLoader/storeBridge.ts), [storeClient.ts](src/pages/Content/utils/storeClient.ts)
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
