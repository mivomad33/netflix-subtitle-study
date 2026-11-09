# 결과 보고서: 여러 기기 동기화(Firebase)

명세서: [spec.md](spec.md) · 진행 기록: [progress.md](progress.md) · 작업 브랜치 `firebase-sync`

## 사용자가 할 일

### 마지막 확인(명세서 5장 "사용자가 마지막에 확인한다")

1. **로그인**: 이 PC에서 `npm run build`(설정 파일 `firebase.config.local.json`이 있어 실제 설정으로 빌드된다) 뒤 `chrome://extensions`에서 확장 프로그램을 다시 로드하고, 원서 리더에서 "Google로 로그인"으로 `mivomad33@gmail.com`이나 다른 Google 계정으로 로그인된다. 테스트 사용자로 등록하지 않은 계정으로도 된다(4.1-1, 4.8-5). 로그인 창에 "확인되지 않은 앱"류 표시가 떠도 진행된다(브랜드 검증은 하지 않기로 함).
2. **다른 기기에서 이어 하기**: 책을 하나 가져오고 메모를 쓴 뒤, 다른 PC(DEVELOPMENT.md "Firebase 설정"대로 설정 파일을 만들어 빌드) 또는 다른 크롬 프로필에서 같은 계정으로 로그인하면 같은 책·메모·읽던 위치가 보인다. 두 곳을 열어 둔 채 한쪽에서 메모를 고치면 다른 쪽에 10초 안에 반영된다(4.2-1, 4.2-3).
3. **넷플릭스 체크리스트**: 넷플릭스에서 체크리스트를 바꾸면 다른 PC의 넷플릭스 대시보드에도 보인다(4.2-1, 4.3-1).
4. **로그인 유지와 계정 바꾸기**: 크롬을 껐다 켜도 로그인이 유지된다. 로그아웃하고 다른 계정으로 로그인하면 앞 계정의 데이터가 보이지 않는다(4.1-3, 4.1-4).
5. **장 열기 속도**: 같은 장을 두 번째로 열 때 1초 이하로 열린다(4.2-5).
6. (원하면) 테스트용 계정으로 탈퇴해 보고, Firebase 콘솔(`hunt24333`)의 Authentication과 Firestore에서 그 계정과 `users/{uid}` 데이터가 없어졌는지 본다(4.6-1).

주의: 이 빌드를 처음 로드하면 이 PC의 옛 로컬 학습 데이터(`chrome.storage.local`, 넷플릭스 `localStorage`의 이 확장 프로그램 키)를 지운다. 남길 데이터가 없다고 정했으므로(2장) 그대로 진행해도 된다.

### 다음 단계

- 사용자가 위 확인을 마쳤다고 알렸다(2026-11-09, "확인완료").
- 4.9-1(새 화면·상태가 `docs/design.md`를 따르는지, 1280·1024px)의 깨끗한 회차를 보려면 `/design-check`를 따로 돌린다.

### 보류를 풀 방법

보류한 것 없음.

### 승인할 제안

아래 "제안"을 보고 다음 명세서로 할지 정한다. 사용자가 고치라고 한 세 가지는 이미 고쳤다(아래 "사용자 확인 뒤 고친 것").

### 머지

사용자가 확인을 마치고 제안 수정과 커밋·머지·push를 맡겼다(2026-11-09). `firebase-sync`를 main에 머지하고 origin/main에 push한 뒤 main의 CI를 봤다. `review-done`은 돌리지 않았고, 목록 상태는 사용자 지시로 '완료'로 바꿨다. 운영 프로젝트의 보안 규칙은 이 브랜치의 마지막 규칙(`27b9554`)으로 배포돼 있다(두 번째 배포가 "already up to date").

## 만든 것

