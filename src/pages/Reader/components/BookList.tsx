import React, { useEffect, useState } from 'react';
import { BookMeta, ReadingPosition } from '../../../shared/memo/types';
import {
  deleteBook,
  doneChapterIds,
  getBookCharCounts,
  listBooks,
  listCompletions,
  listMemos,
  listPositions,
} from '../../../shared/storage/repo';
import { useReaderEnv } from '../env';
import { Route } from '../route';
import { BookProgress, bookProgress, continueLabel } from '../logic/progress';
import { ProgressBar } from './ProgressBar';

interface Row {
  book: BookMeta;
  position: ReadingPosition | null;
  memoCount: number;
  progress: BookProgress;
}

export const BookList: React.FC<{ navigate: (route: Route) => void }> = ({ navigate }) => {
  const { area } = useReaderEnv();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [{ books, counts }, positions, memos, completions] = await Promise.all([
        listBooks(area).then(async (books) => ({ books, counts: await getBookCharCounts(area, books) })),
        listPositions(area),
        listMemos(area),
        listCompletions(area),
      ]);
      const positionByBook = new Map(positions.map((p) => [p.bookId, p]));
      const memoCount = new Map<string, number>();
      memos.forEach((m) => {
        if (m.kind === 'book') memoCount.set(m.sourceId, (memoCount.get(m.sourceId) ?? 0) + 1);
      });
      setRows(
        books.map((book) => ({
          book,
          position: positionByBook.get(book.id) ?? null,
          memoCount: memoCount.get(book.id) ?? 0,
          progress: bookProgress(book, counts.get(book.id) ?? {}, doneChapterIds(completions, book.id)),
        }))
      );
    } catch (e) {
      console.error('[NF-STUDY] Failed to load books:', e);
      setError('책 목록을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const handleDelete = async (row: Row) => {
    if (
      !window.confirm(
        `「${row.book.title}」 책과 메모 ${row.memoCount}개가 지워집니다. 되돌릴 수 없습니다. 지울까요?`
      )
    ) {
      return;
    }
    try {
      await deleteBook(area, row.book.id);
      await load();
    } catch (e) {
      console.error('[NF-STUDY] Failed to delete book:', e);
      setError('책을 지우지 못했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <section className="nfr-page" aria-labelledby="book-list-title">
      <div className="nfr-page-header">
        <h1 id="book-list-title">책 목록</h1>
        <button type="button" className="nfr-btn nfr-btn-primary" onClick={() => navigate({ name: 'import' })}>
          책 등록
        </button>
      </div>
      {error && (
        <p className="nfr-error" role="alert">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="nfr-muted">불러오는 중입니다…</p>}
      {rows && rows.length === 0 && (
        <div className="nfr-empty">
          <p>아직 등록한 책이 없습니다.</p>
          <p className="nfr-muted">
            "책 등록"을 눌러 원서 본문을 붙여 넣으세요. 장 제목을 찾아 자동으로 나눠 드립니다.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="nfr-book-list">
          {rows.map((row) => (
            <li key={row.book.id} className="nfr-card nfr-book-row">
              <button
                type="button"
                className="nfr-book-open"
                onClick={() => navigate({ name: 'book', bookId: row.book.id })}
              >
                <span className="nfr-book-title">{row.book.title}</span>
                {row.book.author && <span className="nfr-muted">{row.book.author}</span>}
                <ProgressBar progress={row.progress} />
                <span className="nfr-book-meta">
                  <span>{continueLabel(row.book, row.position)}</span>
                  <span>메모 {row.memoCount}개</span>
                </span>
              </button>
              <button
                type="button"
                className="nfr-btn nfr-btn-danger"
                onClick={() => handleDelete(row)}
                aria-label={`「${row.book.title}」 지우기`}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
