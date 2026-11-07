// 넷플릭스 대사와 원서 문단에 붙는 하이라이트·메모. 두 출처가 같은 모양을 쓴다.
export type MemoKind = 'netflix' | 'book';

export interface Memo {
  id: string;
  kind: MemoKind;
  sourceId: string; // 넷플릭스 영상 ID 또는 책 ID
  contextText: string; // 붙어 있는 대사·문단 원문
  start: number; // 원문 안 시작 위치(포함)
  end: number; // 원문 안 끝 위치(제외)
  quote: string; // 고른 글
  note: string; // 메모 글(비어 있을 수 있음)
  createdAt: number;
  updatedAt: number;
  // 넷플릭스 메모
  sentenceStartMs?: number;
  videoTitle?: string;
  seasonSeq?: number;
  episodeSeq?: number;
  episodeTitle?: string;
  // 원서 메모
  chapterId?: string;
  paragraphIndex?: number;
}

export interface ChapterMeta {
  id: string;
  title: string;
  paragraphCount: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  chapters: ChapterMeta[];
  createdAt: number;
  updatedAt: number;
}

export interface ReadingPosition {
  bookId: string;
  chapterId: string;
  paragraphIndex: number;
  updatedAt: number;
}

export interface ReaderSettings {
  fontSize: number; // pt
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = { fontSize: 14 };

const isString = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const optional = (v: unknown, check: (x: unknown) => boolean) =>
  v === undefined || check(v);

// 저장소나 파일에서 읽은 값이 메모 모양인지 검사한다.
export function isValidMemo(value: unknown): value is Memo {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (!isString(m.id) || m.id === '') return false;
  if (m.kind !== 'netflix' && m.kind !== 'book') return false;
  if (!isString(m.sourceId) || m.sourceId === '') return false;
  if (!isString(m.contextText) || !isString(m.quote) || !isString(m.note)) {
    return false;
  }
  if (!isInt(m.start) || !isInt(m.end) || m.end <= m.start) return false;
  if (m.end > m.contextText.length) return false;
  if (!isNum(m.createdAt) || !isNum(m.updatedAt)) return false;
  if (m.kind === 'netflix') {
    if (!isNum(m.sentenceStartMs)) return false;
    if (!optional(m.videoTitle, isString)) return false;
    if (!optional(m.episodeTitle, isString)) return false;
    if (!optional(m.seasonSeq, isNum) || !optional(m.episodeSeq, isNum)) {
      return false;
    }
  } else {
    if (!isString(m.chapterId) || !isInt(m.paragraphIndex)) return false;
  }
  return true;
}

export function isValidBookMeta(value: unknown): value is BookMeta {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  if (!isString(b.id) || b.id === '' || !isString(b.title) || !isString(b.author)) {
    return false;
  }
  if (!isNum(b.createdAt) || !isNum(b.updatedAt)) return false;
  if (!Array.isArray(b.chapters)) return false;
  return b.chapters.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const ch = c as Record<string, unknown>;
    return isString(ch.id) && ch.id !== '' && isString(ch.title) && isInt(ch.paragraphCount);
  });
}

export function isValidPosition(value: unknown): value is ReadingPosition {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    isString(p.bookId) &&
    isString(p.chapterId) &&
    isInt(p.paragraphIndex) &&
    isNum(p.updatedAt)
  );
}

export const isValidReaderSettings = (value: unknown): value is ReaderSettings => {
  const fontSize = (value as Partial<ReaderSettings> | null)?.fontSize;
  return typeof fontSize === 'number' && fontSize >= 8 && fontSize <= 40;
};

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
