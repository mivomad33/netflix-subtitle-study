import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookMeta, Memo, ReadingPosition, createId } from '../../../shared/memo/types';
import {
  deleteMemo,
  getBook,
  getChapterParagraphs,
  getPosition,
  getReaderSettings,
  listMemosBySource,
  putMemo,
  setPosition,
  setReaderSettings,
} from '../../../shared/storage/repo';
import { AnnotationEditor } from '../../../shared/ui/AnnotationEditor';
import {
  AnnotatedText,
  AnnotationToolbar,
  useAnnotationSelection,
} from '../../../shared/ui/annotationUi';
import { useReaderEnv } from '../env';
import { Route } from '../route';
import { isBookMemoAnchored, memosForParagraph } from '../logic/bookMemos';

const MIN_FONT = 10;
const MAX_FONT = 28;
const HEADER_OFFSET = 72; // 위쪽 고정 머리글 높이. 이보다 아래에 걸친 첫 문단을 읽는 위치로 본다.
const POSITION_SAVE_DELAY = 400;

interface Props {
  bookId: string;
  initialChapterId?: string;
  initialMemoId?: string;
  navigate: (route: Route) => void;
}

type ScrollTarget = { kind: 'memo'; memoId: string } | { kind: 'paragraph'; index: number } | null;

