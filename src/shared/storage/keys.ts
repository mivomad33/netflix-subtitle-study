// 공통 저장소의 키 이름. 메모는 메모마다 키 하나라서 두 탭이 서로 다른 메모를 저장해도 덮어쓰지 않는다.
export const PREFIX = {
  memo: 'memo:',
  book: 'book:',
  chapter: 'bookch:',
  position: 'pos:',
} as const;

// 한 책의 장 본문 키가 모두 이것으로 시작한다.
export const chapterKeyPrefix = (bookId: string) => `${PREFIX.chapter}${bookId}:`;

export const KEY = {
  memo: (id: string) => `${PREFIX.memo}${id}`,
  book: (id: string) => `${PREFIX.book}${id}`,
  chapter: (bookId: string, chapterId: string) => `${chapterKeyPrefix(bookId)}${chapterId}`,
  position: (bookId: string) => `${PREFIX.position}${bookId}`,
  readerSettings: 'reader:settings',
  legacyMigration: 'meta:legacyMigration',
  // 학습 패널이 그 영상의 대사에서 찾지 못한 넷플릭스 메모 id 목록. 패널을 열 때마다 다시 쓰므로 백업에 넣지 않는다.
  netflixUnplaced: (videoId: string) => `meta:netflixUnplaced:${videoId}`,
} as const;

export const isMemoKey = (key: string) => key.startsWith(PREFIX.memo);