- **Google 로그인**: 원서 리더·메모 모아 보기는 로그인해야 데이터를 보여 준다. 로그인 창은 `chrome.identity.launchWebAuthFlow`(범위 `openid email`)이고, 받은 ID 토큰(이번 창의 nonce 확인)으로 Firebase에 로그인한다. 로그아웃은 Firestore SDK 캐시까지 지운다.
- **Firestore 저장**: 메모, 책·장 본문, 읽던 위치, 학습 완료, 원서 리더 설정, 넷플릭스 학습 기록을 모두 `users/{uid}`(서울)에 둔다. Firebase는 서비스 워커에서만 돌고, 확장 화면과 넷플릭스 content script는 포트로 부탁한다. 넷플릭스 포트는 넷플릭스 작업만 받는다. 다른 화면·기기의 변경은 스냅샷 구독으로 열린 화면에 반영된다.
- **상한과 안내**: 사용자당 20MB(머리글에 "사용량 n MB / 20 MB"), 무료 한도 초과·네트워크·권한·로그인 만료별 안내와 다시 시도.
- **보안 규칙**: 자기 uid 영역만 읽고 쓰기, 문서별 크기 상한. 운영 프로젝트에 배포.
- **탈퇴**: 확인 대화상자(백업 권함, 방침 링크) 뒤 데이터를 모두 지우고 계정을 지운다. 최근 로그인이 필요하면 다시 인증하고, 끊기면 다시 눌러 이어 지운다.
- **백업**: 형식 2(넷플릭스 기록 포함), 형식 1 파일도 가져온다. 합치면 20MB를 넘는 파일은 하나도 쓰지 않는다.
- **옛 로컬 데이터 지우기**: `chrome.storage.local`(한 번), 넷플릭스 `localStorage`의 이 확장 프로그램 키(열 때마다).
- **넷플릭스 패널**: 로그인하지 않아도 자막 학습 기능은 기본 설정으로 돈다. 저장하는 자리에는 "로그인 화면 열기" 안내.
- **공개 페이지**: <https://nf-subtitle-study-21cae.web.app/privacy/>, <https://nf-subtitle-study-21cae.web.app/copyright/>(한국어·영어). OAuth 동의 화면 브랜딩에 홈페이지·방침 주소·승인된 도메인을 넣었다.
- **검증 기반**: `npm run test:emulator`(Auth·Firestore 에뮬레이터, CI에도 넣음), `npm run test:e2e`(로컬 전용, 빌드한 확장 프로그램을 Playwright로 띄움), `check:build`(권한 3개, 외부 연결 대상, Firebase가 content 번들에 없음, 비밀 값, 개발용 표시).
- **문서**: README·DEVELOPMENT(두 언어), `docs/design.md`의 계정·저장 안내 부품.

사용법은 README.md "로그인과 데이터", 빌드 설정과 테스트는 DEVELOPMENT.md "Firebase 설정", "에뮬레이터 테스트", "E2E 테스트"에 있다.

### 화면

| 화면 | 스크린샷 |
|---|---|
| 로그인 전(실제 빌드, E2E) | [screens/reader-signed-out-1280.png](screens/reader-signed-out-1280.png) |
| 로그인됨 1280 / 1024 | [1280](screens/reader-signed-in-1280.png) · [1024](screens/reader-signed-in-1024.png) |
| 사용량 가득 1024 | [screens/reader-usage-full-1024.png](screens/reader-usage-full-1024.png) |
| 탈퇴 확인 1280 | [screens/reader-delete-dialog-1280.png](screens/reader-delete-dialog-1280.png) |
| 설정 없음 1024 | [screens/reader-unconfigured-1024.png](screens/reader-unconfigured-1024.png) |
| OAuth 브랜딩 | [oauth-branding.png](oauth-branding.png) |

## 이 명세서만의 보고 내용

- 하루 읽기 예상(4.2-7): 많이 쓰는 사용자 하나가 하루 약 800 읽기(서비스 워커 다시 시작 20번 × kv 문서 35 + 장 열기). 무료 5만이면 약 60명이 한도 안이다. 계산은 progress.md "4.2-7 하루 읽기 예상".
- 성능(4.2-5, 개발 화면): 미리 보기 57ms, 장 열기 59ms, 검색 21ms, 책 목록 20·35ms, 첫 발화 0.3ms(모두 기준 통과).
- OAuth 브랜드 검증 상태: "Your branding needs to be verified before it can be shown to users."(검증 신청 안 함, 2장 결정). 게시 상태 "In production", 사용자 유형 External.

## 요구사항별 상태와 확인 근거

"다음 단계"는 이 스킬 다음의 `design-check`에서 확인하는 항목이다. 자세한 근거는 progress.md에도 같다.

