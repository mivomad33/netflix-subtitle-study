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
  isValidReaderSettings,
} from '../memo/types';
import { KEY, PREFIX, chapterKeyPrefix } from './keys';
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
  return toParagraphs((await area.get([key]))[key]);
}

const toParagraphs = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];

// 여러 장의 본문을 한 번에 읽는다. 결과의 키는 KEY.chapter(bookId, chapterId)다.
export async function getChaptersParagraphs(
  area: StorageArea,
  chapters: { bookId: string; chapterId: string }[]
): Promise<Record<string, string[]>> {
  const keys = Array.from(new Set(chapters.map((c) => KEY.chapter(c.bookId, c.chapterId))));
  if (keys.length === 0) return {};
  const values = await area.get(keys);
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, toParagraphs(v)]));
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
  const chapterPrefix = chapterKeyPrefix(bookId);
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
  const value = (await area.get([KEY.readerSettings]))[KEY.readerSettings];
  return { fontSize: isValidReaderSettings(value) ? value.fontSize : DEFAULT_READER_SETTINGS.fontSize };
}

export async function setReaderSettings(area: StorageArea, settings: ReaderSettings) {
  await area.set({ [KEY.readerSettings]: settings });
}

// ---- 학습 패널에서 위치를 찾지 못한 넷플릭스 메모 ----

export async function setUnplacedNetflixMemos(area: StorageArea, videoId: string, ids: string[]) {
  const key = KEY.netflixUnplaced(videoId);
  if (ids.length === 0) await area.remove([key]);
  else await area.set({ [key]: ids });
}

export async function getUnplacedNetflixMemoIds(
  area: StorageArea,
  videoIds: string[]
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const values = await area.get(videoIds.map(KEY.netflixUnplaced));
  return new Set(
    Object.values(values).flatMap((v) =>
      Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : []
    )
  );
}
