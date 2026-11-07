import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookMeta, DEFAULT_READER_SETTINGS, Memo, ReadingPosition, createId, isValidCompletion } from '../../../shared/memo/types';
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
  SentencePiece,
  hasTextSelection,
  useAnnotationSelection,
} from '../../../shared/ui/annotationUi';
import { createBrowserBackend } from '../tts/speaker';
import { splitSentences } from '../tts/sentences';
import { ReadAloudBar, ReadAloudSettings, readAloudSettings, useReadAloud } from './ReadAloud';
import { useReaderEnv } from '../env';
import { Route } from '../route';
import { isBookMemoAnchored, memosForParagraph } from '../logic/bookMemos';

const MIN_FONT = 10;
const MAX_FONT = 28;
const HEADER_OFFSET = 72; // 위쪽 고정 머리글 높이. 이보다 아래에 걸친 첫 문단을 읽는 위치로 본다.
const POSITION_SAVE_DELAY = 400;
const NO_MEMOS: Memo[] = [];
const TOOLBAR_WIDTH = 230; // 하이라이트·메모·읽기 세 버튼
// 자동 스크롤이 끝날 때까지 기다리는 최대 시간. 그 사이의 스크롤은 사용자 스크롤로 보지 않는다.
const AUTO_SCROLL_GRACE = 2000;
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

// 단축키를 쓰지 않는 곳: 입력칸, 고르기 상자, 메모 영역(4.3-9)
const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    typeof el.closest === 'function' &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      !!el.closest('.annotation-editor'))
  );
};

interface ParagraphProps {
  index: number;
  text: string;
  memos: Memo[];
  editingId: string | null;
  onOpenMemo: (id: string) => void;
  sentences?: SentencePiece[];
  currentSentence: number;
  onReadFrom?: (index: number) => void;
  extra: React.ReactNode;
}

// 문단 하나. 읽는 문장이 바뀔 때 그 문단만 다시 그리도록 memo로 감싼다.
const ReaderParagraph = React.memo(function ReaderParagraph({
  index,
  text,
  memos,
  editingId,
  onOpenMemo,
  sentences,
  currentSentence,
  onReadFrom,
  extra,
}: ParagraphProps) {
  return (
    <div className="nfr-paragraph" data-annotation-anchor data-paragraph-index={index}>
      {onReadFrom && (
        <button
          type="button"
          className="nfr-read-from"
          aria-label="여기서부터 읽기"
          title="여기서부터 읽기"
          onClick={() => onReadFrom(index)}
        >
          ▶
        </button>
      )}
      <p className="annotatable" data-annotatable-key={index}>
        <AnnotatedText
          text={text}
          memos={memos}
          editingId={editingId}
          onOpenMemo={onOpenMemo}
          sentences={sentences}
          currentSentence={currentSentence}
        />
      </p>
      {extra}
    </div>
  );
});

interface Props {
  bookId: string;
  initialChapterId?: string;
  initialMemoId?: string;
  navigate: (route: Route) => void;
}

type ScrollTarget = { kind: 'memo'; memoId: string } | { kind: 'paragraph'; index: number } | null;

