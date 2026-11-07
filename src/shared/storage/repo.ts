import {
  BookMeta,
  DEFAULT_READER_SETTINGS,
  Memo,
  MemoKind,
  ReaderSettings,
  ReadingPosition,
  isValidBookMeta,
  isValidMemo,
  isValidPosition,
} from '../memo/types';
import { KEY, PREFIX } from './keys';
import { StorageArea } from './storageArea';

const keysWithPrefix = async (area: StorageArea, prefix: string) =>
  (await area.getKeys()).filter((k) => k.startsWith(prefix));

// ---- 메모 ----

export async function listMemos(area: StorageArea): Promise<Memo[]> {
  const keys = await keysWithPrefix(area, PREFIX.memo);
  if (keys.length === 0) return [];
  const values = await area.get(keys);
  return Object.values(values).filter(isValidMemo);
}

export async function listMemosBySource(
  area: StorageArea,
  kind: MemoKind,
  sourceId: string
): Promise<Memo[]> {
  return (await listMemos(area)).filter(
    (m) => m.kind === kind && m.sourceId === sourceId
  );
}

export async function getMemo(area: StorageArea, id: string): Promise<Memo | null> {
  const key = KEY.memo(id);
  const value = (await area.get([key]))[key];
  return isValidMemo(value) ? value : null;
}

export async function putMemo(area: StorageArea, memo: Memo): Promise<void> {
  if (!isValidMemo(memo)) throw new Error('invalid memo');
  await area.set({ [KEY.memo(memo.id)]: memo });
}

export async function deleteMemo(area: StorageArea, id: string): Promise<void> {
  await area.remove([KEY.memo(id)]);
}

// ---- 책 ----

export interface ChapterContent {
  id: string;
  title: string;
  paragraphs: string[];
}

export async function listBooks(area: StorageArea): Promise<BookMeta[]> {
  const keys = await keysWithPrefix(area, PREFIX.book);
  if (keys.length === 0) return [];
  const values = await area.get(keys);
  return Object.values(values)
    .filter(isValidBookMeta)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBook(area: StorageArea, id: string): Promise<BookMeta | null> {
  const key = KEY.book(id);
  const value = (await area.get([key]))[key];
  return isValidBookMeta(value) ? value : null;
}

export async function getChapterParagraphs(
  area: StorageArea,
  bookId: string,
  chapterId: string
): Promise<string[]> {
  const key = KEY.chapter(bookId, chapterId);
  const value = (await area.get([key]))[key];
  return Array.isArray(value) ? value.filter((p) => typeof p === 'string') : [];
}

export async function saveBook(
  area: StorageArea,
  meta: Omit<BookMeta, 'chapters'>,
  chapters: ChapterContent[]
): Promise<BookMeta> {
  const book: BookMeta = {
    ...meta,
    chapters: chapters.map((c) => ({
      id: c.id,
      title: c.title,
      paragraphCount: c.paragraphs.length,
    })),
  };
  const items: Record<string, unknown> = {};
  chapters.forEach((c) => {
    items[KEY.chapter(book.id, c.id)] = c.paragraphs;
  });
  // 본문을 먼저 쓰고 책 정보를 마지막에 써서, 중간에 실패해도 반쪽 책이 목록에 보이지 않게 한다.
  await area.set(items);
  await area.set({ [KEY.book(book.id)]: book });
  return book;
}

export async function countBookMemos(area: StorageArea, bookId: string) {
  return (await listMemosBySource(area, 'book', bookId)).length;
}

export async function deleteBook(area: StorageArea, bookId: string): Promise<void> {
  const keys = await area.getKeys();
  const chapterPrefix = `${PREFIX.chapter}${bookId}:`;
  const memos = await listMemosBySource(area, 'book', bookId);
  await area.remove([
    KEY.book(bookId),
    KEY.position(bookId),
    ...keys.filter((k) => k.startsWith(chapterPrefix)),
    ...memos.map((m) => KEY.memo(m.id)),
  ]);
}

// ---- 읽기 위치와 설정 ----

export async function getPosition(
  area: StorageArea,
  bookId: string
): Promise<ReadingPosition | null> {
  const key = KEY.position(bookId);
  const value = (await area.get([key]))[key];
  return isValidPosition(value) ? value : null;
}

export async function listPositions(area: StorageArea): Promise<ReadingPosition[]> {
  const keys = await keysWithPrefix(area, PREFIX.position);
  if (keys.length === 0) return [];
  return Object.values(await area.get(keys)).filter(isValidPosition);
}

export async function setPosition(area: StorageArea, position: ReadingPosition) {
  await area.set({ [KEY.position(position.bookId)]: position });
}

export async function getReaderSettings(area: StorageArea): Promise<ReaderSettings> {
  const value = (await area.get([KEY.readerSettings]))[KEY.readerSettings] as
    | Partial<ReaderSettings>
    | undefined;
  const fontSize =
    typeof value?.fontSize === 'number' && value.fontSize >= 8 && value.fontSize <= 40
      ? value.fontSize
      : DEFAULT_READER_SETTINGS.fontSize;
  return { fontSize };
}

export async function setReaderSettings(area: StorageArea, settings: ReaderSettings) {
  await area.set({ [KEY.readerSettings]: settings });
}