| 항목 | 상태 | 확인 근거 |
|---|---|---|
| 4.1-1 로그인 버튼·창·이메일 표시 | 사용자 확인 | 단위 `AuthGate.test.tsx` 4.1-1(가짜 로그인 → 이메일 표시). 실제 Google 로그인은 사용자 확인. 기능 끄면 실패 확인(AuthGate가 늘 안을 그리게 바꿔 15개 실패) |
| 4.1-2 로그아웃 상태 안내·넷플릭스 기본 동작 | 만족 | 단위 `AuthGate.test.tsx` 4.1-2(세는 저장소: 로그인 전 호출 0, 로그인 뒤 데이터 보임), `StudyPanel.store.test.tsx`·`StudyDashboardModal.test.tsx` 4.1-2(로그아웃이면 자막 목록은 기본 설정으로 그려지고 저장소를 부르지 않으며 "로그인 화면 열기" 안내) |
| 4.1-3 로그인 유지·만료 시 안내 | 사용자 확인 | 단위 `AuthGate.test.tsx` 4.1-3(로그인 → 만료 상태가 오면 만료 안내와 로그인 화면). Auth는 `indexedDBLocalPersistence`. 브라우저 재시작 유지는 사용자 확인 |
| 4.1-4 로그아웃 시 캐시 지우기(E2E) | 만족 | E2E `e2e/extension.e2e.test.ts` 4.1-4(리더 화면 둘, 계정 A로 쓴 "Alpha Secret Book"이 둘 다에 보이고 서비스 워커의 Firestore IndexedDB에 있음 → 로그아웃 뒤 캐시에 없음 → 계정 B로 로그인하면 A의 것이 없음). `npm run test:e2e` 3개 통과(커밋 7172cf2). 기능 없이 실패: 2026-11-09 로그아웃의 `resetCache`를 잠시 빼고 `npm run test:e2e` → 4.1-4만 실패(캐시에 "Alpha Secret Book"이 남음), 되돌림 |
| 4.1-5 로그인 취소 안내 | 만족 | 단위 `AuthGate.test.tsx` 4.1-5. 받은 토큰의 nonce가 다르면 `invalid`로 거절(`googleSignIn.test.ts` "ID token nonce", 검사를 넣기 전 코드에서 "refuses" 테스트가 실패하는 것을 봄) |
| 4.2-1 모든 데이터 Firestore | 만족 | 통합 `firestoreArea.emulator.test.ts` 4.2-1(종류마다 쓰고 새 클라이언트로 읽기; "many Netflix checklists": 합계 1MiB 넘는 체크리스트 80개를 쓰고 읽으며 kv 문서마다 1MiB 아래. 체크리스트를 한 문서에 두던 코드에서는 그 문서 쓰기가 거부되어(에뮬레이터에서는 permission-denied로 나옴) 실패하는 것을 본 뒤 16개 문서로 나눔), 단위 `noLocalStorageWrites.test.tsx`(넷플릭스 저장 코드가 자막 처리 값 둘 밖의 `localStorage.setItem`을 부르지 않음), 서비스 워커는 `chrome.storage.local.set`을 쓰지 않음(`localCleanup.test.ts`의 지운 표시만) |
| 4.2-2 기존 기능 유지 | 만족 | `npm run test:run` 전체 통과(기존 단위 테스트), 통합 `firestoreArea.emulator.test.ts` 4.2-2(기존 `repo.test.ts`와 같은 경우를 Firestore 저장소로) |
| 4.2-3 10초 안에 반영(통합·단위·E2E) | 만족 | 통합 4.2-3(두 클라이언트, 10초 안 알림, 나중 쓴 쪽 남음), 단위 `storeBridge.test.ts`·`server.test.ts`·`liveMemos.test.ts`·`StudyPanel.store.test.tsx`(알림 전달, 다시 붙은 뒤 구독 되살림), E2E 4.2-3(CDP `ServiceWorker.stopAllWorkers`로 멈춘 것을 상태 이벤트로 확인한 뒤 다른 클라이언트가 쓴 변경을 넷플릭스 페이지가 10초 안에 받음, 값은 안 옴) |
| 4.2-4 큰 본문 | 만족 | 통합 `firestoreArea.emulator.test.ts` 4.2-4(1.5MiB 넘는 한국어 장, 조각 정리) |
| 4.2-5 성능 기준 | 사용자 확인 | 2026-11-09 `node scripts/perf/measure.mjs`(개발 화면, 책 20권·메모 5,000개) 여섯 개 모두 통과: 미리 보기 57ms, 장 열기 59ms, 검색 21ms, 책 목록 20ms·35ms, 첫 발화 0.3ms. 운영 프로젝트의 두 번째 장 열기 1초 이하는 사용자 확인 |
| 4.2-6 저장 실패 안내 | 만족 | 단위 `AuthGate.test.tsx` storage error notices(리더: 저장소가 각 오류를 내면 종류별 안내), `StudyPanel.store.test.tsx` 4.2-6(넷플릭스 패널) |
| 4.2-7 읽기 수 | 만족 | 통합 4.2-7(메모 2000·장 30개 시드에서 kv 문서 35개 이하, 장 하나 열 때 그 장 조각만 읽음). 하루 예상 계산은 아래 |
| 4.3-1 브리지 허용 범위 | 만족 | 단위 `handler.test.ts` 4.3-1, `server.test.ts` 4.3-1(넷플릭스 포트는 area.*·auth.*·account.* 거부) |
| 4.3-2 로그인 여부만, 오류 코드만 | 만족 | 단위 `handler.test.ts` 4.3-2, `server.test.ts` 4.3-2(이메일 없음), `storeBridge.test.ts` 4.3-2 |
| 4.3-3 형식·크기 검사 | 만족 | 단위 `handler.test.ts` 4.3-3 |
| 4.3-4 content 번들에 Firebase 없음 | 만족 | `check-build.test.ts` 4.3-4(표지 넣은 content 번들 실패). 실제 설정 빌드와 자리표시 빌드(CI) 모두 `npm run check:build` ok |
| 4.4-1 20MB 상한·사용량 | 만족 | 통합 4.4-1(상한 아래 통과·넘으면 거부·지운 뒤 다시 씀), 단위 `AuthGate.test.tsx` 4.4-1(사용량 n MB / 20 MB, 가득 참) |
| 4.4-2 무료 한도 초과 안내 | 만족 | 단위 `AuthGate.test.tsx` storage error notices(resource-exhausted만 태평양 시간 문구, 다시 시도로 다시 읽음) |
| 4.4-3 오류 종류별 안내 | 만족 | 단위 같은 곳(종류별 다른 문구, uid 든 원래 문구가 안 보임) |
| 4.4-4 대기 표시 | 만족 | 단위 `AuthGate.test.tsx` 4.4-4 |
| 4.5-1 규칙 uid 분리 | 만족 | 통합 `rules.emulator.test.ts`. 규칙을 모두 허용으로 바꾸면 거부·상한 테스트 9개 실패 확인 뒤 되돌림 |
| 4.5-2 규칙 크기 상한 | 만족 | 통합 `rules.emulator.test.ts`(상한 바로 아래 통과, 넘으면 거부) |
| 4.5-3 배포 규칙 일치 | 만족 | 2026-11-09 `firebase deploy --only hosting,firestore:rules,firestore:indexes` 뒤 `firebase deploy --only firestore:rules` 다시 실행 → `latest version of firestore.rules already up to date, skipping upload...`. 체크리스트 문서를 나눈 규칙으로 고친 뒤 다시 배포(`released rules firestore.rules`)하고 한 번 더 실행해 같은 "already up to date" 확인 |
| 4.6-1 탈퇴 | 만족 | 통합 `account.emulator.test.ts` 4.6-1(A 문서 0, A Auth 없음, B 그대로), 단위 `AuthGate.test.tsx` 4.6-1(확인 단계 전에는 지우지 않음, 백업 권함) |
| 4.6-2 탈퇴 재인증·이어 하기 | 만족 | 통합 `account.emulator.test.ts` 4.6-2(중간 실패 뒤 다시 실행, 최근 로그인 필요 시 재인증 후 그사이 쓴 것도 지움) |
| 4.7-1 chrome.storage.local 지우기 | 만족 | 단위 `localCleanup.test.ts` |
| 4.7-2 넷플릭스 localStorage 지우기 | 만족 | 단위 `legacyCleanup.test.ts`(지울 키, 남길 자막 처리 값, `NF_other`, `nf_x`, `NFX`), `Content/index.test.tsx`(열 때마다 부름) |
| 4.7-3 legacyMigration 없애기 | 만족 | `grep -rn "legacyMigration\|ensureLegacyMigration\|legacy.migrate" src`: 코드에는 없고, 거부를 확인하는 테스트(`handler.test.ts`의 `legacy.migrate` 거부)와 지울 키 목록 테스트에만 남음. 전체 테스트 통과 |
| 4.8-1 백업 내보내기 | 만족 | 통합 `backup.emulator.test.ts` 4.8-1, 단위 `backup.test.ts` 형식 2 |
| 4.8-2 백업 가져오기 | 만족 | 통합 `backup.emulator.test.ts` 4.8-2(버전 1 파일, 새 쪽 남김, 상한 초과 시 하나도 안 씀), 단위 `backup.test.ts` |
| 4.8-3 공개 페이지 | 만족 | Hosting 배포(배포 폴더 `site/`: `index.html`, `privacy/index.html`, `copyright/index.html` 3개뿐). `curl` 두 페이지 200, 연락처·서울 지역·uid·IP·보관 기간·탈퇴·백업·시행일·신고 처리 문구 확인 |
| 4.8-4 방침 링크 | 만족 | 단위 `AuthGate.test.tsx` 4.8-4(로그인 화면), 4.6-1(탈퇴 확인). README.md·README.en.md "로그인과 데이터" 절에 두 링크 |
| 4.8-5 OAuth 브랜딩 | 만족(로그인은 사용자 확인) | 2026-11-09 Claude in Chrome(hunt24333)으로 Google Auth Platform 브랜딩에 홈페이지 `https://nf-subtitle-study-21cae.web.app/`, 개인정보처리방침 `.../privacy/`, 승인된 도메인 `nf-subtitle-study-21cae.web.app`을 넣고 저장(저장하려면 필수인 개발자 연락처에 `hunt24333@gmail.com`도 넣음). 다시 열어 값이 남은 것 확인. Audience의 게시 상태 "In production", 사용자 유형 External. 브랜드 검증 상태: "Your branding needs to be verified before it can be shown to users."(검증은 신청 안 함, 2장 결정). 잘라 낸 스크린샷 [oauth-branding.png](oauth-branding.png) |
| 4.9-1 화면(design-check) | 다음 단계 | 구현 중 자기 점검: `shoot.mjs`로 1280·1024의 로그인 전(실제 빌드), 로그인됨, 사용량 가득, 탈퇴 확인, 설정 없음을 찍어 봄(axe 위반 없음, `screens/`). `design-check` 깨끗한 회차는 이 스킬 다음 단계(`/browser-check` → `/design-check`)에서 한다. 넷플릭스 패널 안내·네트워크 오류·무료 한도 초과 상태의 스크린샷은 그 단계에서 찍는다 |
| 4.10-1 권한 | 만족 | `manifest.json`에 identity, `check-build.test.ts`(권한을 하나 더한 manifest면 실패), `npm run check:build` ok |
| 4.10-2 외부 연결 대상 | 만족 | `check-build.test.ts` 4.10-2(evil.test 호출 실패, 넷플릭스 링크만 있는 번들 통과). 실제 설정 빌드에서 `npm run check:build` ok(모든 JS 검사) |
| 4.10-3 비밀 값·무시 파일 | 만족 | `check-build.test.ts` 4.10-3(`"private_key":`, `client_secret` 든 파일로 실패), `check:build`가 빌드 결과·추적 파일 검사 ok. `git check-ignore`로 `firebase.config.local.json`, `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log` 무시 확인 |
| 4.10-4 로그에 개인정보 없음 | 만족 | `grep -rn "console\." src/pages/Background src/shared src/pages/Reader src/pages/Content src/pages/ContentLoader`(테스트 제외): 인증·저장 코드의 로그는 오류 종류 코드(`toStorageErrorCode`)만 넘긴다. 이메일·토큰·메모·본문을 넘기는 로그 없음(`repo.ts` 글자 수 오류 로그도 코드만 남기게 고침) |
| 4.10-5 설정 주입 | 만족 | 설정 없이 `npm run build`·`check:build` 통과(CI 성공 9a65011). 단위 `AuthGate.test.tsx` 4.10-5(설정 없음 안내). 빌드 결과 `grep -l`로 앱 id: 자리표시 빌드 0개 파일, 이 PC 설정 빌드 2개 파일. `firebase.config.local.json`은 `apps:sdkconfig`로 만들었고 무시됨 |
| 4.11-1 에뮬레이터 테스트 한 명령 | 만족 | `npm run test:emulator` 39개 통과. `rules.emulator.test.ts`가 프로젝트 id가 demo-로 시작하는지 검사 |
| 4.11-2 CI | 만족 | `.github/workflows/ci.yml`에 `actions/setup-java`(temurin 21)와 `npm run test:emulator`. E2E는 CI에 없음. 9a65011, 7172cf2, a5ce1ff CI 성공. 마지막 커밋은 report.md 참고 |
| 4.11-3 개발 화면·표시 검사 | 만족 | `reader-dev.html`은 메모리 저장소와 가짜 로그인(`fakeAuth.ts`), 넷플릭스 패널 개발 화면 `netflix-dev.html`(`?auth=out\|wait`, `?error=`). `check:build`의 개발 표시에 `NF_STUDY_DEV_FAKE_AUTH`, `NF_STUDY_E2E_EMULATOR_LOGIN`, 에뮬레이터 연결 문구를 더하고 그 표시를 넣은 번들로 실패하는 테스트(`check-build.test.ts` 4.11-3). 일반 빌드 ok |
| 4.12-1 README·DEVELOPMENT | 만족 | README·DEVELOPMENT 두 언어에 로그인, Firestore 구조, 20MB·무료 한도, 탈퇴, 옛 로컬 데이터 지우기와 업데이트 전 백업 안내, 방침 링크, `identity` 권한, 설정 파일(`apps:sdkconfig ... --out firebase.config.local.json`, 자기 Firebase 프로젝트로 빌드하기 8단계), 에뮬레이터·E2E 테스트(Java 21 PATH), 배포. 두 언어 대조: 절 구성과 줄 수가 같고(README 226줄, DEVELOPMENT 246줄씩) 절마다 문장을 맞춰 봄(서브에이전트 대조 뒤 메인이 로그인 절을 읽어 확인) |
| 4.12-2 design.md | 만족 | `docs/design.md` 5장 "계정과 저장 안내"에 로그인 화면, 대기 표시, 계정 표시, 확인 대화상자, 저장 오류 안내, 넷플릭스 패널의 안내를 더함. `design-check`가 이 기준으로 본다 |
| 완료: 전체 검사 통과 | 만족 | `27b9554`에서 typecheck, lint, `test:run` 427개, `test:emulator` 40개, build, check:build, `test:e2e` 3개 통과 |
| 완료: 마지막 커밋 CI 성공 | 만족 | `552c300` CI 성공. 보고서 커밋의 CI는 report.md 참고 |
| 완료: 규칙 배포·Hosting·OAuth | 만족 | 4.5-3, 4.8-3, 4.8-5 |
| 완료: 실제 확장 프로그램 로그인 전 화면 | 만족 | E2E "real build signed-out screen"(로그인 버튼과 방침 링크 두 개 보임), [screens/reader-signed-out-1280.png](screens/reader-signed-out-1280.png) |

