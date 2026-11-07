// 공통 저장소의 키 이름. 메모는 메모마다 키 하나라서 두 탭이 서로 다른 메모를 저장해도 덮어쓰지 않는다.
export const KEY = {
  memo: (id: string) => `memo:${id}`,
  book: (id: string) => `book:${id}`,
  chapter: (bookId: string, chapterId: string) => `bookch:${bookId}:${chapterId}`,
  position: (bookId: string) => `pos:${bookId}`,
  readerSettings: 'reader:settings',
  legacyMigration: 'meta:legacyMigration',
} as const;

export const PREFIX = {
  memo: 'memo:',
  book: 'book:',
  chapter: 'bookch:',
  position: 'pos:',
} as const;

export const isMemoKey = (key: string) => key.startsWith(PREFIX.memo);
