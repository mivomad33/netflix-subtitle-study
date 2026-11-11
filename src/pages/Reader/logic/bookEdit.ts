// 등록한 책을 고치는 저장 함수(명세서 book-edit). 화면은 읽어 둔 책 정보를 넘기고,
// 그 사이 다른 탭·기기에서 책이 바뀌었으면 덮어쓰지 않고 오류로 알린다(4.1-6, 4.3-12).
import { BookMeta, ChapterMeta, Memo, ReadingPosition, createId } from '../../../shared/memo/types';
import { KEY } from '../../../shared/storage/keys';
import {
  charCount,
  getBook,
  getBookCharCounts,
  getChapterParagraphs,
  getChaptersParagraphs,
  getPosition,
  listMemosBySource,
} from '../../../shared/storage/repo';
import { StorageArea } from '../../../shared/storage/storageArea';
import { MAX_BOOK_CHARS } from '../../../shared/text/bookText';
import { reattachByParagraph, remapChapter, sameParagraphs } from '../../../shared/text/chapterEdit';
import { isBookMemoAnchored } from './bookMemos';

export const MAX_TITLE_CHARS = 200;

export type BookEditErrorCode =
  | 'book-changed' // 읽은 뒤 책 정보가 다른 곳에서 바뀌었다
  | 'book-missing' // 책이 지워졌다
  | 'chapter-missing' // 장이 지워졌다
  | 'chapter-changed' // 편집을 시작한 뒤 장 본문이 다른 곳에서 바뀌었다
  | 'too-long' // 책 본문이 상한을 넘는다
  | 'last-chapter' // 마지막 남은 장은 지울 수 없다
  | 'invalid'; // 빈 제목 등

export class BookEditError extends Error {
  constructor(
    public code: BookEditErrorCode,
    // book-changed일 때 다시 읽은 책 정보, too-long일 때 저장하려던 글자 수.
    public detail: { book?: BookMeta; chars?: number } = {}
  ) {
    super(code);
    this.name = 'BookEditError';
  }
}

export const isBookEditError = (e: unknown): e is BookEditError => e instanceof BookEditError;

// 책 본문 상한에 걸렸을 때의 안내. chars는 저장하려던 책 전체 글자 수다.
export const tooLongMessage = (chars?: number) =>
  `책 본문이 너무 깁니다. 한 권에 ${MAX_BOOK_CHARS.toLocaleString('ko-KR')}자까지 넣을 수 있습니다${
    chars ? `(저장하면 ${chars.toLocaleString('ko-KR')}자)` : ''
  }.`;

// 제목류 입력을 정리한다. 비거나 너무 길면 null.
export function cleanTitle(value: string, allowEmpty = false): string | null {
  const text = value.trim();
  if (text.length > MAX_TITLE_CHARS) return null;
  if (!text && !allowEmpty) return null;
  return text;
}

// 화면이 읽은 책 정보가 지금 저장된 것과 같은지 본다. 다르면 덮어쓰지 않는다.
async function freshBook(area: StorageArea, loaded: BookMeta): Promise<BookMeta> {
  const fresh = await getBook(area, loaded.id);
  if (!fresh) throw new BookEditError('book-missing');
  if (fresh.updatedAt !== loaded.updatedAt) throw new BookEditError('book-changed', { book: fresh });
  return fresh;
}

const touched = (book: BookMeta, now: number): BookMeta => ({ ...book, updatedAt: Math.max(now, book.updatedAt + 1) });

async function writeBook(area: StorageArea, book: BookMeta, extra: Record<string, unknown> = {}) {
  await area.set({ ...extra, [KEY.book(book.id)]: book });
  return book;
}

export async function updateBookInfo(
  area: StorageArea,
  loaded: BookMeta,
  patch: { title?: string; author?: string },
  now = Date.now()
): Promise<BookMeta> {
  const title = patch.title === undefined ? loaded.title : cleanTitle(patch.title);
  const author = patch.author === undefined ? loaded.author : cleanTitle(patch.author, true);
  if (title === null || author === null) throw new BookEditError('invalid');
  const fresh = await freshBook(area, loaded);
  if (title === fresh.title && author === fresh.author) return fresh;
  return writeBook(area, touched({ ...fresh, title, author }, now));
}

