import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookMeta, Memo } from '../../../shared/memo/types';
import {
  deleteMemo,
  getChaptersParagraphs,
  getUnplacedNetflixMemoIds,
  listBooks,
  listMemos,
  putMemo,
} from '../../../shared/storage/repo';
import { KEY, PREFIX } from '../../../shared/storage/keys';
import { applyMemoChanges, touches } from '../logic/liveMemos';
import { AnnotationEditor } from '../../../shared/ui/AnnotationEditor';
import { useReaderEnv } from '../env';
import { Route } from '../route';
import { SourceFilter, excerptAround, filterMemos } from '../logic/memoSearch';
import { netflixWatchUrl } from '../logic/netflixUrl';
import { isBookMemoAnchored } from '../logic/bookMemos';

const PAGE_SIZE = 100;

const videoLabel = (m: Memo) => m.videoTitle || `제목 없는 영상 (${m.sourceId})`;
const chapterTextKey = (m: Memo) => KEY.chapter(m.sourceId, m.chapterId ?? '');

export function netflixSourceLabel(m: Memo): string {
  const title = videoLabel(m);
  if (m.seasonSeq === undefined || m.episodeSeq === undefined) return title;
  return `${title} · 시즌 ${m.seasonSeq} ${m.episodeSeq}화${m.episodeTitle ? ` ${m.episodeTitle}` : ''}`;
}

const encodeFilter = (f: SourceFilter) =>
  f.kind === 'video' ? `video:${f.videoId}` : f.kind === 'bookId' ? `book:${f.bookId}` : f.kind;

const decodeFilter = (value: string): SourceFilter => {
  if (value.startsWith('video:')) return { kind: 'video', videoId: value.slice(6) };
  if (value.startsWith('book:')) return { kind: 'bookId', bookId: value.slice(5) };
  if (value === 'netflix' || value === 'book') return { kind: value };
  return { kind: 'all' };
};

// 고른 글이 보이도록 원문 주변만 보여 주고, 고른 글을 칠한다.
const ContextExcerpt: React.FC<{ memo: Memo }> = ({ memo }) => {
  const excerpt = excerptAround(memo.contextText, memo.start, memo.end);
  const at = excerpt.indexOf(memo.quote);
  if (!memo.quote || at < 0) return <>{excerpt}</>;
  return (
    <>
      {excerpt.slice(0, at)}
      <mark className="highlighted-word nfr-static-mark">{memo.quote}</mark>
      {excerpt.slice(at + memo.quote.length)}
    </>
  );
};