## 마지막 검증

- 결과 대조(`result-auditor`, 모델 sonnet)
  - 1차: 커밋 `a5ce1fffb6ad50229eee8c2ef451f28b2e17516f` 대조. 직접 돌린 typecheck·lint·test:run(418)·build·check:build·test:emulator(38) 모두 통과. 4.9-1(design-check 미실행)과 CI 진행 중 말고는 만족·사용자 확인. 운영 프로젝트·콘솔 항목(4.5-3, 4.8-5)은 기록으로만 봄. "기능 없이 실패" 기록이 없는 새 테스트가 많다고 지적(아래 "알려 둘 것").
  - 2차(고친 커밋만): 커밋 `552c3008dbf9ef50c23ba8e81f52799c73717a5c`의 변경(`a5ce1ff..552c300`)에 걸리는 14개 요구사항(4.1-1, 4.1-3, 4.1-5, 4.2-1, 4.2-3, 4.3-1, 4.5-1~3, 4.6-1~2, 4.8-1~2, 4.12-1) 모두 만족. 지적: 로그아웃 실패 안내 수정에 테스트 없음(이유를 progress.md에 적음), nonce·대기 시간 테스트의 실패 기록 없음(기록 더함), 4.11-1 개수(38→39로 고침), 4.2-1 문구(바로잡음).