export async function renameChapter(
  area: StorageArea,
  loaded: BookMeta,
  chapterId: string,
  value: string,
  now = Date.now()
): Promise<BookMeta> {
  const title = cleanTitle(value);
  if (title === null) throw new BookEditError('invalid');
  const fresh = await freshBook(area, loaded);
  const chapter = fresh.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new BookEditError('chapter-missing');
  if (chapter.title === title) return fresh;
  return writeBook(
    area,
    touched({ ...fresh, chapters: fresh.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c)) }, now)
  );
}

// 장을 한 칸 위(-1)나 아래(+1)로 옮긴다. 기록은 장 id에 묶여 있어 그대로 따라간다.
export async function moveChapter(
  area: StorageArea,
  loaded: BookMeta,
  chapterId: string,
  direction: -1 | 1,
  now = Date.now()
): Promise<BookMeta> {
  const fresh = await freshBook(area, loaded);
  const from = fresh.chapters.findIndex((c) => c.id === chapterId);
  if (from < 0) throw new BookEditError('chapter-missing');
  const to = from + direction;
  if (to < 0 || to >= fresh.chapters.length) return fresh;
  const chapters = fresh.chapters.slice();
  [chapters[from], chapters[to]] = [chapters[to], chapters[from]];
  return writeBook(area, touched({ ...fresh, chapters }, now));
}

// 책의 장별 글자 수 합계. 글자 수가 없는 예전 책은 본문으로 구한다.
async function totalChars(area: StorageArea, book: BookMeta, exceptChapterId?: string) {
  const counts = (await getBookCharCounts(area, [book])).get(book.id) ?? {};
  return book.chapters.reduce((n, c) => (c.id === exceptChapterId ? n : n + (counts[c.id] ?? 0)), 0);
}

// 그 책의 떨어진 메모 가운데 문단 원문이 paragraphs의 문단과 같은 것을 찾아 붙인다(4.6).
// 다른 장에 붙어 있는지는 그 장의 본문으로 확인하고, 후보가 속한 장만 읽는다(4.6-3).
async function reattach(
  area: StorageArea,
  book: BookMeta,
  chapterId: string,
  paragraphs: string[],
  memos: Memo[],
  // 이 장에 붙어 있어 이미 처리한 메모(다시 보지 않는다).
  handled: Set<string>,
  now: number
): Promise<Memo[]> {
  const texts = new Set(paragraphs);
  const candidates = memos.filter((m) => !handled.has(m.id) && texts.has(m.contextText));
  if (candidates.length === 0) return [];
  const existing = new Set(book.chapters.map((c) => c.id));
  // 지금 있는 다른 장에 속한 메모인가. 그런 메모는 그 장에 붙어 있으면 건드리지 않는다.
  const inOtherChapter = (m: Memo) => !!m.chapterId && m.chapterId !== chapterId && existing.has(m.chapterId);
  const elsewhere = Array.from(new Set(candidates.filter(inOtherChapter).map((m) => m.chapterId!)));
  const bodies =
    elsewhere.length > 0
      ? await getChaptersParagraphs(
          area,
          elsewhere.map((id) => ({ bookId: book.id, chapterId: id }))
        )
      : {};
  const detached = candidates.filter(
    (m) => !inOtherChapter(m) || !isBookMemoAnchored(m, bodies[KEY.chapter(book.id, m.chapterId!)])
  );
  return reattachByParagraph(detached, chapterId, paragraphs, now);
}

export interface NewChapterInput {
  title: string;
  paragraphs: string[];
}