export const BookReader: React.FC<Props> = ({ bookId, initialChapterId, initialMemoId, navigate }) => {
  const { area } = useReaderEnv();
  const [book, setBook] = useState<BookMeta | null | 'missing'>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollTarget = useRef<ScrollTarget>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const memosRef = useRef<Memo[]>([]);
  memosRef.current = memos;

  // 책, 읽던 위치, 메모, 글자 크기를 불러오고 열 장을 정한다.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getBook(area, bookId),
      getPosition(area, bookId),
      listMemosBySource(area, 'book', bookId),
      getReaderSettings(area),
    ])
      .then(([loadedBook, position, loadedMemos, settings]) => {
        if (cancelled) return;
        setFontSize(settings.fontSize);
        if (!loadedBook) {
          setBook('missing');
          return;
        }
        setBook(loadedBook);
        setMemos(loadedMemos);
        const has = (id?: string) => !!id && loadedBook.chapters.some((c) => c.id === id);
        let first: string | undefined;
        if (has(initialChapterId)) {
          first = initialChapterId;
          const memo = loadedMemos.find((m) => m.id === initialMemoId && m.chapterId === first);
          scrollTarget.current = memo ? { kind: 'memo', memoId: memo.id } : null;
        } else if (position && has(position.chapterId)) {
          first = position.chapterId;
          scrollTarget.current = { kind: 'paragraph', index: position.paragraphIndex };
        } else {
          first = loadedBook.chapters[0]?.id;
        }
        setChapterId(first ?? null);
      })
      .catch((e) => {
        console.error('[NF-STUDY] Failed to load book:', e);
        if (!cancelled) setLoadError('책을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.');
      });
    return () => {
      cancelled = true;
    };
  }, [area, bookId, initialChapterId, initialMemoId]);

  // 장 본문을 불러온다.
  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;
    setParagraphs(null);
    getChapterParagraphs(area, bookId, chapterId)
      .then((loaded) => {
        if (!cancelled) setParagraphs(loaded);
      })
      .catch((e) => {
        console.error('[NF-STUDY] Failed to load chapter:', e);
        if (!cancelled) setLoadError('장을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.');
      });
    return () => {
      cancelled = true;
    };
  }, [area, bookId, chapterId]);

  // 본문이 그려지면 읽던 문단이나 고른 메모로 스크롤한다.
  useLayoutEffect(() => {
    const target = scrollTarget.current;
    const container = articleRef.current;
    if (!paragraphs || !target || !container) return;
    scrollTarget.current = null;
    if (target.kind === 'memo') {
      const mark = container.querySelector(`mark[data-memo-id="${CSS.escape(target.memoId)}"]`);
      if (mark) {
        mark.scrollIntoView({ block: 'center' });
        setEditingId(target.memoId);
      }
    } else {
      container
        .querySelector(`[data-paragraph-index="${target.index}"]`)
        ?.scrollIntoView({ block: 'start' });
    }
  }, [paragraphs]);

  const savePosition = useCallback(
    (index: number) => {
      if (!chapterId) return;
      const position: ReadingPosition = { bookId, chapterId, paragraphIndex: index, updatedAt: Date.now() };
      setPosition(area, position).catch((e) => console.error('[NF-STUDY] Failed to save position:', e));
    },
    [area, bookId, chapterId]
  );

  // 스크롤하면 화면 맨 위에 걸친 문단을 읽는 위치로 저장한다.
  useEffect(() => {
    if (!paragraphs) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const elements = articleRef.current?.querySelectorAll<HTMLElement>('[data-paragraph-index]');
        if (!elements) return;
        const visible = Array.from(elements).find((el) => el.getBoundingClientRect().bottom > HEADER_OFFSET);
        if (visible) savePosition(Number(visible.dataset.paragraphIndex));
      }, POSITION_SAVE_DELAY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timer) clearTimeout(timer);
    };
  }, [paragraphs, savePosition]);

  const openChapter = (id: string) => {
    if (id === chapterId) return;
    setEditingId(null);
    setChapterId(id);
    window.scrollTo?.({ top: 0 });
    const position: ReadingPosition = { bookId, chapterId: id, paragraphIndex: 0, updatedAt: Date.now() };
    setPosition(area, position).catch((e) => console.error('[NF-STUDY] Failed to save position:', e));
  };

  const save = useCallback(
    (memo: Memo) => {
      putMemo(area, memo)
        .then(() => setSaveFailed(false))
        .catch((e) => {
          console.error('[NF-STUDY] Failed to save memo:', e);
          setSaveFailed(true);
        });
    },
    [area]
  );

  const paragraphMemos = useCallback(
    (index: number) =>
      chapterId && paragraphs ? memosForParagraph(memos, chapterId, index, paragraphs[index]) : [],
    [chapterId, memos, paragraphs]
  );

  const resolveTarget = useCallback(
    (key: string) => {
      const index = Number(key);
      if (!paragraphs || paragraphs[index] === undefined) return null;
      return { text: paragraphs[index], memos: paragraphMemos(index) };
    },
    [paragraphMemos, paragraphs]
  );

  const { pending, handleMouseUp, clearPending } = useAnnotationSelection({
    containerRef: articleRef,
    resolveTarget,
    onOpenMemo: setEditingId,
    resetKey: chapterId,
  });

  const createFromPending = (openEditor: boolean) => {
    if (!pending || !paragraphs || !chapterId) return;
    const index = Number(pending.key);
    const text = paragraphs[index];
    const now = Date.now();
    const memo: Memo = {
      id: createId(),
      kind: 'book',
      sourceId: bookId,
      contextText: text,
      start: pending.start,
      end: pending.end,
      quote: text.slice(pending.start, pending.end),
      note: '',
      createdAt: now,
      updatedAt: now,
      chapterId,
      paragraphIndex: index,
    };
    setMemos((prev) => [...prev, memo]);
    save(memo);
    clearPending();
    if (openEditor) setEditingId(memo.id);
  };

  const updateNote = (id: string, note: string) => {
    const target = memosRef.current.find((m) => m.id === id);
    if (!target) return;
    const updated = { ...target, note, updatedAt: Date.now() };
    setMemos((prev) => prev.map((m) => (m.id === id ? updated : m)));
    save(updated);
  };

  const removeMemo = (id: string) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));
    setEditingId(null);
    deleteMemo(area, id).catch((e) => console.error('[NF-STUDY] Failed to delete memo:', e));
  };

  const changeFontSize = (delta: number) => {
    if (fontSize === null) return;
    const next = Math.min(MAX_FONT, Math.max(MIN_FONT, fontSize + delta));
    setFontSize(next);
    setReaderSettings(area, { fontSize: next }).catch((e) =>
      console.error('[NF-STUDY] Failed to save reader settings:', e)
    );
  };

  const focusMemo = (memo: Memo) => {
    setEditingId(memo.id);
    const mark = articleRef.current?.querySelector(`mark[data-memo-id="${CSS.escape(memo.id)}"]`);
    mark?.scrollIntoView({ block: 'center' });
    if (memo.paragraphIndex !== undefined) savePosition(memo.paragraphIndex);
  };

  const chapterMemos = useMemo(
    () =>
      memos
        .filter((m) => m.chapterId === chapterId)
        .sort((a, b) => (a.paragraphIndex ?? 0) - (b.paragraphIndex ?? 0) || a.start - b.start),
    [chapterId, memos]
  );

  if (loadError) {
    return (
      <p className="nfr-error" role="alert">
        {loadError}
      </p>
    );
  }
  if (book === 'missing') {
    return (
      <div className="nfr-empty">
        <p>책을 찾지 못했습니다. 지워졌을 수 있습니다.</p>
        <button type="button" className="nfr-btn" onClick={() => navigate({ name: 'books' })}>
          책 목록으로
        </button>
      </div>
    );
  }
  if (!book || fontSize === null) return <p className="nfr-muted">불러오는 중입니다…</p>;

  const chapterIndex = book.chapters.findIndex((c) => c.id === chapterId);
  const chapter = book.chapters[chapterIndex];

  return (
    <div className="nfr-reader">
      <nav className="nfr-chapters" aria-label="장 목록">
        <button type="button" className="nfr-btn nfr-back" onClick={() => navigate({ name: 'books' })}>
          ← 책 목록
        </button>
        <h1 className="nfr-reader-book-title">{book.title}</h1>
        {book.author && <p className="nfr-muted">{book.author}</p>}
        <ol className="nfr-chapter-list">
          {book.chapters.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`nfr-chapter-btn ${c.id === chapterId ? 'active' : ''}`}
                aria-current={c.id === chapterId ? 'true' : undefined}
                onClick={() => openChapter(c.id)}
              >
                <span className="nfr-chapter-num">{i + 1}</span>
                <span className="nfr-chapter-name">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <article className="nfr-article" aria-labelledby="chapter-title">
        <div className="nfr-article-toolbar">
          <span className="nfr-muted">
            {chapterIndex + 1}/{book.chapters.length}장
          </span>
          <span className="nfr-spacer" />
          <div className="nfr-font-controls" role="group" aria-label="글자 크기">
            <button type="button" className="nfr-btn" aria-label="글자 작게" onClick={() => changeFontSize(-1)} disabled={fontSize <= MIN_FONT}>
              가−
            </button>
            <span className="nfr-font-size" aria-live="polite">
              {fontSize}pt
            </span>
            <button type="button" className="nfr-btn" aria-label="글자 크게" onClick={() => changeFontSize(1)} disabled={fontSize >= MAX_FONT}>
              가+
            </button>
          </div>
        </div>
        <h2 id="chapter-title" className="nfr-chapter-title">
          {chapter?.title}
        </h2>
        <div
          className="nfr-paragraphs"
          ref={articleRef}
          onMouseUp={handleMouseUp}
          style={{ fontSize: `${fontSize}pt` }}
          data-testid="reader-body"
        >
          {paragraphs === null && <p className="nfr-muted">불러오는 중입니다…</p>}
          {paragraphs && paragraphs.length === 0 && <p className="nfr-muted">이 장에는 문단이 없습니다.</p>}
          {paragraphs?.map((text, index) => {
            const own = paragraphMemos(index);
            const editing = own.find((m) => m.id === editingId);
            return (
              <div key={index} className="nfr-paragraph" data-annotation-anchor data-paragraph-index={index}>
                <p className="annotatable" data-annotatable-key={index}>
                  <AnnotatedText text={text} memos={own} editingId={editingId} onOpenMemo={setEditingId} />
                </p>
                {pending && pending.key === String(index) && (
                  <AnnotationToolbar
                    pending={pending}
                    onHighlight={() => createFromPending(false)}
                    onMemo={() => createFromPending(true)}
                  />
                )}
                {editing && (
                  <AnnotationEditor
                    annotation={editing}
                    saveFailed={saveFailed}
                    onChangeNote={(note) => updateNote(editing.id, note)}
                    onDelete={() => removeMemo(editing.id)}
                    onClose={() => setEditingId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </article>

      <aside className="nfr-chapter-memos" aria-labelledby="chapter-memos-title">
        <h2 id="chapter-memos-title">이 장의 메모 {chapterMemos.length > 0 ? chapterMemos.length : ''}</h2>
        {chapterMemos.length === 0 ? (
          <p className="nfr-muted">
            아직 메모가 없습니다. 본문에서 글을 고른 뒤 "하이라이트"나 "메모"를 누르세요.
          </p>
        ) : (
          <ul className="nfr-memo-mini-list">
            {chapterMemos.map((memo) => {
              const anchored = isBookMemoAnchored(memo, paragraphs ?? undefined);
              return (
                <li key={memo.id}>
                  <button
                    type="button"
                    className={`nfr-memo-mini ${memo.id === editingId ? 'active' : ''}`}
                    onClick={() => anchored && focusMemo(memo)}
                    aria-disabled={!anchored}
                  >
                    <span className="nfr-memo-mini-quote">{memo.quote}</span>
                    {memo.note.trim() && <span className="nfr-memo-mini-note">{memo.note.slice(0, 80)}</span>}
                    {paragraphs && !anchored && <span className="nfr-badge">위치를 찾지 못함</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
};