- 빌드·검사(마지막 커밋 기준): typecheck, lint, `test:run` 51개 파일 421개, `test:emulator` 4개 파일 39개, build, check:build 모두 통과. E2E(`npm run test:e2e`) 3개도 `552c300` 코드로 다시 돌려 통과.
- CI: `552c3008dbf9ef50c23ba8e81f52799c73717a5c` 성공(`gh run list --commit`). 그 뒤 커밋은 보고서·진행 기록만 바꾼다(이 커밋의 CI는 push 뒤 따로 본다).

### 알려 둘 것

- 새 테스트 중 "기능을 빼면 실패하는 것"을 이 기록에 남긴 것은 4.1-1(AuthGate 15개), 4.1-4(E2E), 4.5-1(규칙 모두 허용 시 9개 실패), 4.2-1 체크리스트 나누기, 로그인 대기 시간, nonce 검사다. 넷플릭스 쪽 테스트는 만든 서브에이전트가 기능을 빼고 실패를 봤다고 보고했다. 나머지(4.1-2, 4.2·4.3·4.4·4.6·4.7·4.8·4.10의 통합·단위 테스트 다수)는 테스트를 기능과 함께 썼고 실패를 따로 기록하지 않았다. 테스트는 요구사항의 결과(문서 수, 지워진 문서 0개, 거부 코드 등)를 구체적으로 단언한다.

