import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookMeta, Memo } from '../../../shared/memo/types';
import { PREFIX, KEY } from '../../../shared/storage/keys';
import { getBook, listMemosBySource } from '../../../shared/storage/repo';
import { toParagraphs } from '../../../shared/text/bookText';
import { useReaderEnv } from '../env';
import { useLeaveGuard } from '../leaveGuard';
import {
  MAX_TITLE_CHARS,
  addChapter,
  cleanTitle,
  deleteChapter,
  isBookEditError,
  memosOfChapter,
  moveChapter,
  renameChapter,
  tooLongMessage,
  updateBookInfo,
} from '../logic/bookEdit';
import { touches } from '../logic/liveMemos';
import { Route } from '../route';
import { ConfirmDialog } from './ConfirmDialog';

const TITLE_ERROR = `제목을 넣으세요(${MAX_TITLE_CHARS}자까지).`;
const AUTHOR_ERROR = `지은이는 ${MAX_TITLE_CHARS}자까지 넣을 수 있습니다.`;
const CHANGED_NOTICE = '다른 곳에서 책이 바뀌어 다시 읽었습니다. 다시 해 주세요.';
const SAVE_FAILED = '저장하지 못했습니다. 다시 시도해 주세요.';

// 입력을 마치면(포커스를 옮기거나 Enter) 한 번 저장하는 제목 입력칸. 글자마다 저장하지 않는다(4.1-5).
const TitleField: React.FC<{
  label: string;
  value: string;
  error: string;
  allowEmpty?: boolean;
  className?: string;
  onSave: (value: string) => Promise<boolean>;
}> = ({ label, value, error, allowEmpty, className, onSave }) => {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const saved = useRef(value);
  // 저장된 값이 바뀌면(저장 성공, 다른 곳에서 바뀜) 입력칸도 맞춘다.
  useEffect(() => {
    if (saved.current !== value) {
      saved.current = value;
      setDraft(value);
      setInvalid(false);
    }
  }, [value]);

  const commit = async () => {
    const cleaned = cleanTitle(draft, allowEmpty);
    if (cleaned === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cleaned === value) {
      setDraft(cleaned);
      return;
    }
    await onSave(cleaned);
  };

  const id = React.useId();
  return (
    <span className={`nfr-edit-title ${className ?? ''}`}>
      <input
        className="nfr-input"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={invalid ? id : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setInvalid(false);
          }
        }}
      />
      {invalid && (
        <span id={id} className="nfr-field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
};

export const BookEditor: React.FC<{ bookId: string; navigate: (route: Route) => void }> = ({ bookId, navigate }) => {
  const { area } = useReaderEnv();
  const guard = useLeaveGuard();
  const [book, setBook] = useState<BookMeta | null | 'missing'>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [clean, setClean] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);
  const bookRef = useRef<BookMeta | null>(null);
  // 이 화면이 저장하는 동안 온 변경 알림은 자기 것일 수 있어 바로 반영하지 않고, 저장이 모두 끝난 뒤 한 번 다시 읽는다.
  const writing = useRef(false);
  const missed = useRef(false);
  const waiting = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const show = useCallback((next: BookMeta | null) => {
    bookRef.current = next;
    setBook(next ?? 'missing');
  }, []);

  const load = useCallback(async () => {
    const [loaded, loadedMemos] = await Promise.all([getBook(area, bookId), listMemosBySource(area, 'book', bookId)]);
    setMemos(loadedMemos);
    return loaded;
  }, [area, bookId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((loaded) => {
        if (!cancelled) show(loaded);
      })
      .catch(() => {
        console.error('[NF-STUDY] Failed to load book for editing');
        if (!cancelled) setError('책을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.');
      });
    // 다른 탭·기기에서 이 책이나 메모가 바뀌면 다시 읽는다(4.1-6).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = area.onChanged((changes) => {
      if (!touches(changes, [KEY.book(bookId), PREFIX.memo])) return;
      if (writing.current) {
        missed.current = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (writing.current || cancelled) return;
        load()
          .then((loaded) => {
            if (cancelled || writing.current) return;
            const before = bookRef.current;
            if (before && (!loaded || loaded.updatedAt !== before.updatedAt)) setNotice(loaded ? CHANGED_NOTICE : null);
            show(loaded);
          })
          .catch(() => {
            // 다음 변경 알림이나 저장 때 다시 읽는다.
          });
      }, 100);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [area, bookId, load, show]);

  // 장 추가 입력에 쓴 글이 있으면 나가기 전에 확인받는다.
  const addDirty = adding && (newTitle.trim() !== '' || newBody.trim() !== '');
  useEffect(() => {
    guard.setDirty(addDirty);
    return () => guard.setDirty(false);
  }, [addDirty, guard]);

  // 저장 하나를 돌린다. 성공하면 true.
  const runOne = async (action: (loaded: BookMeta) => Promise<BookMeta>, fail: (message: string) => void): Promise<boolean> => {
    const loaded = bookRef.current;
    if (!loaded) return false;
    setError(null);
    setNotice(null);
    try {
      show(await action(loaded));
      return true;
    } catch (e) {
      if (isBookEditError(e)) {
        if (e.code === 'book-changed' && e.detail.book) {
          show(e.detail.book);
          setNotice(CHANGED_NOTICE);
        } else if (e.code === 'book-missing') {
          show(null);
        } else if (e.code === 'chapter-missing') {
          show(await getBook(area, bookId).catch(() => loaded));
          setNotice('그 장은 다른 곳에서 이미 지워졌습니다. 책을 다시 읽었습니다.');
        } else if (e.code === 'too-long') {
          fail(tooLongMessage(e.detail.chars));
        } else if (e.code === 'last-chapter') {
          fail('마지막 남은 장은 지울 수 없습니다.');
        } else {
          fail(TITLE_ERROR);
        }
      } else {
        // 저장 오류의 종류별 안내는 화면 위쪽 띠가 보인다(4.7-3). 여기서는 저장되지 않았다는 것만 알린다.
        console.error('[NF-STUDY] Failed to save book edit');
        fail(SAVE_FAILED);
      }
      return false;
    }
  };

  // 저장은 누른 차례대로 하나씩 한다. 앞의 저장이 끝나기 전에 누른 것도 버리지 않고, 앞의 결과(새 책 정보) 위에서 이어 한다.
  // 그래서 저장하는 동안 입력칸과 버튼을 막지 않는다(제목을 고치고 곧바로 다른 버튼을 눌러도 된다).
  const run = (action: (loaded: BookMeta) => Promise<BookMeta>, onError?: (message: string) => void): Promise<boolean> => {
    waiting.current += 1;
    writing.current = true;
    setBusy(true);
    const result = queue.current.then(() => runOne(action, onError ?? setError));
    queue.current = result.then(async () => {
      waiting.current -= 1;
      if (waiting.current > 0) return;
      writing.current = false;
      setBusy(false);
      // 저장하는 동안 온 변경 알림은 건너뛰었으므로 한 번 다시 읽어 맞춘다.
      try {
        const fresh = await load();
        if (writing.current) return;
        const before = bookRef.current;
        if (missed.current && before && (!fresh || fresh.updatedAt !== before.updatedAt)) {
          if (fresh) setNotice(CHANGED_NOTICE);
          show(fresh);
        }
      } catch {
        // 다음 변경 알림이나 저장 때 다시 읽는다.
      } finally {
        missed.current = false;
      }
    });
    return result;
  };

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
  if (!book) {
    return error ? (
      <p className="nfr-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="nfr-muted">불러오는 중입니다…</p>
    );
  }

  const only = book.chapters.length <= 1;
  const target = deleting ? book.chapters.find((c) => c.id === deleting) : undefined;
  const targetMemos = target ? memosOfChapter(memos, book.id, target.id).length : 0;

  const closeAdd = () => {
    setAdding(false);
    setNewTitle('');
    setNewBody('');
    setAddError(null);
  };

  const submitAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cleanTitle(newTitle) === null) {
      setAddError(TITLE_ERROR);
      return;
    }
    setAddError(null);
    const paragraphs = toParagraphs(newBody, { clean });
    const ok = await run(async (loaded) => (await addChapter(area, loaded, { title: newTitle, paragraphs })).book, setAddError);
    if (ok) closeAdd();
  };

  const confirmDelete = async (deleteMemos: boolean) => {
    const id = deleting;
    setDeleting(null);
    if (id) await run((loaded) => deleteChapter(area, loaded, id, { deleteMemos }));
  };

  return (
    <section className="nfr-page nfr-book-edit" aria-labelledby="book-edit-title">
      <div className="nfr-page-header">
        <h1 id="book-edit-title">책 편집</h1>
        <button type="button" className="nfr-btn" onClick={() => navigate({ name: 'book', bookId })}>
          리더로 돌아가기
        </button>
      </div>
      {notice && (
        <p className="nfr-edit-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="nfr-error" role="alert">
          {error}
        </p>
      )}
      <div className="nfr-field-row">
        <label className="nfr-field">
          <span>책 제목</span>
          <TitleField
            label="책 제목"
            value={book.title}
            error={TITLE_ERROR}
            onSave={(title) => run((loaded) => updateBookInfo(area, loaded, { title }))}
          />
        </label>
        <label className="nfr-field">
          <span>지은이 (선택)</span>
          <TitleField
            label="지은이"
            value={book.author}
            error={AUTHOR_ERROR}
            allowEmpty
            onSave={(author) => run((loaded) => updateBookInfo(area, loaded, { author }))}
          />
        </label>
      </div>
      <p className="nfr-busy nfr-edit-status" role="status">
        {busy && (
          <>
            <span className="nfr-spinner" aria-hidden="true" />
            저장하는 중입니다…
          </>
        )}
      </p>

      <h2 className="nfr-edit-heading">장 {book.chapters.length}개</h2>
      <p className="nfr-muted nfr-edit-help">
        제목은 입력을 마치면(다른 곳을 누르거나 Enter) 저장됩니다. 순서를 바꾸거나 제목을 고쳐도 메모와 학습 기록은 그대로입니다.
      </p>
      <ol className="nfr-edit-list">
        {book.chapters.map((chapter, index) => (
          <li key={chapter.id} className="nfr-card nfr-edit-row">
            <span className="nfr-edit-num" aria-hidden="true">
              {index + 1}
            </span>
            <TitleField
              className="nfr-edit-row-title"
              label={`${index + 1}번째 장 제목`}
              value={chapter.title}
              error={TITLE_ERROR}
              onSave={(title) => run((loaded) => renameChapter(area, loaded, chapter.id, title))}
            />
            <span className="nfr-muted nfr-edit-count">문단 {chapter.paragraphCount.toLocaleString('ko-KR')}개</span>
            <span className="nfr-edit-actions">
              <button
                type="button"
                className="nfr-btn nfr-edit-move"
                aria-label={`「${chapter.title}」 위로`}
                title="위로"
                disabled={index === 0}
                onClick={() => run((loaded) => moveChapter(area, loaded, chapter.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="nfr-btn nfr-edit-move"
                aria-label={`「${chapter.title}」 아래로`}
                title="아래로"
                disabled={index === book.chapters.length - 1}
                onClick={() => run((loaded) => moveChapter(area, loaded, chapter.id, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="nfr-btn"
                aria-label={`「${chapter.title}」 본문 고치기`}
                onClick={() => navigate({ name: 'editChapter', bookId, chapterId: chapter.id, from: 'book' })}
              >
                본문 고치기
              </button>
              <button
                type="button"
                className="nfr-btn nfr-btn-danger"
                aria-label={`「${chapter.title}」 지우기`}
                disabled={only}
                onClick={() => setDeleting(chapter.id)}
              >
                지우기
              </button>
            </span>
          </li>
        ))}
      </ol>
      {only && (
        <p className="nfr-muted nfr-edit-help">
          장이 하나뿐이라 지울 수 없습니다. 책을 없애려면 책 목록에서 "지우기"를 누르세요.
        </p>
      )}

      {!adding ? (
        <button type="button" className="nfr-btn" onClick={() => setAdding(true)}>
          장 추가
        </button>
      ) : (
        <form className="nfr-card nfr-edit-add" onSubmit={submitAdd} noValidate aria-labelledby="add-chapter-title">
          <h2 id="add-chapter-title" className="nfr-edit-heading">
            장 추가
          </h2>
          <label className="nfr-field">
            <span>장 제목 (필수)</span>
            <input
              className="nfr-input"
              value={newTitle}
              aria-invalid={addError === TITLE_ERROR}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label className="nfr-field">
            <span>본문 (비워 두고 나중에 넣어도 됩니다) · 새 장은 맨 끝에 생깁니다</span>
            <textarea
              className="nfr-input nfr-import-body"
              rows={10}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
            />
          </label>
          <div className="nfr-import-actions">
            <label className="nfr-check">
              <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
              본문 정리 (줄 끝 줄바꿈 합치기, 끊긴 단어 잇기, 빈 줄로 문단 나누기)
            </label>
            <span className="nfr-spacer" />
            <button type="button" className="nfr-btn" onClick={closeAdd} disabled={busy}>
              취소
            </button>
            <button type="submit" className="nfr-btn nfr-btn-primary" disabled={busy}>
              장 저장
            </button>
          </div>
          {addError && (
            <p className="nfr-error" role="alert">
              {addError}
            </p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={!!target}
        title={target ? `「${target.title}」 장을 지울까요?` : ''}
        onClose={() => setDeleting(null)}
        actions={
          <>
            <button type="button" className="nfr-btn" autoFocus onClick={() => setDeleting(null)}>
              취소
            </button>
            {targetMemos > 0 ? (
              <>
                <button type="button" className="nfr-btn nfr-btn-danger" onClick={() => confirmDelete(false)}>
                  메모 남기기
                </button>
                <button type="button" className="nfr-btn nfr-btn-danger" onClick={() => confirmDelete(true)}>
                  메모도 지우기
                </button>
              </>
            ) : (
              <button type="button" className="nfr-btn nfr-btn-danger" onClick={() => confirmDelete(false)}>
                지우기
              </button>
            )}
          </>
        }
      >
        <p>이 장의 본문과 학습 완료 기록이 지워집니다. 되돌릴 수 없습니다.</p>
        {targetMemos > 0 ? (
          <p>
            이 장에 메모·하이라이트가 {targetMemos}개 있습니다. "메모 남기기"를 누르면 메모는 메모 모아 보기에 "위치를 찾지
            못함"으로 남고, "메모도 지우기"를 누르면 함께 지워집니다.
          </p>
        ) : (
          <p className="nfr-dialog-note">이 장에는 메모·하이라이트가 없습니다.</p>
        )}
      </ConfirmDialog>
    </section>
  );
};