export const BookReader: React.FC<Props> = ({ bookId, initialChapterId, initialMemoId, navigate }) => {
  const { area, speech: envSpeech } = useReaderEnv();
  const speech = useMemo(() => (envSpeech === undefined ? createBrowserBackend() : envSpeech), [envSpeech]);
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
  const [readSettings, setReadSettings] = useState<ReadAloudSettings>(() => readAloudSettings(DEFAULT_READER_SETTINGS));
  // 읽는 문장을 따라 스크롤하는지. 사용자가 직접 스크롤하면 멈춘다(4.3-3).
  const [following, setFollowing] = useState(true);
  const positionRef = useRef<{ chapterId: string; index: number } | null>(null);
  const autoScrollUntil = useRef(0);
  const startOnLoad = useRef(false);
  const settingsQueue = useRef<Promise<unknown>>(Promise.resolve());
  const readBarRef = useRef<HTMLDivElement>(null);
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
        setReadSettings(readAloudSettings(settings));
        if (position) positionRef.current = { chapterId: position.chapterId, index: position.paragraphIndex };
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
      positionRef.current = { chapterId: chapter, index };
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
    toolbarWidth: TOOLBAR_WIDTH,
  });

  // ---- 소리 내어 읽기 ----
  const { speaker, snapshot, voices, voice, sentences, piecesOf } = useReadAloud(speech, paragraphs, readSettings);
  const canRead = !!speaker && !!voice;
  const reading = snapshot.mode === 'chapter' && (snapshot.status === 'playing' || snapshot.status === 'paused');

  // 설정은 차례로 쓴다. 겹쳐 쓰면 앞에서 바꾼 항목이 사라질 수 있다.
  const saveSettings = useCallback(
    (patch: Parameters<typeof updateReaderSettings>[1]) => {
      settingsQueue.current = settingsQueue.current
        .then(() => updateReaderSettings(area, patch))
        .catch((e) => console.error('[NF-STUDY] Failed to save reader settings:', e));
    },
    [area]
  );

  const changeRead = useCallback(
    (patch: Partial<ReadAloudSettings>) => {
      setReadSettings((prev) => ({ ...prev, ...patch }));
      saveSettings(patch);
    },
    [saveSettings]
  );

  const startAt = useCallback(
    (index: number) => {
      if (!speaker) return;
      setFollowing(true);
      speaker.start(index);
    },
    [speaker]
  );

  // 처음 재생하면 읽던 위치의 문단부터 읽는다.
  const startIndex = () => {
    const position = positionRef.current;
    const first = position && position.chapterId === chapterId ? sentences.firstOfParagraph[position.index] : 0;
    return first !== undefined && first < sentences.items.length ? first : 0;
  };

  const playPause = () => {
    if (!speaker || !voice) return;
    const now = speaker.snapshot();
    if (now.status === 'playing') {
      if (now.mode === 'selection') speaker.stop();
      else speaker.pause();
      return;
    }
    setFollowing(true);
    if (!speaker.resume()) speaker.start(startIndex());
  };

  const readFrom = useCallback(
    (paragraphIndex: number) => {
      const first = sentences.firstOfParagraph[paragraphIndex];
      if (first !== undefined && first < sentences.items.length) startAt(first);
    },
    [sentences, startAt]
  );

  const readSelection = () => {
    if (!pending || !paragraphs || !speaker) return;
    const text = paragraphs[Number(pending.key)].slice(pending.start, pending.end);
    speaker.speakSelection(splitSentences(text).map((piece) => text.slice(piece.start, piece.end)));
    clearPending();
  };

  // 읽는 중에 본문의 문장을 누르면 그 문장부터 읽는다. 하이라이트를 누르면 메모 영역이 열린다(mark가 처리한다).
  const handleBodyClick = (event: React.MouseEvent) => {
    if (!reading || !speaker || hasTextSelection()) return;
    const target = event.target as HTMLElement;
    if (target.closest('mark, button, .annotation-editor, .annotation-toolbar')) return;
    const sentence = target.closest<HTMLElement>('[data-si]');
    if (sentence) startAt(Number(sentence.dataset.si));
  };

  const followReading = () => {
    setFollowing(true);
    const el = articleRef.current?.querySelector(`[data-si="${snapshot.index}"]`);
    if (el) {
      autoScrollUntil.current = Date.now() + AUTO_SCROLL_GRACE;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  };

  // 읽는 문장이 화면 밖으로 나가면 따라 스크롤한다.
  useEffect(() => {
    if (!following || snapshot.mode !== 'chapter' || snapshot.status !== 'playing' || snapshot.index < 0) return;
    const el = articleRef.current?.querySelector(`[data-si="${snapshot.index}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = HEADER_OFFSET + (readBarRef.current?.offsetHeight ?? 0);
    if (rect.top >= top && rect.bottom <= window.innerHeight) return;
    autoScrollUntil.current = Date.now() + AUTO_SCROLL_GRACE;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [following, snapshot.mode, snapshot.status, snapshot.index]);

  const doneIds = useMemo(() => new Set(Object.keys(done).filter((id) => done[id])), [done]);

  // 읽는 중에 사용자가 직접 스크롤하면 따라가기를 멈춘다.
  useEffect(() => {
    if (!reading) return;
    const userScrolled = () => setFollowing(false);
    const onScroll = () => {
      if (Date.now() > autoScrollUntil.current) userScrolled();
    };
    const onScrollEnd = () => {
      autoScrollUntil.current = 0;
    };
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !isTypingTarget(event.target)) userScrolled();
    };
    window.addEventListener('wheel', userScrolled, { passive: true });
    window.addEventListener('touchmove', userScrolled, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd);
    return () => {
      window.removeEventListener('wheel', userScrolled);
      window.removeEventListener('touchmove', userScrolled);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
    };
  }, [reading]);

  // "다음 장 읽기"로 연 장은 본문이 그려지면 처음부터 읽는다.
  useEffect(() => {
    if (!startOnLoad.current || sentences.items.length === 0) return;
    startOnLoad.current = false;
    startAt(0);
  }, [sentences, startAt]);

  // 단축키(넷플릭스 학습 패널과 같은 키, 4.3-9)
  const shortcuts = useRef<Record<string, () => void>>({});
  shortcuts.current = {
    Space: playPause,
    KeyA: () => speaker?.previous(),
    KeyS: () => speaker?.restart(),
    KeyD: () => speaker?.next(),
    KeyQ: () => changeRead({ autoPause: !readSettings.autoPause }),
    KeyR: () => changeRead({ repeat: !readSettings.repeat }),
  };
  useEffect(() => {
    if (!canRead) return;
    const ignored = (event: KeyboardEvent) =>
      event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target);
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcuts.current[event.code];
      if (!action || ignored(event)) return;
      // 버튼에 포커스가 있어도 Space가 그 버튼을 누르지 않게 한다.
      event.preventDefault();
      if (!event.repeat) action();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !ignored(event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canRead]);

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
    saveSettings({ fontSize: next });
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
    ? bookProgress(book, charCounts, doneIds)
    : null;
  const current = reading ? snapshot.index : -1;
  const currentParagraph = current >= 0 ? sentences.items[current]?.paragraphIndex : -1;
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
        <div className="nfr-read-sticky" ref={readBarRef}>
          <ReadAloudBar
            supported={!!speaker}
            snapshot={snapshot}
            voices={voices}
            voice={voice}
            settings={readSettings}
            following={following}
            hasNextChapter={!!nextChapter}
            onChange={changeRead}
            onPlayPause={playPause}
            onStop={() => speaker?.stop()}
            onPrevious={() => speaker?.previous()}
            onNext={() => speaker?.next()}
            onFollow={followReading}
            onReadNextChapter={() => {
              if (!nextChapter) return;
              startOnLoad.current = true;
              openChapter(nextChapter.id);
            }}
          />
        </div>
        <h2 id="chapter-title" className="nfr-chapter-title">
          {chapter?.title}
        </h2>
        <div
          className={`nfr-paragraphs ${reading ? 'reading' : ''}`}
          ref={articleRef}
          onMouseUp={handleMouseUp}
          onClick={handleBodyClick}
          style={{ fontSize: `${fontSize}pt` }}
          data-testid="reader-body"
        >
          {paragraphs === null && <p className="nfr-muted">불러오는 중입니다…</p>}
          {paragraphs && paragraphs.length === 0 && <p className="nfr-muted">이 장에는 문단이 없습니다.</p>}
          {paragraphs?.map((text, index) => {
            const own = paragraphMemos(index);
            const editing = own.find((m) => m.id === editingId);
            const showToolbar = pending && pending.key === String(index);
            return (
              <ReaderParagraph
                key={index}
                index={index}
                text={text}
                memos={own}
                editingId={editing ? editingId : null}
                onOpenMemo={setEditingId}
                sentences={speaker ? piecesOf(index) : undefined}
                currentSentence={index === currentParagraph ? current : -1}
                onReadFrom={canRead ? readFrom : undefined}
                extra={
                  showToolbar || editing ? (
                    <>
                      {showToolbar && (
                        <AnnotationToolbar
                          pending={pending}
                          onHighlight={() => createFromPending(false)}
                          onMemo={() => createFromPending(true)}
                          onRead={canRead ? readSelection : undefined}
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
                    </>
                  ) : null
                }
              />
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
