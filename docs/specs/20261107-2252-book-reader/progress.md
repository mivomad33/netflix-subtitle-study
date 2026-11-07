# 진행 기록

명세서: [spec.md](spec.md) · 작업 브랜치: `book-reader` (로컬 main `6023f16`에서 만듦)

## 시작 전 점검

- 미확정 표시 없음. 준비물: `gh` 로그인(repo, workflow 범위), Node v24.22.0, 디자인 도구 `shoot.mjs --check` 통과(2026-11-07).
- 명세서 검토(`review-spec`)는 사용자 결정으로 건너뛰었다.

## 작업 계획

1. 공통 모델·저장소 계층(`src/shared`): 메모 모양, 저장소 접근(chrome.storage.local / 메모리 대체), 메모·책·읽기 위치 저장 함수
2. 넷플릭스 쪽 연결: ContentLoader 메시지 처리기(검증 포함), 페이지 쪽 클라이언트, 이전(migration), `useAnnotations` 비동기화, 영상 제목 저장, manifest 권한·key
3. 하이라이트·메모 화면 부품을 넷플릭스·원서 공용으로 분리(선택 처리, 도구막대, 메모 영역, CSS)
4. 본문 정리·장 나누기 유틸
5. 확장 프로그램 화면(`reader.html`): 책 목록·등록·리더·모아 보기·백업, 팝업, 대시보드 링크, background 탭 열기
6. 개발 서버용 화면(`reader-dev.html`, 개발 빌드에만)과 시드 데이터
7. 검사 스크립트(빌드 결과·공개 저장소), CI, `.nvmrc`
8. 성능 측정, 문서(README·DEVELOPMENT 두 언어)
9. 자기 점검 스크린샷, 마지막 검증

