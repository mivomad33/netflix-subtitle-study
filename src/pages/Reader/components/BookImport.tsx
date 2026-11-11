import React, { useMemo, useState } from 'react';
import { createId } from '../../../shared/memo/types';
import { saveBook } from '../../../shared/storage/repo';
import {
  MAX_BOOK_CHARS,
  detectChapterStarts,
  normalizeChapterStarts,
  splitIntoChapters,
  toParagraphs,
} from '../../../shared/text/bookText';
import { useReaderEnv } from '../env';
import { Route } from '../route';

export { MAX_BOOK_CHARS };

interface Preview {
  paragraphs: string[];
  starts: number[];
  titles: Record<number, string>; // 장 첫 문단 위치 → 사용자가 고친 장 이름
}

export interface PreviewChapter {
  key: number; // 이 장이 시작하는 문단 위치(장 제목 줄 포함)
  end: number;
  title: string;
  paragraphs: string[];
}

// 나눌 곳으로 장 목록을 만든다. 장 이름은 사용자가 고친 것이 있으면 그것을 쓴다.
export function previewChapters(preview: Preview): PreviewChapter[] {
  const { paragraphs, starts, titles } = preview;
  const drafts = splitIntoChapters(paragraphs, starts);
  const valid = normalizeChapterStarts(paragraphs.length, starts);
  const keys = valid.length === 0 ? [0] : [...(valid[0] > 0 ? [0] : []), ...valid];
  return drafts.map((draft, i) => ({
    key: keys[i],
    end: i + 1 < keys.length ? keys[i + 1] : paragraphs.length,
    title: titles[keys[i]] ?? draft.title,
    paragraphs: draft.paragraphs,
  }));
}

// 큰 본문을 나누기 전에 대기 표시가 그려질 틈을 준다.
const nextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });

const makePreview = (raw: string, clean: boolean): Preview => {
  const paragraphs = toParagraphs(raw, { clean });
  return { paragraphs, starts: detectChapterStarts(paragraphs), titles: {} };
};