## 사용자 확인 뒤 고친 것(2026-11-09, `27b9554`)

사용자가 확인을 마친 뒤 "제안" 중 고치는 것이 좋은 것을 골라 고쳤다. 새 테스트는 모두 고치기 전에 실패하는 것을 봤다.

- 메모 글 저장 묶기: 메모 글은 입력이 400ms 멈춘 뒤 마지막 글만 한 번 저장하고, 편집을 닫거나 화면을 떠나면 바로 저장한다(넷플릭스 패널, 메모 모아 보기, 원서 리더). 새 메모는 바로, 지운 메모는 기다리던 저장을 버린다. 다시 읽을 때 아직 저장하지 않은 글을 되돌리지 않는다. 테스트: `memoSaver.test.ts` 3개, `StudyPanel.test.tsx` "saves a memo being typed once after typing pauses", `MemoCollection.test.tsx` "고치는 메모 글은 글자마다가 아니라 입력이 멈춘 뒤 한 번 저장한다"(두 화면 테스트는 고치기 전 글자마다 써서 실패).
- 위치를 찾지 못한 메모 목록: 영상마다 문서(`nfu-{영상}`)를 만들지 않고 `kv/nf-unplaced` 한 문서의 영상별 항목에 둔다. 규칙도 바꿔 다시 배포했다. 테스트: 에뮬레이터 "keeps the lists of many videos in one kv document"(고치기 전 문서 3개로 실패), 규칙 "limits list length"(`nf-unplaced` 5000개 항목 통과·5001개 거부, 옛 `nfu-` 문서 거부). 옛 구조로 이미 만들어진 `nfu-` 문서가 있으면 읽지 않고 남는다(작고 탈퇴 때 함께 지워진다).
- 공부한 영상 기록: 체크박스를 누를 때마다 오는 `studied.put`이 시각만 10분 안으로 바뀐 같은 기록이면 다시 쓰지 않는다. 대시보드가 최근 공부한 순으로 늘어놓으므로 아예 건너뛰지 않고 10분이 지나면 쓴다. 테스트: `handler.test.ts` "does not rewrite a studied video when only the time moved a little"(고치기 전 실패).
- 고치지 않기로 한 제안(장 본문 다시 쓰기 중 읽기·알림, 넷플릭스 기록 표, 넷플릭스 공용 훅, 대시보드 영상별 읽기, mirror 없애기)은 아래 "제안"에 남겼다. 대시보드 읽기는 서비스 워커의 메모리에서 답해 Firestore 읽기가 늘지 않고, 나머지는 구조 정리라 지금 이득이 작다.