## 요구사항 체크리스트

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 4.1-1 | 만족 | `repo.test.ts` "stores netflix and book memos with all fields", `StudyPanel.test.tsx` "saves new memos with the video title". 구현 전에 테스트를 먼저 써 실패를 봤다 |
| 4.1-2 | 만족 | `check-build.mjs` `checkManifest`와 `check-build.test.ts`(권한 하나를 더한 manifest에서 실패), 빌드된 manifest 직접 확인 |
| 4.1-3 | 만족 | `legacyMigration.test.ts`(복사·제목, 재실행 중복 없음, 깨진 키, 저장 오류 뒤 재시도), `StudyPanel.test.tsx` "copies legacy memos ... leaves the original untouched" |
| 4.1-4 | 만족 | `handler.test.ts` "refuses to touch book memos, book text, or other keys", "ignores malformed messages", "records and clears ..."; `storeBridge.test.ts` 다른 창·다른 출처 무시(검사를 빼고 실패를 봤다) |
| 4.1-5 | 만족 | 원서: `App.test.tsx` "4.5-7 4.1-5 ...". 넷플릭스: `StudyPanel.test.tsx` "4.5-7 records which stored memos match no subtitle line ..."(그려지지 않고 저장소에 남음, 기능 없이 실패 확인), `SentenceList.test.tsx` |
| 4.1-6 | 만족 | `BookReader.test.tsx` "4.1-6 ...", `repo.test.ts` "keeps both memos ..." |
| 4.1-7 | 만족 | `check-build` key·`.pem` 검사, ID `flhkacfjjpipfoicbnmednajnhebihmb`(result-auditor가 key로 다시 계산해 일치 확인) |
| 4.2-1 | 만족 | 기존 `SentenceList.test.tsx`·`StudyPanel.test.tsx` 기대 동작 그대로(필드 이름만 공통 메모 모양으로 바꿈), "keeps a memo made before stored memos finish loading"(병합을 깨면 실패 확인) |
| 4.2-2 | 만족 | 메모와 무관한 테스트는 바꾸지 않고 전체 통과(257개). 지운 테스트는 localStorage 메모 저장·불러오기뿐 |
| 4.2-3 | 만족 | `StudyPanel.test.tsx` "keeps memos after resetting progress or changing lines per page", `StudyDashboardModal.test.tsx` "keeps the video memos ..." |
| 4.3-1 | 만족 | `BookImport.test.tsx` "4.3-1 ..." |
| 4.3-2 | 만족 | `bookText.test.ts` 규칙별·닮은 입력·정리 끄기, `BookImport.test.tsx` "4.3-2" |
| 4.3-3 | 만족 | `bookText.test.ts` `isChapterHeading` 참·거짓 표, `detectChapterStarts`, `splitIntoChapters` |
| 4.3-4 | 만족 | `BookImport.test.tsx` "4.3-4 ...", 머리말 장은 `bookText.test.ts` |
| 4.3-5 | 만족 | `scripts/perf/measure.mjs`: 200만 자 미리 보기 56ms, 대기 표시 확인(`sawBusy: true`), ca93cf6 기준 |
| 4.3-6 | 만족 | `BookList.test.tsx` 취소·확인 두 테스트 |
| 4.4-1 | 만족 | `BookReader.test.tsx` "4.4-1" |
| 4.4-2 | 만족 | `BookReader.test.tsx` "4.4-2" 7개(도구막대, 6줄 이상과 인용, 겹침, has-note, 지울 때 확인, Esc, 두 문단 선택) |
| 4.4-3 | 만족 | `bookMemos.test.ts` "draws only memos whose chapter, paragraph, source text and quote still match" |
| 4.4-4 | 만족 | `BookReader.test.tsx` "4.4-4" 2개 |
| 4.4-5 | 만족 | `BookReader.test.tsx` "4.4-5" |
| 4.4-6 | 만족 | `BookReader.test.tsx` "4.4-6"(scrollIntoView 대상, 목록의 "2/3장") |
| 4.4-7 | 만족 | `BookReader.test.tsx` "4.4-7" |
| 4.5-1 | 만족 | `MemoCollection.test.tsx` "4.5-1 ..." |
| 4.5-2 | 만족 | `memoSearch.test.ts`, `MemoCollection.test.tsx` "4.5-2 ..." |
| 4.5-3 | 만족 | `memoSearch.test.ts` "applies each source filter", "combines ..." |
| 4.5-4 | 만족 | `MemoCollection.test.tsx` "4.5-4" 2개 |
| 4.5-5 | 만족 | `App.test.tsx` "4.5-5" |
| 4.5-6 | 사용자 확인 | 주소는 `netflixUrl.test.ts`, `MemoCollection.test.tsx` "4.5-6"으로 확인. 그 시각부터 재생되는지는 사용자 확인(5장 4번) |
| 4.5-7 | 만족 | 원서: `App.test.tsx` "4.5-7 4.1-5 ...". 넷플릭스: `MemoCollection.test.tsx` "4.5-7 학습 패널이 대사를 찾지 못했다고 남긴 ..."(표시와 영상 처음 열기, 기능 없이 실패 확인) |
| 4.6-1 | 만족 | `backup.test.ts` 내용·버전, 파일 이름 날짜 |
| 4.6-2 | 만족 | `backup.test.ts` mergeBackup 4개, `BackupControls.test.tsx` 확인창·취소 |
| 4.6-3 | 만족 | `backup.test.ts` 형식 오류 `it.each`(저장소 그대로, 정상 파일 통과) |
| 4.6-4 | design-check 대기 | 내보내기·가져오기는 머리말 오른쪽(`App.tsx` BackupControls). 자기 점검 스크린샷 `shots/books-1280.png`. 과제 수행은 `design-check` |
| 4.7-1 | 만족 | `Popup.test.tsx`(`chrome.tabs.create`가 `reader.html#/`, `#/memos`로 불림) |
| 4.7-2 | 사용자 확인 | `StudyDashboardModal.test.tsx` "opens the memo collection and the book reader ..."(열기 요청 확인). 실제 넷플릭스 화면은 사용자 확인(5장 5번) |
| 4.7-3 | 만족 | `check-build`: `chrome_url_overrides` 없음 |
| 4.8-1 | design-check 대기 | `docs/design.md` 토큰을 `Reader.css`·`annotations.css`에 한곳에 둠. 자기 점검 스크린샷·axe 위반 없음 |
| 4.8-2 | design-check 대기 | 자기 점검으로 1024·1280·1440 폭을 찍음(가로 스크롤·잘린 글 관문 통과). 전체 화면×상태×폭은 `design-check` |
| 4.8-3 | design-check 대기 | Esc로 메모 영역 닫기 테스트(`BookReader.test.tsx` "4.4-2"). 나머지 키보드 흐름은 `design-check` |
| 4.8-4 | 만족(빈 상태 화면은 design-check 대기) | 저장 실패: `BookReader.test.tsx` "4.8-4" 2개. 빈 상태 문구는 `BookList.tsx`, `BookReader.tsx`, `MemoCollection.tsx` |
| 4.9-1 | 만족 | 테스트·시드 글은 모두 직접 쓴 문장(재량 결정 참고). `check-build` `checkTrackedFiles`(`.pem`, 백업 JSON 없음) |
| 4.9-2 | 만족 | `check-build` 외부 로드·fetch·XHR·WebSocket 검사, "flags an external script in reader.html" 테스트 |
| 4.10-1 | 만족 | `.github/workflows/ci.yml`, `.nvmrc`(24). CI 성공: 0342b49, ca93cf6 |
| 4.10-2 | 만족(design-check 실행은 대기) | `reader-dev.html`(개발 빌드에만), `?seed=demo|perf`, `window.nfStudyDev`. `check-build`가 `NF_STUDY_DEV_STORAGE_SHIM` 없음을 확인 |
| 4.10-3 | 만족 | `node scripts/perf/measure.mjs`(ca93cf6, 개발 서버): 미리 보기 56ms(한도 3000), 장 열기 49.5ms(1000), 검색 22ms(500). jsdom 시간 측정 테스트는 없앰(ca93cf6) |
| 4.10-4 | 만족 | README·DEVELOPMENT 두 언어 파일, 절 구성 같음(링크 확인) |
| 완료: 로컬 검증 4종 + CI | 만족 | typecheck·lint·test(257)·build·check:build 통과, ca93cf6 CI success |
| 완료: design-check 깨끗한 회차 + 시각 회귀 | design-check 대기 | 다음 단계 `design-check`가 한다 |
| 완료: 보고서 전용 항목 | 만족 | `report.md`의 "이 명세서만의 보고 항목" |

