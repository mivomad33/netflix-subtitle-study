# 진행 기록

명세서: [spec.md](spec.md). 작업 브랜치 `firebase-sync`.

## 시작 전 점검(2026-11-09)

- 미확정 표시 없음. 준비물: Java 21(`/opt/homebrew/opt/openjdk@21/bin`), Firebase CLI(개발 패키지로 설치), `gh`는 `mivomad33`으로 로그인됨, Chrome(Claude in Chrome)에 `hunt24333` 로그인 확인(명세서 준비 때 2026-11-09).
- 기술 확인(시험 번들): MV3 서비스 워커에서 `firebase/auth/web-extension` + Firestore(`useFetchStreams: true`, IndexedDB 캐시)로 에뮬레이터에 로그인·쓰기·읽기, 다른 클라이언트의 변경 수신(약 0.6초)이 된다. 서비스 워커에는 `XMLHttpRequest`가 없어 `useFetchStreams`가 필요하다.

## 요구사항 체크리스트

상태: 대기 / 진행 / 만족 / 사용자 확인 / 보류

| 항목 | 상태 | 확인 근거 |
|---|---|---|
| 4.1-1 로그인 버튼·창·이메일 표시 | 사용자 확인 | 단위 `AuthGate.test.tsx` 4.1-1(가짜 로그인 → 이메일 표시). 실제 Google 로그인은 사용자 확인. 기능 끄면 실패 확인(AuthGate가 늘 안을 그리게 바꿔 15개 실패) |
| 4.1-2 로그아웃 상태 안내·넷플릭스 기본 동작 | 대기 | |
| 4.1-3 로그인 유지·만료 시 안내 | 대기 | |
| 4.1-4 로그아웃 시 캐시 지우기(E2E) | 대기 | |
| 4.1-5 로그인 취소 안내 | 만족 | 단위 `AuthGate.test.tsx` 4.1-5 |
| 4.2-1 모든 데이터 Firestore | 대기 | |
| 4.2-2 기존 기능 유지 | 대기 | |
| 4.2-3 10초 안에 반영(통합·단위·E2E) | 대기 | |
| 4.2-4 큰 본문 | 만족 | 통합 `firestoreArea.emulator.test.ts` 4.2-4(1.5MiB 넘는 한국어 장, 조각 정리) |
| 4.2-5 성능 기준 | 대기 | |
| 4.2-6 저장 실패 안내 | 대기 | |
| 4.2-7 읽기 수 | 진행 | 통합 4.2-7(메모 2000·장 30개 시드에서 kv 문서 35개 이하, 장 하나 열 때 그 장 조각만 읽음). 하루 예상 계산은 아래 |
| 4.3-1 브리지 허용 범위 | 만족 | 단위 `handler.test.ts` 4.3-1, `server.test.ts` 4.3-1(넷플릭스 포트는 area.*·auth.*·account.* 거부) |
| 4.3-2 로그인 여부만, 오류 코드만 | 만족 | 단위 `handler.test.ts` 4.3-2, `server.test.ts` 4.3-2(이메일 없음), `storeBridge.test.ts` 4.3-2 |
| 4.3-3 형식·크기 검사 | 만족 | 단위 `handler.test.ts` 4.3-3 |
| 4.3-4 content 번들에 Firebase 없음 | 진행 | `check-build.test.ts` 4.3-4(표지 넣은 content 번들 실패). 실제 빌드 검사 남음 |
| 4.4-1 20MB 상한·사용량 | 만족 | 통합 4.4-1(상한 아래 통과·넘으면 거부·지운 뒤 다시 씀), 단위 `AuthGate.test.tsx` 4.4-1(사용량 n MB / 20 MB, 가득 참) |
| 4.4-2 무료 한도 초과 안내 | 만족 | 단위 `AuthGate.test.tsx` storage error notices(resource-exhausted만 태평양 시간 문구, 다시 시도로 다시 읽음) |
| 4.4-3 오류 종류별 안내 | 만족 | 단위 같은 곳(종류별 다른 문구, uid 든 원래 문구가 안 보임) |
| 4.4-4 대기 표시 | 만족 | 단위 `AuthGate.test.tsx` 4.4-4 |
| 4.5-1 규칙 uid 분리 | 만족 | 통합 `rules.emulator.test.ts`. 규칙을 모두 허용으로 바꾸면 거부·상한 테스트 9개 실패 확인 뒤 되돌림 |
| 4.5-2 규칙 크기 상한 | 만족 | 통합 `rules.emulator.test.ts`(상한 바로 아래 통과, 넘으면 거부) |
| 4.5-3 배포 규칙 일치 | 만족 | 2026-11-09 `firebase deploy --only hosting,firestore:rules,firestore:indexes` 뒤 `firebase deploy --only firestore:rules` 다시 실행 → `latest version of firestore.rules already up to date, skipping upload...` |
| 4.6-1 탈퇴 | 만족 | 통합 `account.emulator.test.ts` 4.6-1(A 문서 0, A Auth 없음, B 그대로), 단위 `AuthGate.test.tsx` 4.6-1(확인 단계 전에는 지우지 않음, 백업 권함) |
| 4.6-2 탈퇴 재인증·이어 하기 | 만족 | 통합 `account.emulator.test.ts` 4.6-2(중간 실패 뒤 다시 실행, 최근 로그인 필요 시 재인증 후 그사이 쓴 것도 지움) |
| 4.7-1 chrome.storage.local 지우기 | 만족 | 단위 `localCleanup.test.ts` |
| 4.7-2 넷플릭스 localStorage 지우기 | 대기 | |
| 4.7-3 legacyMigration 없애기 | 대기 | |
| 4.8-1 백업 내보내기 | 만족 | 통합 `backup.emulator.test.ts` 4.8-1, 단위 `backup.test.ts` 형식 2 |
| 4.8-2 백업 가져오기 | 만족 | 통합 `backup.emulator.test.ts` 4.8-2(버전 1 파일, 새 쪽 남김, 상한 초과 시 하나도 안 씀), 단위 `backup.test.ts` |
| 4.8-3 공개 페이지 | 만족 | Hosting 배포(배포 폴더 `site/`: `index.html`, `privacy/index.html`, `copyright/index.html` 3개뿐). `curl` 두 페이지 200, 연락처·서울 지역·uid·IP·보관 기간·탈퇴·백업·시행일·신고 처리 문구 확인 |
| 4.8-4 방침 링크 | 진행 | 단위 `AuthGate.test.tsx` 4.8-4(로그인 화면), 4.6-1(탈퇴 확인). README 남음 |
| 4.8-5 OAuth 브랜딩 | 만족(로그인은 사용자 확인) | 2026-11-09 Claude in Chrome(hunt24333)으로 Google Auth Platform 브랜딩에 홈페이지 `https://nf-subtitle-study-21cae.web.app/`, 개인정보처리방침 `.../privacy/`, 승인된 도메인 `nf-subtitle-study-21cae.web.app`을 넣고 저장(저장하려면 필수인 개발자 연락처에 `hunt24333@gmail.com`도 넣음). 다시 열어 값이 남은 것 확인. Audience의 게시 상태 "In production", 사용자 유형 External. 브랜드 검증 상태: "Your branding needs to be verified before it can be shown to users."(검증은 신청 안 함, 2장 결정). 잘라 낸 스크린샷 [oauth-branding.png](oauth-branding.png) |
| 4.9-1 화면(design-check) | 대기 | |
| 4.10-1 권한 | 진행 | `manifest.json`에 identity, `check-build.test.ts`(identity 더한 4개 권한이면 실패) |
| 4.10-2 외부 연결 대상 | 진행 | `check-build.test.ts` 4.10-2(evil.test 호출 실패, 넷플릭스 링크만 있는 번들 통과). 실제 빌드 검사 남음 |
| 4.10-3 비밀 값·무시 파일 | 진행 | `check-build.test.ts` 4.10-3. `git check-ignore` 확인함(설정 파일, 로그) |
| 4.10-4 로그에 개인정보 없음 | 대기 | |
| 4.10-5 설정 주입 | 대기 | |
| 4.11-1 에뮬레이터 테스트 한 명령 | 만족 | `npm run test:emulator` 38개 통과. `rules.emulator.test.ts`가 프로젝트 id가 demo-로 시작하는지 검사 |
| 4.11-2 CI | 대기 | |
| 4.11-3 개발 화면·표시 검사 | 대기 | |
| 4.12-1 README·DEVELOPMENT | 대기 | |
| 4.12-2 design.md | 대기 | |
| 완료: 전체 검사 통과 | 대기 | |
| 완료: 마지막 커밋 CI 성공 | 대기 | |
| 완료: 규칙 배포·Hosting·OAuth | 대기 | |
| 완료: 실제 확장 프로그램 로그인 전 화면 | 대기 | |

