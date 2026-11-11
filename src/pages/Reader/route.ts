// 화면 주소(#/...)와 화면을 잇는다. 확장 프로그램 페이지 하나에서 해시로 화면을 바꾼다.
export type Route =
  | { name: 'books' }
  | { name: 'import' }
  | { name: 'book'; bookId: string; chapterId?: string; memoId?: string }
  // 책 편집 화면(책 정보와 장 목록)
  | { name: 'edit'; bookId: string }
  // 장 본문 편집 창. from은 저장하거나 취소한 뒤 돌아갈 곳이다.
  | { name: 'editChapter'; bookId: string; chapterId: string; from: 'reader' | 'book' }
  | { name: 'memos' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'memos') return { name: 'memos' };
  if (parts[0] === 'import') return { name: 'import' };
  if (parts[0] === 'book' && parts[1] && parts[2] === 'edit') {
    const bookId = decodeURIComponent(parts[1]);
    if (parts[3]) {
      return {
        name: 'editChapter',
        bookId,
        chapterId: decodeURIComponent(parts[3]),
        from: params.get('from') === 'reader' ? 'reader' : 'book',
      };
    }
    return { name: 'edit', bookId };
  }
  if (parts[0] === 'book' && parts[1]) {
    return {
      name: 'book',
      bookId: decodeURIComponent(parts[1]),
      chapterId: params.get('chapter') ?? undefined,
      memoId: params.get('memo') ?? undefined,
    };
  }
  return { name: 'books' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'books':
      return '#/';
    case 'import':
      return '#/import';
    case 'memos':
      return '#/memos';
    case 'edit':
      return `#/book/${encodeURIComponent(route.bookId)}/edit`;
    case 'editChapter':
      return `#/book/${encodeURIComponent(route.bookId)}/edit/${encodeURIComponent(route.chapterId)}${
        route.from === 'reader' ? '?from=reader' : ''
      }`;
    case 'book': {
      const params = new URLSearchParams();
      if (route.chapterId) params.set('chapter', route.chapterId);
      if (route.memoId) params.set('memo', route.memoId);
      const query = params.toString();
      return `#/book/${encodeURIComponent(route.bookId)}${query ? `?${query}` : ''}`;
    }
  }
}