## 재량 결정

- 저장 키: 메모마다 키 하나(`memo:{id}`), 책 `book:{id}`, 장 본문 `bookch:{bookId}:{chapterId}`(문단 배열), 읽기 위치 `pos:{bookId}`, 설정 `reader:settings`, 이전 표시 `meta:legacyMigration`. 이유: 두 탭이 서로 다른 메모를 저장해도 덮어쓰지 않고(4.1-6), 장을 열 때 그 장만 읽는다(4.10-3).
- 이전: 영상마다 복사 완료를 기록하고, 이미 복사한 영상은 다시 넣지 않는다(지운 메모가 되살아나지 않게). 실패가 하나도 없을 때만 전체 완료 표시를 남긴다.
- 메시지 다리: 넷플릭스 페이지 → content script는 `window.postMessage`, 같은 창·같은 출처·정해진 작업만 받고, 넷플릭스 메모만 쓰고 지운다(`src/shared/bridge`).
- 화면: 확장 프로그램 페이지 하나(`reader.html`)에 해시 주소 `#/`, `#/import`, `#/book/{id}`, `#/memos`. 확인 대화는 기존처럼 `window.confirm`, 고르기는 기본 `select`·`checkbox`라 직접 만든 상호작용 부품이 없다.
- 확장 프로그램 ID: `key`로 고정, ID `flhkacfjjpipfoicbnmednajnhebihmb`. 비밀 키는 스크래치 폴더에만 두었다(압축 해제 설치에는 필요 없다).
- 개발 화면: `reader-dev.html`(개발 빌드에만), 메모리 저장소를 그 페이지 localStorage에 옮겨 적는다. 표시 문자열 `NF_STUDY_DEV_STORAGE_SHIM`. `?seed=demo|perf`.
- 개발 서버 오버레이: 기존 Sass 경고가 화면을 덮어 경고는 끄고 오류만 보이게 했다(`utils/webserver.js`).
- 모아 보기는 100개씩 그리고 "더 보기"로 늘린다. 고치는 동안 순서가 바뀌지 않게 화면을 연 때의 고친 시각으로 정렬한다.
- 넷플릭스 메모의 "위치를 찾지 못함": 모아 보기에는 자막이 없으므로, 학습 패널이 영상을 열 때 어느 대사에도 붙지 않는 메모 id를 `meta:netflixUnplaced:{videoId}`에 적고 모아 보기가 그것을 읽는다(ca93cf6). 그 영상을 한 번도 열지 않았으면 표시가 없다. 이 키는 패널이 다시 쓰므로 백업에 넣지 않는다.
- 다리 요청은 content script에서 받은 순서대로 하나씩 처리한다(저장 직후 지우기가 뒤집히지 않게).
- `design-check`에 걸린 항목은 상태를 "design-check 대기"로 둔다. 구현 중에는 자기 점검(스크린샷, 객관 관문)만 했다.
- Node 24 고정(`.nvmrc`, 로컬과 같은 주 버전).
- 테스트 글 출처: 모두 직접 쓴 문장(`src/shared/storage/testFixtures.ts`, `src/pages/Reader/dev/seed.ts`, 각 테스트 파일).