## 작업 계획

1. Firebase 기반: 설정 주입(webpack), `firebase.json`·`.firebaserc`·규칙·색인, 에뮬레이터 테스트 명령, 규칙 테스트.
2. Firestore 저장소(`StorageArea` 구현): 키 → 문서 묶음 대응, 거울(스냅샷 구독), 본문 조각, 사용량·상한. 통합 테스트(기존 저장소 테스트와 같은 경우).
3. 서비스 워커 백엔드: 로그인(launchWebAuthFlow), 포트 RPC(확장 화면 전체 / 넷플릭스는 허용 작업만), 변경 알림, 옛 로컬 데이터 지우기. 확장 화면용 원격 저장소·로그인 클라이언트와 로그인 화면.
4. 넷플릭스 쪽: 학습 기록·설정을 브리지로, 로그아웃 상태 기본 동작과 안내, localStorage 지우기, legacyMigration 제거.
5. 탈퇴, 백업 v2, 사용량·오류 안내.
6. `check:build`, CI, 공개 페이지·Hosting 배포, 규칙 배포, OAuth 브랜딩, 문서.
7. E2E(로그아웃 캐시, 서비스 워커 멈춘 뒤 반영, 로그인 전 화면), 성능, 마지막 검증.

## 재량 결정

- Firebase(Auth·Firestore)는 서비스 워커 한곳에서만 돈다. 확장 화면과 content script는 `chrome.runtime` 포트로 서비스 워커에 부탁한다. 이유: Firestore 인스턴스가 하나라 로그아웃 때 `terminate` 뒤 `clearIndexedDbPersistence`가 다른 탭에 막히지 않고(4.1-4), 로그인 상태를 나눌 필요가 없다. 넷플릭스 포트는 넷플릭스 작업만 받도록 서비스 워커가 검사한다.
- Firestore 구조: `users/{uid}/kv/{문서}`에 작은 데이터를 묶어 두고(필드 `e`), 본문은 `users/{uid}/ch/{책}~{장}~{n}` 조각(필드 `t`)으로 둔다. 메모는 id 해시로 32개 문서에 나눈다. 서비스 워커가 `kv` 전체를 한 번 구독해 거울을 두고, 본문은 열 때만 읽는다(4.2-7).

## 보류

없음.

## 놓친 점

- [명세서] 4.8-5: 브랜딩 저장에 "개발자 연락처 이메일"이 필수였다. 명세서에 없어 프로젝트 소유 계정 `hunt24333@gmail.com`을 넣었다(Google에만 보이는 값).
- [프로세스] Claude in Chrome에서 좌표 클릭 뒤 입력이 입력칸 밖으로 가 콘솔 단축키가 눌려 다른 화면으로 넘어갔다(저장 전이라 바뀐 것 없음). 요소 참조(ref)로 다시 했다.