export const MemoCollection: React.FC<{ navigate: (route: Route) => void }> = ({ navigate }) => {
  const { area, openTab } = useReaderEnv();
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [chapterTexts, setChapterTexts] = useState<Record<string, string[]>>({});
  const [unplacedNetflix, setUnplacedNetflix] = useState<Map<string, Set<string>>>(() => new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>({ kind: 'all' });
  const [onlyWithNote, setOnlyWithNote] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const memosRef = useRef<Memo[]>([]);
  memosRef.current = memos ?? [];
  const openedAt = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedMemos, loadedBooks] = await Promise.all([listMemos(area), listBooks(area)]);
        // 원서 메모가 아직 제자리를 찾는지 보려고, 메모가 붙은 장의 본문만 한 번에 읽는다.
        // 넷플릭스 메모는 학습 패널이 대사에서 찾지 못했다고 남긴 목록으로 본다.
        const [texts, unplaced] = await Promise.all([
          getChaptersParagraphs(
            area,
            loadedMemos
              .filter((m) => m.kind === 'book' && m.chapterId)
              .map((m) => ({ bookId: m.sourceId, chapterId: m.chapterId! }))
          ),
          getUnplacedNetflixMemoIds(
            area,
            Array.from(new Set(loadedMemos.filter((m) => m.kind === 'netflix').map((m) => m.sourceId)))
          ),
        ]);
        if (cancelled) return;
        setBooks(loadedBooks);
        setChapterTexts(texts);
        setUnplacedNetflix(unplaced);
        openedAt.current = new Map(loadedMemos.map((m) => [m.id, m.updatedAt]));
        setMemos(loadedMemos);
      } catch (e) {
        console.error('[NF-STUDY] Failed to load memos:', e);
        if (!cancelled) setLoadError('메모를 불러오지 못했습니다. 화면을 새로 고쳐 주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [area]);

  // 다른 탭·기기에서 바뀐 메모와 책을 반영한다(4.2-3). 고치는 중인 메모는 그대로 둔다.
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingId;
  useEffect(
    () =>
      area.onChanged((changes) => {
        setMemos((prev) => prev && applyMemoChanges(prev, changes, () => true, editingRef.current));
        if (touches(changes, [PREFIX.book])) {
          listBooks(area)
            .then(setBooks)
            .catch((e) => console.error('[NF-STUDY] Failed to reload books:', e));
        }
      }),
    [area]
  );

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const sourceTitle = useCallback(
    (m: Memo) => {
      if (m.kind === 'netflix') return netflixSourceLabel(m);
      const book = booksById.get(m.sourceId);
      const chapter = book?.chapters.find((c) => c.id === m.chapterId);
      return `${book?.title ?? '지워진 책'}${chapter ? ` · ${chapter.title}` : ''}`;
    },
    [booksById]
  );

  const isAnchored = useCallback(
    (m: Memo) =>
      (m.kind === 'netflix' && !unplacedNetflix.get(m.sourceId)?.has(m.id)) ||
      (m.kind === 'book' && booksById.has(m.sourceId) && isBookMemoAnchored(m, chapterTexts[chapterTextKey(m)])),
    [booksById, chapterTexts, unplacedNetflix]
  );

  // 고치는 동안 항목이 맨 위로 뛰지 않게, 순서는 화면을 연 때의 고친 시각으로 정한다.
  const filtered = useMemo(() => {
    if (!memos) return [];
    const byId = new Map(memos.map((m) => [m.id, m]));
    const sortable = memos.map((m) => ({ ...m, updatedAt: openedAt.current.get(m.id) ?? m.updatedAt }));
    return filterMemos(sortable, { query, source, onlyWithNote, sourceTitle }).map((m) => byId.get(m.id)!);
  }, [memos, onlyWithNote, query, source, sourceTitle]);

  const videos = useMemo(() => {
    const map = new Map<string, string>();
    memos?.forEach((m) => {
      if (m.kind === 'netflix' && !map.has(m.sourceId)) map.set(m.sourceId, videoLabel(m));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [memos]);

  useEffect(() => setLimit(PAGE_SIZE), [query, source, onlyWithNote]);

  const save = (memo: Memo) => {
    putMemo(area, memo)
      .then(() => setSaveFailed(false))
      .catch((e) => {
        console.error('[NF-STUDY] Failed to save memo:', e);
        setSaveFailed(true);
      });
  };

  const updateNote = (id: string, note: string) => {
    const target = memosRef.current.find((m) => m.id === id);
    if (!target) return;
    const updated = { ...target, note, updatedAt: Date.now() };
    setMemos((prev) => prev && prev.map((m) => (m.id === id ? updated : m)));
    save(updated);
  };

  const removeMemo = (id: string) => {
    setMemos((prev) => prev && prev.filter((m) => m.id !== id));
    if (editingId === id) setEditingId(null);
    deleteMemo(area, id).catch((e) => console.error('[NF-STUDY] Failed to delete memo:', e));
  };

  const confirmRemove = (memo: Memo) => {
    if (memo.note.trim() && !window.confirm('하이라이트를 지우면 메모도 함께 지워집니다. 지울까요?')) return;
    removeMemo(memo.id);
  };

  const goToSource = (memo: Memo, anchored: boolean) => {
    if (memo.kind === 'netflix') {
      openTab(netflixWatchUrl(memo, { fromStart: !anchored }));
      return;
    }
    navigate({
      name: 'book',
      bookId: memo.sourceId,
      chapterId: memo.chapterId,
      memoId: anchored ? memo.id : undefined,
    });
  };

  if (loadError) {
    return (
      <p className="nfr-error" role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <section className="nfr-page nfr-collection" aria-labelledby="collection-title">
      <div className="nfr-page-header">
        <h1 id="collection-title">메모 모아 보기</h1>
        {memos && <span className="nfr-muted">전체 {memos.length.toLocaleString('ko-KR')}개</span>}
      </div>
      <div className="nfr-filters" role="search">
        <input
          type="search"
          className="nfr-input nfr-search"
          placeholder="고른 글, 메모, 원문, 영상·책 제목에서 찾기"
          aria-label="메모 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="nfr-select-label">
          <span>출처</span>
          <select
            className="nfr-input nfr-select"
            value={encodeFilter(source)}
            onChange={(e) => setSource(decodeFilter(e.target.value))}
          >
            <option value="all">전체</option>
            <option value="netflix">넷플릭스만</option>
            <option value="book">원서만</option>
            {books.length > 0 && (
              <optgroup label="책">
                {books.map((b) => (
                  <option key={b.id} value={`book:${b.id}`}>
                    {b.title}
                  </option>
                ))}
              </optgroup>
            )}
            {videos.length > 0 && (
              <optgroup label="영상">
                {videos.map(([id, title]) => (
                  <option key={id} value={`video:${id}`}>
                    {title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="nfr-check">
          <input type="checkbox" checked={onlyWithNote} onChange={(e) => setOnlyWithNote(e.target.checked)} />
          메모 글이 있는 것만
        </label>
      </div>

      {memos === null && <p className="nfr-muted">불러오는 중입니다…</p>}
      {memos && memos.length === 0 && (
        <div className="nfr-empty">
          <p>아직 메모가 없습니다.</p>
          <p className="nfr-muted">
            넷플릭스 학습 패널의 영어 대사나 원서 리더의 본문에서 글을 고른 뒤 "하이라이트"나 "메모"를 누르면 여기에
            모입니다.
          </p>
        </div>
      )}
      {memos && memos.length > 0 && filtered.length === 0 && (
        <p className="nfr-empty" role="status">
          조건에 맞는 메모가 없습니다. 검색어나 거르기를 바꿔 보세요.
        </p>
      )}
      {filtered.length > 0 && (
        <p className="nfr-muted" role="status">
          {filtered.length.toLocaleString('ko-KR')}개
        </p>
      )}
      <ul className="nfr-memo-list">
        {filtered.slice(0, limit).map((memo) => {
          const anchored = isAnchored(memo);
          return (
            <li key={memo.id} className="nfr-card nfr-memo-card" data-memo-card={memo.id}>
              <div className="nfr-memo-card-head">
                <span className={`nfr-kind ${memo.kind}`}>{memo.kind === 'netflix' ? '넷플릭스' : '원서'}</span>
                <span className="nfr-memo-source">{sourceTitle(memo)}</span>
                {!anchored && <span className="nfr-badge">위치를 찾지 못함</span>}
                <span className="nfr-spacer" />
                <time className="nfr-muted" dateTime={new Date(memo.updatedAt).toISOString()}>
                  {new Date(memo.updatedAt).toLocaleDateString('ko-KR')}
                </time>
              </div>
              <p className="nfr-memo-quote">{memo.quote}</p>
              {memo.note.trim() ? (
                <p className="nfr-memo-note">{memo.note}</p>
              ) : (
                <p className="nfr-muted">메모 글 없음</p>
              )}
              <p className="nfr-memo-context">
                <ContextExcerpt memo={memo} />
              </p>
              <div className="nfr-memo-actions">
                <button type="button" className="nfr-btn" onClick={() => goToSource(memo, anchored)}>
                  {anchored ? '원래 위치로' : memo.kind === 'netflix' ? '영상 열기' : '장 열기'}
                </button>
                <button
                  type="button"
                  className="nfr-btn"
                  aria-expanded={editingId === memo.id}
                  onClick={() => setEditingId(editingId === memo.id ? null : memo.id)}
                >
                  메모 고치기
                </button>
                <button type="button" className="nfr-btn nfr-btn-danger" onClick={() => confirmRemove(memo)}>
                  지우기
                </button>
              </div>
              {editingId === memo.id && (
                <AnnotationEditor
                  annotation={memo}
                  saveFailed={saveFailed}
                  onChangeNote={(note) => updateNote(memo.id, note)}
                  onDelete={() => removeMemo(memo.id)}
                  onClose={() => setEditingId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length > limit && (
        <button type="button" className="nfr-btn nfr-more" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          더 보기 ({(filtered.length - limit).toLocaleString('ko-KR')}개 남음)
        </button>
      )}
    </section>
  );
};
