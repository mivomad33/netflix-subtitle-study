// 공통 저장소의 키 이름. 메모는 메모마다 키 하나라서 두 탭이 서로 다른 메모를 저장해도 덮어쓰지 않는다.
export const PREFIX = {
  memo: 'memo:',
  book: 'book:',
  chapter: 'bookch:',
  position: 'pos:',
  completion: 'done:',
} as const;

// 한 책의 장 본문 키가 모두 이것으로 시작한다.
export const chapterKeyPrefix = (bookId: string) => `${PREFIX.chapter}${bookId}:`;

// 한 책의 학습 완료 키가 모두 이것으로 시작한다.
export const completionKeyPrefix = (bookId: string) => `${PREFIX.completion}${bookId}:`;

export const KEY = {
  memo: (id: string) => `${PREFIX.memo}${id}`,
  book: (id: string) => `${PREFIX.book}${id}`,
  chapter: (bookId: string, chapterId: string) => `${chapterKeyPrefix(bookId)}${chapterId}`,
  position: (bookId: string) => `${PREFIX.position}${bookId}`,
  // 장마다 키 하나라서 두 탭이 서로 다른 장의 완료를 바꿔도 덮어쓰지 않는다.
  completion: (bookId: string, chapterId: string) => `${completionKeyPrefix(bookId)}${chapterId}`,
  readerSettings: 'reader:settings',
  // 학습 패널이 그 영상의 대사에서 찾지 못한 넷플릭스 메모 id 목록. 패널을 열 때마다 다시 쓰므로 백업에 넣지 않는다.
  netflixUnplaced: (videoId: string) => `meta:netflixUnplaced:${videoId}`,
} as const;

export const isMemoKey = (key: string) => key.startsWith(PREFIX.memo);

// 넷플릭스 학습 기록. 예전에는 넷플릭스 사이트 localStorage(NF_ 키)에 있었다.
export const NETFLIX_KEY = {
  settings: 'nf:settings',
  checklist: (videoId: string) => `nf:checklist:${videoId}`,
  itemsPerPage: (videoId: string) => `nf:itemsPerPage:${videoId}`,
  // 공부한 영상 목록. 영상마다 키 하나라서 두 탭이 서로 다른 영상을 기록해도 덮어쓰지 않는다.
  studied: (videoId: string) => `nf:studied:${videoId}`,
} as const;

export const NETFLIX_PREFIX = {
  checklist: 'nf:checklist:',
  itemsPerPage: 'nf:itemsPerPage:',
  studied: 'nf:studied:',
} as const;

export const UNPLACED_PREFIX = 'meta:netflixUnplaced:';
