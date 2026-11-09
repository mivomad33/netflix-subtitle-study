import {
  BookMeta,
  ChapterCompletion,
  Memo,
  MemoKind,
  ReaderSettings,
  ReadingPosition,
  isValidBookMeta,
  isValidCompletion,
  isValidMemo,
  isValidPosition,
  normalizeReaderSettings,
} from '../memo/types';
import { KEY, PREFIX, chapterKeyPrefix, completionKeyPrefix } from './keys';
import { StorageArea } from './storageArea';
import { toStorageErrorCode } from './errors';

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
      charCount: charCount(c.paragraphs),
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
  const completionPrefix = completionKeyPrefix(bookId);
  const memos = await listMemosBySource(area, 'book', bookId);
  await area.remove([
    KEY.book(bookId),
    KEY.position(bookId),
    ...keys.filter((k) => k.startsWith(chapterPrefix) || k.startsWith(completionPrefix)),
    ...memos.map((m) => KEY.memo(m.id)),
  ]);
}

// ---- 학습 완료와 글자 수 ----

export async function setChapterDone(
  area: StorageArea,
  bookId: string,
  chapterId: string,
  done: boolean,
  now = Date.now()
) {
  const completion: ChapterCompletion = { bookId, chapterId, done, updatedAt: now };
  await area.set({ [KEY.completion(bookId, chapterId)]: completion });
}

// 학습 완료 기록(끈 것 포함). bookId를 주면 그 책 것만.
export async function listCompletions(
  area: StorageArea,
  bookId?: string
): Promise<ChapterCompletion[]> {
  const keys = await keysWithPrefix(area, bookId ? completionKeyPrefix(bookId) : PREFIX.completion);
  if (keys.length === 0) return [];
  const values = await area.get(keys);
  return keys
    .map((k) => values[k])
    .filter(
      (v, i): v is ChapterCompletion =>
        isValidCompletion(v) && KEY.completion(v.bookId, v.chapterId) === keys[i]
    );
}

// 책마다 완료한 장 id
export const doneChapterIds = (completions: ChapterCompletion[], bookId: string) =>
  new Set(completions.filter((c) => c.bookId === bookId && c.done).map((c) => c.chapterId));

export const charCount = (paragraphs: string[]) => paragraphs.reduce((n, p) => n + p.length, 0);

const hasCharCounts = (book: BookMeta) => book.chapters.every((c) => c.charCount !== undefined);

// 책마다 장별 글자 수. 이 기능 전에 저장한 책(또는 그런 백업에서 가져온 책)은 본문을 한 번 읽어 구하고,
// 책 정보에 채워 둔다. 그 사이 다른 탭이 책을 바꿨으면(updatedAt이 다르면) 채우지 않는다.
export async function getBookCharCounts(
  area: StorageArea,
  books: BookMeta[]
): Promise<Map<string, Record<string, number>>> {
  const result = new Map<string, Record<string, number>>();
  const countsOf = (book: BookMeta) =>
    Object.fromEntries(book.chapters.map((c) => [c.id, c.charCount ?? 0]));
  const missing = books.filter((b) => !hasCharCounts(b));
  books.filter(hasCharCounts).forEach((b) => result.set(b.id, countsOf(b)));
  if (missing.length === 0) return result;

  const texts = await getChaptersParagraphs(
    area,
    missing.flatMap((b) => b.chapters.map((c) => ({ bookId: b.id, chapterId: c.id })))
  );
  const filled = missing.map((book) => ({
    ...book,
    chapters: book.chapters.map((c) => ({
      ...c,
      charCount: c.charCount ?? charCount(texts[KEY.chapter(book.id, c.id)] ?? []),
    })),
  }));
  filled.forEach((b) => result.set(b.id, countsOf(b)));
  try {
    const stored = await area.get(filled.map((b) => KEY.book(b.id)));
    const items: Record<string, BookMeta> = {};
    filled.forEach((b) => {
      const current = stored[KEY.book(b.id)];
      if (isValidBookMeta(current) && current.updatedAt === b.updatedAt) items[KEY.book(b.id)] = b;
    });
    if (Object.keys(items).length > 0) await area.set(items);
  } catch (e) {
    // 채우지 못해도 이번 표시는 맞다. 다음에 다시 구한다.
    // 원래 오류 문구에는 문서 경로(uid)가 들 수 있어 종류만 남긴다.
    console.error('[NF-STUDY] Failed to save character counts:', toStorageErrorCode(e));
  }
  return result;
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
  return normalizeReaderSettings((await area.get([KEY.readerSettings]))[KEY.readerSettings]);
}

// 바꾼 항목만 넘기면 나머지 설정은 그대로 둔다.
export async function updateReaderSettings(area: StorageArea, patch: Partial<ReaderSettings>) {
  const next = { ...(await getReaderSettings(area)), ...patch };
  await area.set({ [KEY.readerSettings]: next });
  return next;
}

// ---- 학습 패널에서 위치를 찾지 못한 넷플릭스 메모 ----

// 넷플릭스 페이지에서 오는 요청이라 키를 지우지 않고 빈 목록으로 덮어쓴다(4.1-4: 메모 외의 키는 지울 수 없다).
export async function setUnplacedNetflixMemos(area: StorageArea, videoId: string, ids: string[]) {
  await area.set({ [KEY.netflixUnplaced(videoId)]: ids });
}

// 영상마다 그 영상에서 위치를 찾지 못한 메모 id. 메모는 자기 영상의 목록으로만 판정한다.
export async function getUnplacedNetflixMemoIds(
  area: StorageArea,
  videoIds: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (videoIds.length === 0) return result;
  const values = await area.get(videoIds.map(KEY.netflixUnplaced));
  videoIds.forEach((videoId) => {
    const v = values[KEY.netflixUnplaced(videoId)];
    if (Array.isArray(v)) {
      result.set(videoId, new Set(v.filter((id): id is string => typeof id === 'string')));
    }
  });
  return result;
}