## 보류

없음

## 놓친 점

- [명세서] 사용자 결정으로 `review-spec` 검토 없이 구현을 시작했다.
- [명세서] 4.5-7 "위치를 찾지 못한 메모"를 넷플릭스 메모에 대해 어떻게 판정할지 명세서가 정하지 않았다. 처음에는 판정할 방법이 없다고 보고 원서 메모만 표시했다가, result-auditor 지적으로 학습 패널이 판정해 남기는 방식으로 바꿨다(엄격한 쪽).
- [프로세스] jsdom의 `postMessage`는 `origin`과 `source`를 채우지 않아, 다리 왕복 테스트에서 브라우저처럼 채워 보내는 대체를 테스트 안에 두었다.
- [프로세스] 디자인 도구로 개발 서버를 찍을 때 webpack 오버레이가 화면을 덮었다. 찍을 때마다 새 브라우저 문맥이라 시드도 주소마다 넣어야 했다.
- [프로세스] 하위 폴더(`src/pages/Reader`)에서 vitest를 돌렸다가 `node_modules/.vite` 캐시가 커밋됐다. `.gitignore`가 루트 `node_modules`만 막고 있었다. result-auditor가 찾았다.
- [프로세스] `/security-review`는 저장소에 `origin/HEAD`가 없어 첫 명령에서 실패했고, 서브에이전트가 `git diff main...HEAD`로 대신 검토했다.
- [프로세스] 첫 구현에서 jsdom 단위 테스트에 시간 측정을 넣었다. 명세서 4.10-3 확인이 금지한 방식인데 놓쳤다.
- [명세서] 4.1-4 "메모 외의 키를 읽거나 지울 수 없다"를 새로 둔 `meta:netflixUnplaced:*` 키에도 글자 그대로 적용했다(엄격한 쪽). 키를 지우지 않고 빈 목록으로 덮어쓴다(754198b).

결과 보고서: [report.md](report.md)
