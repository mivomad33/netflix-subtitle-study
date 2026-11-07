**한국어** | [English](DEVELOPMENT.en.md)

# 개발 문서

[README로 돌아가기](README.md)

## 개발 서버

```bash
npm install
npm start
```

Webpack Dev Server가 시작되어 변경 사항이 `build` 폴더에 실시간으로 반영됩니다. Chrome의 `chrome://extensions/`에서 `build` 폴더를 로드하면 됩니다.

## 빌드

```bash
npm run build
```

`build` 폴더에 결과물을 만들고, `zip` 폴더에 배포용 압축 파일을 만듭니다.

## 검사와 테스트

```bash
npm run typecheck
npm run lint
npm run test:run
```

파일을 고칠 때마다 테스트를 다시 돌리려면 `npm test`를 씁니다.

## 저장 데이터 구조

학습 데이터는 넷플릭스 페이지의 `localStorage`에 저장합니다. 키 이름은 [storageKeys.ts](src/pages/Content/constants/storageKeys.ts)에 모여 있습니다.

- `NF_studied_videos`: 학습한 영상의 메타데이터(ID, 제목, 커버 이미지, 총 페이지 수, 업데이트 시간 등)
- `NF_checklist_{videoId}`: 영상의 회차별, 페이지별 5단계 체크리스트
- `NF_annotations_{videoId}`: 영상의 하이라이트와 메모. 문장 시작 시간, 문장 원문, 문장 안의 위치, 고른 글을 함께 저장해 자막 정렬이 바뀌어도 원문이 같은 문장에만 다시 붙입니다. 학습 기록 초기화나 페이지당 대사 수 변경으로 지우지 않습니다.
- `NF_itemsPerPage_{videoId}`: 영상의 페이지당 대사 수
- `NF_isEnglishVisible`, `NF_isKoreanVisible`: 자막 표시 설정
- `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`: 재생 설정
- `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_studyPanelWidthRatio`, `NF_fontSize`: 화면 설정
- `NF_lingoActive`, `NF_preferredTextLocale`: 자막 처리에 쓰는 값

## 주요 파일

- 자막 가로채기와 정렬: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- 학습 패널: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- 하이라이트와 메모: [SentenceList.tsx](src/pages/Content/components/SentenceList.tsx), [AnnotationEditor.tsx](src/pages/Content/components/AnnotationEditor.tsx), [useAnnotations.ts](src/pages/Content/hooks/useAnnotations.ts), [annotationHelper.ts](src/pages/Content/utils/annotationHelper.ts)
- 체크리스트: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- 대시보드: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- 영상 위 자막: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)