export const BookImport: React.FC<{ navigate: (route: Route) => void }> = ({ navigate }) => {
  const { area } = useReaderEnv();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [raw, setRaw] = useState('');
  const [clean, setClean] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [errors, setErrors] = useState<{ title?: string; body?: string; save?: string }>({});
  const [expanded, setExpanded] = useState<number | null>(null);

  const chapters = useMemo(() => (preview ? previewChapters(preview) : []), [preview]);

  const bodyError = (text: string) => {
    if (!text.trim()) return '본문을 붙여 넣으세요.';
    if (text.length > MAX_BOOK_CHARS) {
      return `본문이 너무 깁니다. 한 권에 ${MAX_BOOK_CHARS.toLocaleString('ko-KR')}자까지 넣을 수 있습니다(지금 ${text.length.toLocaleString('ko-KR')}자).`;
    }
    return undefined;
  };

  const runPreview = async (cleanValue = clean) => {
    const body = bodyError(raw);
    setErrors((prev) => ({ ...prev, body, save: undefined }));
    if (body) return null;
    setBusy('preview');
    await nextPaint();
    const next = makePreview(raw, cleanValue);
    setPreview(next);
    setExpanded(null);
    setBusy(null);
    return next;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = {
      title: title.trim() ? undefined : '책 제목을 넣으세요.',
      body: bodyError(raw),
    };
    setErrors(next);
    if (next.title || next.body) return;

    setBusy('save');
    await nextPaint();
    const current = preview ?? makePreview(raw, clean);
    if (!preview) setPreview(current);
    const now = Date.now();
    try {
      const book = await saveBook(
        area,
        { id: createId(), title: title.trim(), author: author.trim(), createdAt: now, updatedAt: now },
        previewChapters(current).map((c, i) => ({
          id: `ch${i + 1}`,
          title: c.title.trim() || `장 ${i + 1}`,
          paragraphs: c.paragraphs,
        }))
      );
      navigate({ name: 'book', bookId: book.id });
    } catch (e) {
      console.error('[NF-STUDY] Failed to save book:', e);
      setErrors({ save: '저장하지 못했습니다. 입력한 글은 화면에 남아 있습니다. 다시 시도해 주세요.' });
      setBusy(null);
    }
  };

  const updatePreview = (change: (p: Preview) => Preview) => setPreview((p) => (p ? change(p) : p));

  return (
    <section className="nfr-page nfr-import" aria-labelledby="import-title">
      <div className="nfr-page-header">
        <h1 id="import-title">책 등록</h1>
        <button type="button" className="nfr-btn" onClick={() => navigate({ name: 'books' })}>
          책 목록으로
        </button>
      </div>
      <form className="nfr-import-form" onSubmit={handleSave} noValidate>
        <div className="nfr-field-row">
          <label className="nfr-field">
            <span>책 제목 (필수)</span>
            <input
              className="nfr-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'import-title-error' : undefined}
            />
            {errors.title && (
              <span id="import-title-error" className="nfr-field-error">
                {errors.title}
              </span>
            )}
          </label>
          <label className="nfr-field">
            <span>지은이 (선택)</span>
            <input className="nfr-input" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </div>
        <label className="nfr-field">
          <span>본문 (필수) · 책 전체를 한 번에 붙여 넣어도 됩니다</span>
          <textarea
            className="nfr-input nfr-import-body"
            value={raw}
            rows={12}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
            }}
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? 'import-body-error' : undefined}
          />
          {errors.body && (
            <span id="import-body-error" className="nfr-field-error">
              {errors.body}
            </span>
          )}
        </label>
        <div className="nfr-import-actions">
          <label className="nfr-check">
            <input
              type="checkbox"
              checked={clean}
              onChange={(e) => {
                setClean(e.target.checked);
                if (preview) runPreview(e.target.checked);
              }}
            />
            본문 정리 (줄 끝 줄바꿈 합치기, 끊긴 단어 잇기, 빈 줄로 문단 나누기)
          </label>
          <span className="nfr-spacer" />
          <button type="button" className="nfr-btn" onClick={() => runPreview()} disabled={busy !== null}>
            미리 보기
          </button>
          <button type="submit" className="nfr-btn nfr-btn-primary" disabled={busy !== null}>
            저장
          </button>
        </div>
        {busy && (
          <p className="nfr-busy" role="status">
            <span className="nfr-spinner" aria-hidden="true" />
            {busy === 'preview' ? '본문을 정리하고 장을 나누는 중입니다…' : '저장하는 중입니다…'}
          </p>
        )}
        {errors.save && (
          <p className="nfr-error" role="alert">
            {errors.save}
          </p>
        )}
      </form>

      {preview && (
        <section className="nfr-preview" aria-labelledby="preview-title">
          <h2 id="preview-title">
            미리 보기 · 장 {chapters.length}개, 문단 {preview.paragraphs.length.toLocaleString('ko-KR')}개
          </h2>
          <p className="nfr-muted">
            장 이름을 고치거나, 나눈 곳을 빼거나("앞 장과 합치기"), 문단을 펼쳐 새로 나눌 수 있습니다. 저장하면 이대로
            만들어집니다.
          </p>
          <ol className="nfr-preview-list">
            {chapters.map((chapter, i) => (
              <li key={chapter.key} className="nfr-card nfr-preview-chapter">
                <div className="nfr-preview-head">
                  <input
                    className="nfr-input nfr-preview-name"
                    aria-label={`${i + 1}번째 장 이름`}
                    value={chapter.title}
                    onChange={(e) => {
                      const value = e.target.value;
                      updatePreview((p) => ({ ...p, titles: { ...p.titles, [chapter.key]: value } }));
                    }}
                  />
                  <span className="nfr-muted">문단 {chapter.paragraphs.length}개</span>
                  <button
                    type="button"
                    className="nfr-btn"
                    aria-expanded={expanded === chapter.key}
                    onClick={() => setExpanded(expanded === chapter.key ? null : chapter.key)}
                  >
                    {expanded === chapter.key ? '문단 접기' : '문단 펼치기'}
                  </button>
                  {i > 0 && (
                    <button
                      type="button"
                      className="nfr-btn"
                      aria-label={`${i + 1}번째 장을 앞 장과 합치기`}
                      onClick={() =>
                        updatePreview((p) => ({ ...p, starts: p.starts.filter((s) => s !== chapter.key) }))
                      }
                    >
                      앞 장과 합치기
                    </button>
                  )}
                </div>
                <p className="nfr-preview-first">
                  {chapter.paragraphs[0]?.slice(0, 160) ?? '(문단 없음)'}
                  {(chapter.paragraphs[0]?.length ?? 0) > 160 ? '…' : ''}
                </p>
                {expanded === chapter.key && (
                  <ol className="nfr-preview-paragraphs">
                    {preview.paragraphs.slice(chapter.key, chapter.end).map((text, offset) => {
                      const index = chapter.key + offset;
                      return (
                        <li key={index}>
                          <span className="nfr-preview-paragraph">{text}</span>
                          {offset > 0 && (
                            <button
                              type="button"
                              className="nfr-btn nfr-btn-small"
                              aria-label={`${index + 1}번째 문단부터 새 장 시작`}
                              onClick={() => updatePreview((p) => ({ ...p, starts: [...p.starts, index] }))}
                            >
                              여기서 새 장 시작
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
};
