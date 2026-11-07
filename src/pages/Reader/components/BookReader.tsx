import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookMeta, Memo, ReadingPosition, createId, isValidCompletion } from '../../../shared/memo/types';
import {
  deleteMemo,
  getBook,
  getBookCharCounts,
  getChapterParagraphs,
  getPosition,
  getReaderSettings,
  listCompletions,
  listMemosBySource,
  putMemo,
  setChapterDone,
  setPosition,
  updateReaderSettings,
} from '../../../shared/storage/repo';
import { completionKeyPrefix } from '../../../shared/storage/keys';
import { bookProgress } from '../logic/progress';
import { ProgressBar } from './ProgressBar';
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
const NO_MEMOS: Memo[] = [];

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
  // 장마다 학습 완료. 저장소에 쓴 뒤에만 바꿔, 화면과 저장소가 어긋나지 않게 한다(4.1-4).
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [charCounts, setCharCounts] = useState<Record<string, number> | null>(null);
  const [doneSaveFailed, setDoneSaveFailed] = useState<'list' | 'end' | null>(null);
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
      listCompletions(area, bookId),
    ])
      .then(([loadedBook, position, loadedMemos, settings, completions]) => {
        if (cancelled) return;
        setFontSize(settings.fontSize);
        if (!loadedBook) {
          setBook('missing');
          return;
        }
        setBook(loadedBook);
        setMemos(loadedMemos);
        setDone(Object.fromEntries(completions.map((c) => [c.chapterId, c.done])));
        getBookCharCounts(area, [loadedBook])
          .then((counts) => {
            if (!cancelled) setCharCounts(counts.get(loadedBook.id) ?? {});
          })
          .catch((e) => console.error('[NF-STUDY] Failed to count characters:', e));
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

  // 다른 탭에서 바꾼 학습 완료도 보이게 한다.
  useEffect(() => {
    const prefix = completionKeyPrefix(bookId);
    return area.onChanged((changes) => {
      const updates: Record<string, boolean> = {};
      Object.entries(changes).forEach(([key, change]) => {
        if (!key.startsWith(prefix)) return;
        const value = change.newValue;
        updates[key.slice(prefix.length)] = isValidCompletion(value) ? value.done : false;
      });
      if (Object.keys(updates).length > 0) setDone((prev) => ({ ...prev, ...updates }));
    });
  }, [area, bookId]);

  const toggleDone = (id: string, from: 'list' | 'end') => {
    const next = !done[id];
    setChapterDone(area, bookId, id, next)
      .then(() => {
        setDone((prev) => ({ ...prev, [id]: next }));
        setDoneSaveFailed(null);
      })
      .catch((e) => {
        console.error('[NF-STUDY] Failed to save completion:', e);
        setDoneSaveFailed(from);
      });
  };

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

  // 메모의 하이라이트로 스크롤한다. 본문에 그려져 있지 않으면 false.
  const scrollToMemo = (memoId: string) => {
    const mark = articleRef.current?.querySelector(`mark[data-memo-id="${CSS.escape(memoId)}"]`);
    mark?.scrollIntoView({ block: 'center' });
    return !!mark;
  };

  // 본문이 그려지면 읽던 문단이나 고른 메모로 스크롤한다.
  useLayoutEffect(() => {
    const target = scrollTarget.current;
    const container = articleRef.current;
    if (!paragraphs || !target || !container) return;
    scrollTarget.current = null;
    if (target.kind === 'memo') {
      if (scrollToMemo(target.memoId)) setEditingId(target.memoId);
    } else {
      container
        .querySelector(`[data-paragraph-index="${target.index}"]`)
        ?.scrollIntoView({ block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs]);

  const savePosition = useCallback(
    (chapter: string, index: number) => {
      const position: ReadingPosition = { bookId, chapterId: chapter, paragraphIndex: index, updatedAt: Date.now() };
      setPosition(area, position).catch((e) => console.error('[NF-STUDY] Failed to save position:', e));
    },
    [area, bookId]
  );

  // 스크롤하면 화면 맨 위에 걸친 문단을 읽는 위치로 저장한다.
  useEffect(() => {
    if (!paragraphs || !chapterId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const elements = articleRef.current?.querySelectorAll<HTMLElement>('[data-paragraph-index]');
        if (!elements) return;
        const visible = Array.from(elements).find((el) => el.getBoundingClientRect().bottom > HEADER_OFFSET);
        if (visible) savePosition(chapterId, Number(visible.dataset.paragraphIndex));
      }, POSITION_SAVE_DELAY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timer) clearTimeout(timer);
    };
  }, [chapterId, paragraphs, savePosition]);

  const openChapter = (id: string) => {
    if (id === chapterId) return;
    setEditingId(null);
    setChapterId(id);
    window.scrollTo?.({ top: 0 });
    savePosition(id, 0);
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

  // 문단마다 그릴 메모. 렌더할 때마다 메모 전체를 문단 수만큼 훑지 않게 장이나 메모가 바뀔 때만 만든다.
  const memosByParagraph = useMemo(() => {
    const map = new Map<number, Memo[]>();
    if (!chapterId || !paragraphs) return map;
    const indexes = new Set(
      memos.filter((m) => m.chapterId === chapterId && m.paragraphIndex !== undefined).map((m) => m.paragraphIndex!)
    );
    indexes.forEach((index) => {
      const text = paragraphs[index];
      if (text !== undefined) map.set(index, memosForParagraph(memos, chapterId, index, text));
    });
    return map;
  }, [chapterId, memos, paragraphs]);

  const paragraphMemos = useCallback(
    (index: number) => memosByParagraph.get(index) ?? NO_MEMOS,
    [memosByParagraph]
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
    updateReaderSettings(area, { fontSize: next }).catch((e) =>
      console.error('[NF-STUDY] Failed to save reader settings:', e)
    );
  };

  const focusMemo = (memo: Memo) => {
    setEditingId(memo.id);
    scrollToMemo(memo.id);
    if (memo.chapterId && memo.paragraphIndex !== undefined) savePosition(memo.chapterId, memo.paragraphIndex);
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
  const nextChapter = book.chapters[chapterIndex + 1];
  const chapterDone = !!chapterId && !!done[chapterId];
  const progress = charCounts
    ? bookProgress(book, charCounts, new Set(Object.keys(done).filter((id) => done[id])))
    : null;
  const doneFailedNotice = (
    <p className="nfr-error" role="alert">
      저장하지 못했습니다. 다시 눌러 주세요.
    </p>
  );

  return (
    <div className="nfr-reader">
      <nav className="nfr-chapters" aria-label="장 목록">
        <button type="button" className="nfr-btn nfr-back" onClick={() => navigate({ name: 'books' })}>
          ← 책 목록
        </button>
        <h1 className="nfr-reader-book-title">{book.title}</h1>
        {book.author && <p className="nfr-muted">{book.author}</p>}
        {progress && <ProgressBar progress={progress} />}
        {doneSaveFailed === 'list' && doneFailedNotice}
        <ol className="nfr-chapter-list">
          {book.chapters.map((c, i) => (
            <li key={c.id} className={`nfr-chapter-item ${done[c.id] ? 'done' : ''}`}>
              <button
                type="button"
                className={`nfr-chapter-btn ${c.id === chapterId ? 'active' : ''}`}
                aria-current={c.id === chapterId ? 'true' : undefined}
                onClick={() => openChapter(c.id)}
              >
                <span className="nfr-chapter-num">{done[c.id] ? '✓' : i + 1}</span>
                <span className="nfr-chapter-name">{c.title}</span>
              </button>
              <input
                type="checkbox"
                className="nfr-chapter-check"
                checked={!!done[c.id]}
                onChange={() => toggleDone(c.id, 'list')}
                aria-label={`${c.title} 학습 완료`}
                title="학습 완료"
              />
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
        {paragraphs && chapterId && (
          <div className="nfr-chapter-end">
            {chapterDone && <p className="nfr-done-note">✓ 이 장을 학습 완료했습니다.</p>}
            {doneSaveFailed === 'end' && doneFailedNotice}
            <div className="nfr-chapter-end-actions">
              <button
                type="button"
                className={`nfr-btn ${chapterDone ? '' : 'nfr-btn-primary'}`}
                onClick={() => toggleDone(chapterId, 'end')}
              >
                {chapterDone ? '학습 완료 취소' : '이 장 학습 완료'}
              </button>
              {nextChapter && (
                <button type="button" className="nfr-btn" onClick={() => openChapter(nextChapter.id)}>
                  다음 장
                </button>
              )}
            </div>
          </div>
        )}
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