## 재사용과 단순화

`/simplify`(네 관점 검토)를 돌려 `77b4685`에서 고쳤다: 저장 재시도 감싸개 6곳 제거, JSON 비교·복사·글자 수·오류 코드 변환 도우미 하나로, 로그아웃·탈퇴 마무리 합치기, 공부한 영상 글자 수 상한·20MB 상수 공유, 안 쓰는 코드(옛 chrome.storage 저장소, 안 쓰는 타입·안내 문구·빌드 값) 제거. 원서 리더 CSS의 겹친 회전 표시 규칙은 `9cf365a`에서 지웠다. 구조를 바꾸는 큰 정리는 "제안"에 적었다.

## 코드 리뷰

- `/code-review high`, 대상 `main...a5ce1ff`. 8건.
  - 고침(`552c300`): 넷플릭스 체크리스트가 한 문서에 몰려 1MiB 한도를 넘는 문제(16개 문서로 나누고 규칙 다시 배포), 로그인·탈퇴 요청이 60초 제한에 걸리는 문제(10분), ID 토큰 nonce 미검사, 로그아웃 실패 뒤 안내 표시가 남는 문제.
  - 고치지 않음: 메모 글자마다 쓰기(쓰기 한도 효율. 지난 동작 그대로라 제안으로), 장 본문을 다시 쓰는 동안 다른 화면의 읽기 실패와 장 본문 변경 알림 없음(같은 책 id로 본문만 바꾸는 경로가 드물다. 제안으로), 영상마다 생기는 위치 못 찾은 메모 목록 문서(읽기 효율. 제안으로).
- 보안 리뷰(general-purpose 서브에이전트가 `/security-review` 실행), 대상 `main...a5ce1ff`: 확신도 8 이상 없음. 낮은 등급으로 뺀 nonce 미검사는 위에서 고쳤다. 포트 발신자 검사, 넷플릭스 페이지로 가는 데이터, 규칙의 uid 일치, E2E 코드 분리, XSS, 비밀 값, 로그를 확인했다.
- 고친 커밋 `552c300`은 메인이 같은 관점으로 diff를 다시 읽어 새 결함이 없음을 확인했고, 결과 대조 2차에 맡겼다.

