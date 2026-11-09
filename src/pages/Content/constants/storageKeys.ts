// 넷플릭스 사이트 localStorage에서 이 확장 프로그램이 쓰는 키.
// 자막 처리 값 둘만 계속 쓴다. 학습 기록이 아니라 그 브라우저의 자막 처리 상태라서다(명세서 2장).
export const STORAGE_KEYS = {
  LINGO_ACTIVE: 'NF_lingoActive',
  PREFERRED_TEXT_LOCALE: 'NF_preferredTextLocale',
} as const;

// 예전에 학습 기록을 두던 키. 지금은 로그인한 사용자의 저장소에 쓰고, 이 키들은 넷플릭스 화면이 열릴 때마다 지운다(4.7-2).
// 새 코드는 이 키를 쓰지 않으므로 지운 표시 없이 매번 지워도 결과가 같다.
export const LEGACY_STUDY_KEYS = [
  'NF_isPanelVisible',
  'NF_isOverlayVisible',
  'NF_isEnglishVisible',
  'NF_isKoreanVisible',
  'NF_isAutoPause',
  'NF_isPageEndPause',
  'NF_isAutoSkip',
  'NF_isSmartSkim',
  'NF_isSentenceLoop',
  'NF_fontSize',
  'NF_studied_videos',
  'NF_studyPanelWidthRatio',
] as const;

// 영상마다 하나씩 있던 키의 접두어. 예전 메모(NF_annotations_*)도 옮기지 않고 지운다(4.7-3).
export const LEGACY_STUDY_PREFIXES = ['NF_itemsPerPage_', 'NF_checklist_', 'NF_annotations_'] as const;
