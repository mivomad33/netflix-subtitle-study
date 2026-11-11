import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookMeta, Memo } from '../../../shared/memo/types';
import { charCount, getBook, getChapterParagraphs, getPosition } from '../../../shared/storage/repo';
import { editorOffsetOfParagraph, editorText, parseEditorText, sameParagraphs } from '../../../shared/text/chapterEdit';
import { useReaderEnv } from '../env';
import { useLeaveGuard } from '../leaveGuard';
import { ChapterSavePlan, isBookEditError, planChapterSave, saveChapterBody } from '../logic/bookEdit';
import { Route } from '../route';
import { tooLongMessage } from './BookEditor';
import { ConfirmDialog } from './ConfirmDialog';

const SUMMARY_DELAY = 200;
// 이보다 오래 걸리는 동작에는 대기 표시를 보인다(4.3-14).
const BUSY_DELAY = 300;

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString('ko-KR')}` : n < 0 ? `−${Math.abs(n).toLocaleString('ko-KR')}` : '0');

// 저장된 본문과 편집 중인 글의 차이(4.3-7).
export const summaryText = (before: string[], after: string[]) =>
  `문단 ${before.length.toLocaleString('ko-KR')}→${after.length.toLocaleString('ko-KR')} · 글자 ${signed(
    charCount(after) - charCount(before)
  )}`;

// 글자가 10% 넘게 줄었는가. 저장된 본문이 비어 있으면 해당 없다.
export const shrinksTooMuch = (beforeChars: number, afterChars: number) =>
  beforeChars > 0 && (beforeChars - afterChars) * 10 > beforeChars;

// 글자 그대로 찾는다. from 이후의 첫 위치, 없으면 -1.
function findFrom(text: string, needle: string, from: number, caseSensitive: boolean): number {
  if (!needle) return -1;
  return caseSensitive ? text.indexOf(needle, from) : text.toLowerCase().indexOf(needle.toLowerCase(), from);
}

export function countMatches(text: string, needle: string, caseSensitive: boolean): number {
  if (!needle) return 0;
  const hay = caseSensitive ? text : text.toLowerCase();
  const pin = caseSensitive ? needle : needle.toLowerCase();
  let n = 0;
  for (let at = hay.indexOf(pin); at >= 0; at = hay.indexOf(pin, at + pin.length)) n++;
  return n;
}

// 모두 바꾼 글과 바꾼 개수. 바꿀 글은 글자 그대로 넣는다($1 같은 글도 그대로).
export function replaceAll(text: string, needle: string, replacement: string, caseSensitive: boolean): { text: string; count: number } {
  if (!needle) return { text, count: 0 };
  const hay = caseSensitive ? text : text.toLowerCase();
  const pin = caseSensitive ? needle : needle.toLowerCase();
  let out = '';
  let last = 0;
  let count = 0;
  for (let at = hay.indexOf(pin); at >= 0; at = hay.indexOf(pin, at + pin.length)) {
    out += text.slice(last, at) + replacement;
    last = at + pin.length;
    count++;
  }
  return { text: out + text.slice(last), count };
}

// 입력칸에서 고른 곳이 보이게 스크롤한다. 크롬은 포커스를 다시 받을 때 고른 곳으로 스크롤한다.
function revealSelection(textarea: HTMLTextAreaElement, start: number, end: number) {
  const active = document.activeElement as HTMLElement | null;
  textarea.setSelectionRange(start, end);
  textarea.blur();
  textarea.focus();
  if (active && active !== textarea && typeof active.focus === 'function') active.focus({ preventScroll: true });
}

type Problem =
  | { kind: 'changed' } // 편집을 시작한 뒤 다른 곳에서 본문이 바뀜
  | { kind: 'gone' } // 장이나 책이 지워짐
  | { kind: 'message'; text: string };

interface Loaded {
  book: BookMeta;
  original: string[];
  position: number | null;
}

interface Props {
  bookId: string;
  chapterId: string;
  from: 'reader' | 'book';
  navigate: (route: Route) => void;
}

export const ChapterEditor: React.FC<Props> = ({ bookId, chapterId, from, navigate }) => {
  const { area } = useReaderEnv();
  const guard = useLeaveGuard();
  const [loaded, setLoaded] = useState<Loaded | null | 'missing'>(null);
  const [loadError, setLoadError] = useState(false);
  // 다시 열 때마다 올려 입력칸을 새 본문으로 다시 만든다.
  const [version, setVersion] = useState(0);
  const [summary, setSummary] = useState('');
  const [matches, setMatches] = useState(0);
  const [needle, setNeedle] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBusy, setShowBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [confirm, setConfirm] = useState<{ plan: ChapterSavePlan; shrink: boolean } | null>(null);
  const [reopen, setReopen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirtyRef = useRef(false);
  const summaryTimer = useRef<ReturnType<typeof setTimeout>>();
  const findRef = useRef({ needle, caseSensitive });
  findRef.current = { needle, caseSensitive };

  const back = useCallback(
    () => navigate(from === 'reader' ? { name: 'book', bookId } : { name: 'edit', bookId }),
    [bookId, from, navigate]
  );

  const setDirty = useCallback(
    (value: boolean) => {
      dirtyRef.current = value;
      guard.setDirty(value);
    },
    [guard]
  );

  // 본문과 읽던 위치를 읽는다.
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    Promise.all([getBook(area, bookId), getPosition(area, bookId)])
      .then(async ([book, position]) => {
        if (!book || !book.chapters.some((c) => c.id === chapterId)) {
          if (!cancelled) setLoaded('missing');
          return;
        }
        const original = await getChapterParagraphs(area, bookId, chapterId);
        if (cancelled) return;
        setLoaded({
          book,
          original,
          position: position && position.chapterId === chapterId ? position.paragraphIndex : null,
        });
      })
      .catch(() => {
        console.error('[NF-STUDY] Failed to load chapter for editing');
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [area, bookId, chapterId, version]);

  // 탭을 닫거나 새로 고칠 때 저장하지 않은 수정이 있으면 브라우저가 묻게 한다(4.3-11).
  useEffect(() => {
    const handle = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handle);
    return () => {
      window.removeEventListener('beforeunload', handle);
      clearTimeout(summaryTimer.current);
      guard.setDirty(false);
    };
  }, [guard]);

  // 오래 걸릴 때만 대기 표시를 보인다.
  useEffect(() => {
    if (!busy) {
      setShowBusy(false);
      return;
    }
    const timer = setTimeout(() => setShowBusy(true), BUSY_DELAY);
    return () => clearTimeout(timer);
  }, [busy]);

  const original = loaded && loaded !== 'missing' ? loaded.original : null;

  const refresh = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !original) return;
    const text = textarea.value;
    setSummary(summaryText(original, parseEditorText(text)));
    setMatches(countMatches(text, findRef.current.needle, findRef.current.caseSensitive));
  }, [original]);

  // 본문이 준비되면 읽던 문단에 커서를 두고 그 문단이 보이게 한다(4.3-2).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !loaded || loaded === 'missing') return;
    setDirty(false);
    refresh();
    const offset = editorOffsetOfParagraph(loaded.original, loaded.position ?? 0);
    textarea.setSelectionRange(offset, offset);
    textarea.blur();
    textarea.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    refresh();
  }, [needle, caseSensitive, refresh]);

  const handleInput = () => {
    if (!dirtyRef.current) setDirty(true);
    setFindMessage(null);
    clearTimeout(summaryTimer.current);
    summaryTimer.current = setTimeout(refresh, SUMMARY_DELAY);
  };

  // 찾아 바꾸기로 글을 바꾼 뒤.
  const afterProgrammaticChange = () => {
    if (!dirtyRef.current) setDirty(true);
    clearTimeout(summaryTimer.current);
    refresh();
  };

  const findNext = (fromOffset?: number): boolean => {
    const textarea = textareaRef.current;
    if (!textarea || !needle) return false;
    const text = textarea.value;
    let at = findFrom(text, needle, fromOffset ?? textarea.selectionEnd, caseSensitive);
    if (at < 0) at = findFrom(text, needle, 0, caseSensitive);
    if (at < 0) {
      setFindMessage('찾지 못했습니다.');
      return false;
    }
    setFindMessage(null);
    revealSelection(textarea, at, at + needle.length);
    return true;
  };

  const selectionIsMatch = (textarea: HTMLTextAreaElement) => {
    const chosen = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    return caseSensitive ? chosen === needle : chosen.toLowerCase() === needle.toLowerCase();
  };

  const replaceOne = () => {
    const textarea = textareaRef.current;
    if (!textarea || !needle) return;
    if (!selectionIsMatch(textarea)) {
      // 아직 고른 곳이 없으면 먼저 찾는다.
      findNext(textarea.selectionStart);
      return;
    }
    const start = textarea.selectionStart;
    textarea.setRangeText(replacement, start, textarea.selectionEnd, 'end');
    afterProgrammaticChange();
    if (!findNext(start + replacement.length)) setFindMessage('바꿨습니다. 더 찾지 못했습니다.');
  };

  const replaceEvery = () => {
    const textarea = textareaRef.current;
    if (!textarea || !needle) return;
    const result = replaceAll(textarea.value, needle, replacement, caseSensitive);
    if (result.count === 0) {
      setFindMessage('찾지 못했습니다.');
      return;
    }
    textarea.value = result.text;
    afterProgrammaticChange();
    setFindMessage(`${result.count.toLocaleString('ko-KR')}곳을 바꿨습니다.`);
  };

  const fail = (e: unknown) => {
    if (isBookEditError(e)) {
      if (e.code === 'chapter-changed') setProblem({ kind: 'changed' });
      else if (e.code === 'chapter-missing' || e.code === 'book-missing') setProblem({ kind: 'gone' });
      else if (e.code === 'too-long') setProblem({ kind: 'message', text: tooLongMessage(e.detail.chars) });
      else setProblem({ kind: 'message', text: '저장하지 못했습니다. 다시 시도해 주세요.' });
      return;
    }
    // 저장 오류의 종류별 안내는 화면 위쪽 띠가 보인다(4.7-3).
    console.error('[NF-STUDY] Failed to save chapter body');
    setProblem({ kind: 'message', text: '저장하지 못했습니다. 고친 글은 화면에 남아 있습니다. 다시 시도해 주세요.' });
  };

  const input = () => ({
    bookId,
    chapterId,
    original: original ?? [],
    after: parseEditorText(textareaRef.current?.value ?? ''),
  });

  const leaveSaved = () => {
    setDirty(false);
    back();
  };

  const commit = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      await saveChapterBody(area, input());
      leaveSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!original || busy) return;
    setProblem(null);
    const next = input();
    if (sameParagraphs(next.after, original)) {
      // 고친 것이 없으면 쓰지 않고 돌아간다(4.3-4).
      leaveSaved();
      return;
    }
    setBusy(true);
    try {
      const plan = await planChapterSave(area, next);
      if (plan.unchanged) {
        leaveSaved();
        return;
      }
      const shrink = shrinksTooMuch(plan.beforeChars, plan.afterChars);
      if (plan.lost.length > 0 || shrink) {
        setConfirm({ plan, shrink });
        return;
      }
      await saveChapterBody(area, next);
      leaveSaved();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (loaded === 'missing') {
    return (
      <div className="nfr-empty">
        <p>이 장을 찾지 못했습니다. 지워졌을 수 있습니다.</p>
        <button type="button" className="nfr-btn" onClick={() => navigate({ name: 'books' })}>
          책 목록으로
        </button>
      </div>
    );
  }
  if (!loaded) {
    return loadError ? (
      <p className="nfr-error" role="alert">
        장을 불러오지 못했습니다. 화면을 새로 고쳐 주세요.
      </p>
    ) : (
      <p className="nfr-busy" role="status">
        <span className="nfr-spinner" aria-hidden="true" />
        본문을 여는 중입니다…
      </p>
    );
  }

  const chapter = loaded.book.chapters.find((c) => c.id === chapterId);
  const lost = confirm?.plan.lost ?? [];
  const shrinkBy = confirm ? confirm.plan.beforeChars - confirm.plan.afterChars : 0;
  const shrinkPercent = confirm && confirm.plan.beforeChars > 0 ? Math.round((shrinkBy / confirm.plan.beforeChars) * 100) : 0;

  return (
    <section className="nfr-chapter-edit" aria-labelledby="chapter-edit-title">
      <div className="nfr-page-header">
        <h1 id="chapter-edit-title">본문 고치기 · {chapter?.title}</h1>
        <button type="button" className="nfr-btn" onClick={back} disabled={busy}>
          {from === 'reader' ? '리더로 돌아가기' : '책 편집으로 돌아가기'}
        </button>
      </div>
      <p className="nfr-muted nfr-edit-help">
        줄바꿈마다 문단이 나뉩니다(빈 줄은 저장할 때 사라집니다). 저장하면 하이라이트·메모는 고친 글에 맞게 옮겨지고, 옮길 수
        없는 것은 저장 전에 알려 드립니다.
      </p>

      <div className="nfr-find" role="group" aria-label="찾아 바꾸기">
        <label className="nfr-find-field">
          <span>찾을 글</span>
          <input
            className="nfr-input"
            value={needle}
            onChange={(e) => {
              setNeedle(e.target.value);
              setFindMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                findNext();
              }
            }}
          />
        </label>
        <label className="nfr-find-field">
          <span>바꿀 글</span>
          <input className="nfr-input" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </label>
        <label className="nfr-check">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          대소문자 구분
        </label>
        <button type="button" className="nfr-btn" onClick={() => findNext()} disabled={!needle}>
          다음 찾기
        </button>
        <button type="button" className="nfr-btn" onClick={replaceOne} disabled={!needle || busy}>
          바꾸기
        </button>
        <button type="button" className="nfr-btn" onClick={replaceEvery} disabled={!needle || busy}>
          모두 바꾸기
        </button>
        <span className="nfr-find-status" role="status">
          {findMessage ?? (needle ? `${matches.toLocaleString('ko-KR')}곳` : '')}
        </span>
      </div>

      <textarea
        key={version}
        ref={textareaRef}
        className="nfr-input nfr-chapter-body"
        aria-label="장 본문"
        defaultValue={editorText(loaded.original)}
        onInput={handleInput}
      />

      {problem?.kind === 'changed' && (
        <div className="nfr-error nfr-edit-problem" role="alert">
          <span>
            편집을 시작한 뒤 이 장이 다른 곳에서 바뀌어 저장하지 않았습니다. 고친 글은 위에 남아 있으니 필요한 부분을 복사해 두고,
            새 본문으로 다시 열어 고쳐 주세요.
          </span>
          <button type="button" className="nfr-btn" onClick={() => setReopen(true)}>
            새 본문으로 다시 열기
          </button>
        </div>
      )}
      {problem?.kind === 'gone' && (
        <p className="nfr-error" role="alert">
          이 장이나 책이 다른 곳에서 지워져 저장하지 않았습니다. 고친 글은 위에 남아 있습니다.
        </p>
      )}
      {problem?.kind === 'message' && (
        <p className="nfr-error" role="alert">
          {problem.text}
        </p>
      )}

      <div className="nfr-chapter-edit-bar">
        <span className="nfr-edit-summary" aria-live="polite">
          {summary}
        </span>
        {showBusy && (
          <span className="nfr-busy" role="status">
            <span className="nfr-spinner" aria-hidden="true" />
            저장하는 중입니다…
          </span>
        )}
        <span className="nfr-spacer" />
        <button type="button" className="nfr-btn" onClick={back} disabled={busy}>
          취소
        </button>
        <button type="button" className="nfr-btn nfr-btn-primary" onClick={handleSave} disabled={busy}>
          저장
        </button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="저장하기 전에 확인해 주세요"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button type="button" className="nfr-btn" autoFocus onClick={() => setConfirm(null)}>
              계속 고치기
            </button>
            <button type="button" className="nfr-btn nfr-btn-danger" onClick={commit}>
              그래도 저장
            </button>
          </>
        }
      >
        {confirm?.shrink && (
          <p>
            글자가 {shrinkBy.toLocaleString('ko-KR')}자({shrinkPercent}%) 줄어듭니다. 저장할까요?
          </p>
        )}
        {lost.length > 0 && (
          <>
            <p>
              메모·하이라이트 {lost.length}개를 고친 글에 붙일 수 없습니다. 저장하면 이 메모들은 본문에서 떨어져 "위치를 찾지
              못함"으로 남습니다. 메모 글은 지워지지 않습니다. 옮긴 글이라면 그 문단을 다른 장에 그대로 붙여 넣고 저장할 때 다시
              붙습니다.
            </p>
            <ul className="nfr-lost-list" aria-label="붙일 수 없는 메모">
              {lost.map((memo: Memo) => (
                <li key={memo.id}>
                  <span className="nfr-lost-quote">{memo.quote}</span>
                  {memo.note.trim() && <span className="nfr-lost-note">{memo.note.slice(0, 80)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={reopen}
        title="새 본문으로 다시 열까요?"
        onClose={() => setReopen(false)}
        actions={
          <>
            <button type="button" className="nfr-btn" autoFocus onClick={() => setReopen(false)}>
              취소
            </button>
            <button
              type="button"
              className="nfr-btn nfr-btn-danger"
              onClick={() => {
                setReopen(false);
                setProblem(null);
                setDirty(false);
                setVersion((v) => v + 1);
              }}
            >
              다시 열기
            </button>
          </>
        }
      >
        <p>지금 고친 글을 버리고, 다른 곳에서 바뀐 본문을 엽니다.</p>
      </ConfirmDialog>
    </section>
  );
};
