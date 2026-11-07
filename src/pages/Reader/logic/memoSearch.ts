// 모아 보기 화면의 검색·거르기.
import { Memo } from '../../../shared/memo/types';

export type SourceFilter =
  | { kind: 'all' }
  | { kind: 'netflix' }
  | { kind: 'book' }
  | { kind: 'video'; videoId: string }
  | { kind: 'bookId'; bookId: string };

export interface FilterOptions {
  query: string;
  source: SourceFilter;
  onlyWithNote: boolean;
  sourceTitle: (m: Memo) => string;
}

function matchesSource(m: Memo, source: SourceFilter): boolean {
  switch (source.kind) {
    case 'all':
      return true;
    case 'netflix':
    case 'book':
      return m.kind === source.kind;
    case 'video':
      return m.kind === 'netflix' && m.sourceId === source.videoId;
    case 'bookId':
      return m.kind === 'book' && m.sourceId === source.bookId;
  }
}

export function filterMemos(memos: Memo[], opts: FilterOptions): Memo[] {
  const q = opts.query.trim().toLowerCase();
  return memos
    .filter((m) => matchesSource(m, opts.source))
    .filter((m) => !opts.onlyWithNote || m.note.trim() !== '')
    .filter(
      (m) =>
        q === '' ||
        [m.quote, m.note, m.contextText, opts.sourceTitle(m)].some((f) =>
          f.toLowerCase().includes(q)
        )
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// 긴 문단은 고른 글 앞뒤 radius 글자만 남기고, 잘린 쪽에 '…'를 붙인다.
export function excerptAround(
  text: string,
  start: number,
  end: number,
  radius = 80
): string {
  if (text.length <= end - start + radius * 2) return text;
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${
    to < text.length ? '…' : ''
  }`;
}