// 장을 맨 끝에 더한다. 새 장의 id는 그 책에서 쓴 적 없는 값이다(4.2-3).
export async function addChapter(
  area: StorageArea,
  loaded: BookMeta,
  input: NewChapterInput,
  now = Date.now()
): Promise<{ book: BookMeta; chapterId: string }> {
  const title = cleanTitle(input.title);
  if (title === null) throw new BookEditError('invalid');
  const fresh = await freshBook(area, loaded);
  const added = charCount(input.paragraphs);
  const chars = (await totalChars(area, fresh)) + added;
  if (chars > MAX_BOOK_CHARS && added > 0) throw new BookEditError('too-long', { chars });
  const chapterId = `c-${createId()}`;
  const memos = await listMemosBySource(area, 'book', fresh.id);
  const attached = await reattach(area, fresh, chapterId, input.paragraphs, memos, new Set(), now);
  const chapter: ChapterMeta = {
    id: chapterId,
    title,
    paragraphCount: input.paragraphs.length,
    charCount: added,
  };
  const book = touched({ ...fresh, chapters: [...fresh.chapters, chapter] }, now);
  const items: Record<string, unknown> = { [KEY.chapter(book.id, chapterId)]: input.paragraphs };
  attached.forEach((m) => {
    items[KEY.memo(m.id)] = m;
  });
  await writeBook(area, book, items);
  return { book, chapterId };
}

// 그 책 그 장에 속한 메모(붙은 것과 떨어진 것 모두).
export const memosOfChapter = (memos: Memo[], bookId: string, chapterId: string) =>
  memos.filter((m) => m.kind === 'book' && m.sourceId === bookId && m.chapterId === chapterId);

// 장을 지운다. 본문과 학습 완료를 지우고, 읽던 위치가 그 장이면 그 자리에 온 장의 처음으로 옮긴다(4.2-5).
export async function deleteChapter(
  area: StorageArea,
  loaded: BookMeta,
  chapterId: string,
  options: { deleteMemos: boolean },
  now = Date.now()
): Promise<BookMeta> {
  const fresh = await freshBook(area, loaded);
  const at = fresh.chapters.findIndex((c) => c.id === chapterId);
  if (at < 0) throw new BookEditError('chapter-missing');
  if (fresh.chapters.length <= 1) throw new BookEditError('last-chapter');
  const chapters = fresh.chapters.filter((c) => c.id !== chapterId);
  const book = touched({ ...fresh, chapters }, now);
  const extra: Record<string, unknown> = {};
  const position = await getPosition(area, fresh.id);
  if (position && position.chapterId === chapterId) {
    const next = chapters[Math.min(at, chapters.length - 1)];
    const moved: ReadingPosition = { bookId: fresh.id, chapterId: next.id, paragraphIndex: 0, updatedAt: now };
    extra[KEY.position(fresh.id)] = moved;
  }
  // 어디서 실패해도 장이 온전히 목록에 있거나 온전히 없게, 세 번에 나눠 쓴다.
  // 1. 메모를 지운다. 여기서 실패하면 아무것도 바뀌지 않았고, 그 뒤에 실패하면 장이 목록에 남아 있어 다시 지울 수 있다.
  if (options.deleteMemos) {
    const memos = memosOfChapter(await listMemosBySource(area, 'book', fresh.id), fresh.id, chapterId);
    if (memos.length > 0) await area.remove(memos.map((m) => KEY.memo(m.id)));
  }
  // 2. 장 목록에서 뺀다(읽던 위치와 함께). 이것이 되면 장은 지워진 것이다.
  await writeBook(area, book, extra);
  // 3. 본문과 학습 완료 기록을 지운다. 실패해도 장은 이미 목록에 없으므로 오류로 올리지 않는다.
  //    남은 본문과 기록은 어디에도 보이지 않고, 책을 지울 때 함께 지워진다(장 id는 다시 쓰지 않는다).
  try {
    await area.remove([KEY.chapter(fresh.id, chapterId), KEY.completion(fresh.id, chapterId)]);
  } catch {
    // 저장 오류 안내는 저장소 층이 화면 위쪽에 보인다.
  }
  return book;
}

// ---- 장 본문 저장 ----

export interface ChapterSaveInput {
  bookId: string;
  chapterId: string;
  // 편집 창을 열 때 읽은 본문. 저장할 때 저장소의 본문이 이것과 다르면 다른 곳에서 바뀐 것이다.
  original: string[];
  after: string[];
}

export interface ChapterSavePlan {
  book: BookMeta;
  // 저장소에 쓸 것이 없다(본문이 그대로다).
  unchanged: boolean;
  // 새 본문에 붙일 수 없어 떨어지는 메모(4.4-3).
  lost: Memo[];
  // 값이 바뀌는 메모: 위치를 옮긴 것과 다시 붙인 것.
  changed: Memo[];
  position: ReadingPosition | null;
  beforeChars: number;
  afterChars: number;
}