## 재량으로 정한 것

- Firebase는 서비스 워커에서만 돈다. 확장 화면·content script는 포트(`nf-study-ext`, `nf-study-netflix`)로 부탁한다. Firestore 인스턴스가 하나라 로그아웃 때 캐시 지우기가 다른 탭에 막히지 않고 로그인 상태를 나눌 필요가 없다.
- Firestore 구조: 작은 데이터는 `users/{uid}/kv/{문서}`의 맵 필드 `e`에 묶고(메모 32개·학습 완료 8개·체크리스트 16개 문서로 나눔), 장 본문은 `users/{uid}/ch`에 30만 자 조각으로 둔다. 서비스 워커가 kv를 한 번 구독하고 본문은 열 때만 읽는다(4.2-7).
- 20MB 계산은 문서 이름·필드·값 크기에 문서 id 색인 몫을 더해 실제보다 작게 세지 않는다.
- 넷플릭스 설정은 300ms 묶어 저장하고, 다른 기기에서 바뀐 설정은 다음에 열 때 적용한다.
- 로그인·탈퇴 요청은 10분까지 기다리고, ID 토큰의 nonce를 확인한다.
- 설정 주입: `firebase.config.local.json`(또는 `NF_FIREBASE_CONFIG`). 선택 필드 `oauthClientId`, `siteUrl`로 다른 프로젝트 값을 쓸 수 있다.
- 확인 대화상자는 기본 `dialog`(`showModal`)를 쓴다(포커스 가두기·Esc를 브라우저가 맡음).
- E2E 도구는 `~/.cache/design-tools`의 Playwright, 명령은 `npm run test:e2e`.

## 보류한 것과 풀 방법

없음.

## 쓴 비용

없음(Firebase Spark 무료 요금제).

## 제안

- 장 본문 변경도 알림으로 내보내고, 다시 쓰는 동안의 읽기는 이전 판을 끝까지 읽게 하기.
- 넷플릭스 기록 종류(설정·체크리스트·페이지당 대사 수·공부한 영상)를 표 하나로 다뤄 브리지·이벤트·백업·문서 배치를 한곳에서 정하기.
- 넷플릭스 화면 세 곳(메모, 체크리스트, 대시보드)의 읽기·다시 읽기·쓰기 순번 처리를 공용 훅 하나로 모으기.
- 대시보드가 영상마다 체크리스트를 따로 읽지 않게 목록과 함께 받기(서비스 워커 메모리에서 답하므로 Firestore 읽기는 늘지 않는다).
- 확장 화면 클라이언트의 데이터 사본(mirror)을 없애고 다시 붙을 때는 "모두 다시 읽기" 신호만 보내기.

## 놓친 점

- [프로세스] Firestore 에뮬레이터는 문서 1MiB 한도를 막지 않는다. 문서 크기 결함은 테스트에서 `docSize`로 직접 재야 드러났다.
- [프로세스] DEVELOPMENT 문서에 `check:build`가 찾는 문자열(`client_secret`)을 설명으로 적으니 비밀 값 검사가 실패했다. 검사 예외는 `docs/`뿐이라 문구를 바꿨다.
- [명세서] 4.8-5: 브랜딩 저장에 "개발자 연락처 이메일"이 필수였다. 명세서에 없어 프로젝트 소유 계정 `hunt24333@gmail.com`을 넣었다(Google에만 보이는 값).
- [프로세스] Claude in Chrome에서 좌표 클릭 뒤 입력이 입력칸 밖으로 가 콘솔 단축키가 눌려 다른 화면으로 넘어갔다(저장 전이라 바뀐 것 없음). 요소 참조(ref)로 다시 했다.
- [프로세스] `test:e2e`도 에뮬레이터를 띄우므로 Java가 PATH에 있어야 한다(`PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH`). 처음엔 빠뜨려 "Unable to locate a Java Runtime"으로 실패했다.
- [프로세스] `7cbfc39`의 CI에서 기존 에뮬레이터 테스트 "passes a write that ends just under the limit…"가 한 번 실패했다(메모를 지운 뒤 다시 쓴 메모를 바로 읽으니 없음). 로컬 5회와 CI 재실행은 통과했다. 쓰기가 끝난 직후 구독 사본이 아직 바뀌지 않는 드문 순서로 보이며, 원인을 확정하지 못해 고치지 않았다(제안: 쓰기가 끝나면 사본에 바로 반영하기).