// 본문을 저장하면 무엇이 바뀌는지 계산한다. 저장소에는 쓰지 않는다.
export async function planChapterSave(area: StorageArea, input: ChapterSaveInput, now = Date.now()): Promise<ChapterSavePlan> {
  const book = await getBook(area, input.bookId);
  if (!book) throw new BookEditError('book-missing');
  if (!book.chapters.some((c) => c.id === input.chapterId)) throw new BookEditError('chapter-missing');
  const stored = await getChapterParagraphs(area, input.bookId, input.chapterId);
  const beforeChars = charCount(stored);
  const afterChars = charCount(input.after);
  // 저장된 본문이 이미 저장하려는 글과 같으면 쓸 것이 없다(저장이 끝난 뒤 다시 누른 경우 포함).
  if (sameParagraphs(stored, input.after)) {
    return { book, unchanged: true, lost: [], changed: [], position: null, beforeChars, afterChars };
  }
  if (!sameParagraphs(stored, input.original)) throw new BookEditError('chapter-changed');
  // 상한은 글이 늘어나는 저장만 막는다. 이미 상한을 넘은 책도 줄이거나 같은 길이로 고칠 수 있어야 한다.
  const chars = (await totalChars(area, book, input.chapterId)) + afterChars;
  if (chars > MAX_BOOK_CHARS && afterChars > beforeChars) throw new BookEditError('too-long', { chars });

  const memos = await listMemosBySource(area, 'book', input.bookId);
  const here = memosOfChapter(memos, input.bookId, input.chapterId).filter((m) => isBookMemoAnchored(m, stored));
  const remap = remapChapter(stored, input.after, here, now);
  // 이번에 떨어진 메모도 같은 글의 문단이 다른 자리에 있으면 거기에 붙는다(장 안에서 문단을 옮긴 경우).
  const lostIds = new Set(remap.lost.map((m) => m.id));
  const settled = new Set(here.filter((m) => !lostIds.has(m.id)).map((m) => m.id));
  const attached = await reattach(area, book, input.chapterId, input.after, memos, settled, now);
  const attachedIds = new Set(attached.map((m) => m.id));

  const current = await getPosition(area, input.bookId);
  const position =
    current && current.chapterId === input.chapterId
      ? { ...current, paragraphIndex: remap.mapParagraph(current.paragraphIndex), updatedAt: now }
      : null;
  return {
    book,
    unchanged: false,
    lost: remap.lost.filter((m) => !attachedIds.has(m.id)),
    changed: [...remap.moved, ...attached],
    position,
    beforeChars,
    afterChars,
  };
}

// 본문과 그에 따라 바뀌는 책 정보·메모·읽던 위치를 한 번에 쓴다(4.3-9). 쓰기 직전에 계산한다.
// confirm이 거짓을 돌려주면 쓰지 않고 계획만 돌려준다(saved: false). 화면이 사용자에게 확인받은 뒤 다시 부른다.
export async function saveChapterBody(
  area: StorageArea,
  input: ChapterSaveInput,
  now = Date.now(),
  confirm?: (plan: ChapterSavePlan) => boolean
): Promise<ChapterSavePlan & { saved: boolean }> {
  const plan = await planChapterSave(area, input, now);
  if (plan.unchanged) return { ...plan, saved: true };
  if (confirm && !confirm(plan)) return { ...plan, saved: false };
  const book = touched(
    {
      ...plan.book,
      chapters: plan.book.chapters.map((c) =>
        c.id === input.chapterId ? { ...c, paragraphCount: input.after.length, charCount: plan.afterChars } : c
      ),
    },
    now
  );
  const items: Record<string, unknown> = { [KEY.chapter(input.bookId, input.chapterId)]: input.after };
  plan.changed.forEach((m) => {
    items[KEY.memo(m.id)] = m;
  });
  if (plan.position) items[KEY.position(input.bookId)] = plan.position;
  await writeBook(area, book, items);
  return { ...plan, book, saved: true };
}
