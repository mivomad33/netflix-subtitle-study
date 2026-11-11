import { describe, expect, it } from 'vitest';
import { Memo } from '../../../shared/memo/types';
import { KEY } from '../../../shared/storage/keys';
import {
  getBook,
  getChapterParagraphs,
  getMemo,
  getPosition,
  listCompletions,
  listMemos,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
} from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { MAX_BOOK_CHARS } from '../../../shared/text/bookText';
import {
  BookEditError,
  addChapter,
  deleteChapter,
  moveChapter,
  planChapterSave,
  renameChapter,
  saveChapterBody,
  updateBookInfo,
} from './bookEdit';
import { isBookMemoAnchored } from './bookMemos';

// 직접 쓴 예시 글.
const CH1 = ['The lamp glowed over a quiet desk.', 'A cat slept beside teh warm window.', 'Rain tapped softly on the roof.'];
const CH2 = ['Two begins with a walk by the river.', 'Two continues past the old mill.'];
const CH3 = ['Three is short and quiet.'];

async function seed(area: StorageArea, id = 'bk1') {
  await saveBook(area, { id, title: 'Lamp and River', author: 'Test Author', createdAt: 1, updatedAt: 1 }, [
    { id: 'ch1', title: 'Opening Night', paragraphs: CH1 },
    { id: 'ch2', title: 'Second Wind', paragraphs: CH2 },
    { id: 'ch3', title: 'Last Light', paragraphs: CH3 },
  ]);
  return (await getBook(area, id))!;
}

const memoAt = (paragraphs: string[], chapterId: string, paragraphIndex: number, quote: string, extra: Partial<Memo> = {}): Memo => {
  const start = paragraphs[paragraphIndex].indexOf(quote);
  return bookMemo({
    id: `m-${chapterId}-${paragraphIndex}-${quote}`,
    sourceId: 'bk1',
    chapterId,
    paragraphIndex,
    contextText: paragraphs[paragraphIndex],
    start,
    end: start + quote.length,
    quote,
    note: 'my note',
    ...extra,
  });
};

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof BookEditError ? e.code : `other: ${String(e)}`;
  }
  return 'ok';
};

describe('book-edit 4.1 book info, chapter titles and order', () => {
  it('4.1-2 saves the title and author, rejects an empty or too long title', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const next = await updateBookInfo(area, book, { title: '  New Title ', author: '' });
    expect(next).toMatchObject({ title: 'New Title', author: '' });
    expect((await getBook(area, 'bk1'))!.title).toBe('New Title');
    expect(next.updatedAt).toBeGreaterThan(book.updatedAt);
    expect(await code(updateBookInfo(area, next, { title: '   ' }))).toBe('invalid');
    expect(await code(updateBookInfo(area, next, { title: 'x'.repeat(201) }))).toBe('invalid');
    expect((await updateBookInfo(area, next, { title: 'x'.repeat(200) })).title).toHaveLength(200);
  });

  it('4.1-3 renames a chapter without touching any record', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const memo = memoAt(CH1, 'ch1', 0, 'lamp');
    await putMemo(area, memo);
    await setChapterDone(area, 'bk1', 'ch1', true, 5);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 2, updatedAt: 5 });
    const next = await renameChapter(area, book, 'ch1', 'First Night');
    expect(next.chapters.map((c) => c.title)).toEqual(['First Night', 'Second Wind', 'Last Light']);
    expect(await getMemo(area, memo.id)).toEqual(memo);
    expect(await getPosition(area, 'bk1')).toMatchObject({ chapterId: 'ch1', paragraphIndex: 2, updatedAt: 5 });
    expect(await listCompletions(area, 'bk1')).toEqual([{ bookId: 'bk1', chapterId: 'ch1', done: true, updatedAt: 5 }]);
    expect(await code(renameChapter(area, next, 'ch1', ''))).toBe('invalid');
    expect(await code(renameChapter(area, next, 'ch1', 'y'.repeat(201)))).toBe('invalid');
  });

  it('4.1-4 moves a chapter and keeps records on the chapter', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const memo = memoAt(CH2, 'ch2', 1, 'old mill');
    await putMemo(area, memo);
    await setChapterDone(area, 'bk1', 'ch2', true, 5);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 5 });
    const next = await moveChapter(area, book, 'ch2', -1);
    expect(next.chapters.map((c) => c.id)).toEqual(['ch2', 'ch1', 'ch3']);
    expect(await getMemo(area, memo.id)).toEqual(memo);
    expect(isBookMemoAnchored(memo, await getChapterParagraphs(area, 'bk1', 'ch2'))).toBe(true);
    expect(await getPosition(area, 'bk1')).toMatchObject({ chapterId: 'ch2', paragraphIndex: 1 });
    expect((await listCompletions(area, 'bk1'))[0]).toMatchObject({ chapterId: 'ch2', done: true });
    // 첫 장을 더 위로, 마지막 장을 더 아래로 옮기면 그대로다.
    expect((await moveChapter(area, next, 'ch2', -1)).chapters.map((c) => c.id)).toEqual(['ch2', 'ch1', 'ch3']);
    expect((await moveChapter(area, next, 'ch3', 1)).chapters.map((c) => c.id)).toEqual(['ch2', 'ch1', 'ch3']);
  });

  it('4.1-6 does not overwrite a book that changed elsewhere', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    // 다른 탭이 장을 더했다.
    const { book: elsewhere } = await addChapter(area, book, { title: 'Added Elsewhere', paragraphs: ['Elsewhere text.'] });
    let caught: unknown;
    await moveChapter(area, book, 'ch2', -1).catch((e) => (caught = e));
    expect(caught).toBeInstanceOf(BookEditError);
    expect((caught as BookEditError).code).toBe('book-changed');
    expect((caught as BookEditError).detail.book).toEqual(elsewhere);
    expect((await getBook(area, 'bk1'))!.chapters.map((c) => c.title)).toEqual([
      'Opening Night',
      'Second Wind',
      'Last Light',
      'Added Elsewhere',
    ]);
    await area.remove([KEY.book('bk1')]);
    expect(await code(moveChapter(area, elsewhere, 'ch2', -1))).toBe('book-missing');
  });
});

describe('book-edit 4.2 adding and deleting chapters', () => {
  it('4.2-1, 4.2-2 adds a chapter at the end with its counts and leaves other records alone', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const memo = memoAt(CH1, 'ch1', 0, 'lamp');
    await putMemo(area, memo);
    const { book: next, chapterId } = await addChapter(area, book, { title: ' Extra ', paragraphs: ['Chapter 3', 'More text here.'] });
    expect(next.chapters).toHaveLength(4);
    expect(next.chapters[3]).toEqual({ id: chapterId, title: 'Extra', paragraphCount: 2, charCount: 24 });
    expect(await getChapterParagraphs(area, 'bk1', chapterId)).toEqual(['Chapter 3', 'More text here.']);
    expect(await listCompletions(area, 'bk1')).toEqual([]);
    expect(await getMemo(area, memo.id)).toEqual(memo);
    expect(await code(addChapter(area, next, { title: ' ', paragraphs: ['x'] }))).toBe('invalid');
    // 빈 본문도 된다.
    const empty = await addChapter(area, next, { title: 'Empty', paragraphs: [] });
    expect(empty.book.chapters[4]).toMatchObject({ paragraphCount: 0, charCount: 0 });
  });

  it('4.2-3 never reuses a chapter id, even after deleting and reloading', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    await putMemo(area, memoAt(CH3, 'ch3', 0, 'short'));
    await setChapterDone(area, 'bk1', 'ch3', true, 5);
    await deleteChapter(area, book, 'ch3', { deleteMemos: false });
    const reloaded = (await getBook(area, 'bk1'))!;
    const { book: next, chapterId } = await addChapter(area, reloaded, { title: 'New', paragraphs: ['Fresh words.'] });
    expect(next.chapters.map((c) => c.id)).not.toContain('ch3');
    expect(chapterId).not.toBe('ch3');
    const second = await addChapter(area, next, { title: 'New 2', paragraphs: [] });
    expect(second.chapterId).not.toBe(chapterId);
    // 남긴 메모는 새 장의 것이 아니다.
    expect((await listMemos(area)).every((m) => m.chapterId !== chapterId)).toBe(true);
  });

  it('4.2-5 deletes the body and completion, moves the position, and leaves look-alike records', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    await seed(area, 'bk2');
    await setChapterDone(area, 'bk1', 'ch2', true, 5);
    await setChapterDone(area, 'bk1', 'ch1', true, 5);
    await setChapterDone(area, 'bk2', 'ch2', true, 5);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 5 });
    await setPosition(area, { bookId: 'bk2', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 5 });
    const next = await deleteChapter(area, book, 'ch2', { deleteMemos: false }, 100);
    expect(next.chapters.map((c) => c.id)).toEqual(['ch1', 'ch3']);
    const keys = await area.getKeys();
    expect(keys).not.toContain(KEY.chapter('bk1', 'ch2'));
    expect(keys).not.toContain(KEY.completion('bk1', 'ch2'));
    expect(keys).toContain(KEY.chapter('bk1', 'ch1'));
    expect(keys).toContain(KEY.completion('bk1', 'ch1'));
    expect(keys).toContain(KEY.chapter('bk2', 'ch2'));
    expect(keys).toContain(KEY.completion('bk2', 'ch2'));
    // 그 자리에 온 장(다음 장)의 처음.
    expect(await getPosition(area, 'bk1')).toEqual({ bookId: 'bk1', chapterId: 'ch3', paragraphIndex: 0, updatedAt: 100 });
    expect(await getPosition(area, 'bk2')).toMatchObject({ chapterId: 'ch2', paragraphIndex: 1 });
  });

  it('4.2-5 moves the position to the previous chapter when the last one is deleted, and keeps it otherwise', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch3', paragraphIndex: 0, updatedAt: 5 });
    const next = await deleteChapter(area, book, 'ch3', { deleteMemos: false }, 100);
    expect(await getPosition(area, 'bk1')).toMatchObject({ chapterId: 'ch2', paragraphIndex: 0 });
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 6 });
    await deleteChapter(area, next, 'ch1', { deleteMemos: false }, 200);
    expect(await getPosition(area, 'bk1')).toMatchObject({ chapterId: 'ch2', paragraphIndex: 1, updatedAt: 6 });
  });

  it('4.2-6 keeps or deletes only the memos of that chapter of that book', async () => {
    const make = async (deleteMemos: boolean) => {
      const area = createMemoryArea();
      const book = await seed(area);
      await seed(area, 'bk2');
      const inChapter = memoAt(CH2, 'ch2', 0, 'river');
      const detachedInChapter = memoAt(CH2, 'ch2', 1, 'mill', { id: 'detached', contextText: 'An older text with a mill.', start: 21, end: 25 });
      const otherChapter = memoAt(CH1, 'ch1', 0, 'lamp');
      const otherBook = memoAt(CH2, 'ch2', 0, 'river', { id: 'other-book', sourceId: 'bk2' });
      const netflix = netflixMemo({ id: 'nf' });
      for (const m of [inChapter, detachedInChapter, otherChapter, otherBook, netflix]) await putMemo(area, m);
      await deleteChapter(area, book, 'ch2', { deleteMemos });
      return { ids: (await listMemos(area)).map((m) => m.id).sort(), inChapter, area };
    };
    const kept = await make(false);
    expect(kept.ids).toHaveLength(5);
    expect(await getMemo(kept.area, kept.inChapter.id)).toEqual(kept.inChapter);
    const removed = await make(true);
    expect(removed.ids).toEqual(['m-ch1-0-lamp', 'nf', 'other-book']);
  });

  it('4.2-7 refuses to delete the only chapter', async () => {
    const area = createMemoryArea();
    await saveBook(area, { id: 'solo', title: 'Solo', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'ch1', title: 'Only', paragraphs: ['One line.'] },
    ]);
    const book = (await getBook(area, 'solo'))!;
    expect(await code(deleteChapter(area, book, 'ch1', { deleteMemos: true }))).toBe('last-chapter');
    expect(await getChapterParagraphs(area, 'solo', 'ch1')).toEqual(['One line.']);
  });
});

describe('book-edit 4.3 saving a chapter body', () => {
  const input = (after: string[], original = CH1) => ({ bookId: 'bk1', chapterId: 'ch1', original, after });

  it('4.3-4 writes nothing when the paragraphs are the same', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const memo = memoAt(CH1, 'ch1', 0, 'lamp');
    await putMemo(area, memo);
    let writes = 0;
    const counting: StorageArea = {
      ...area,
      set: (items) => {
        writes++;
        return area.set(items);
      },
      remove: (keys) => {
        writes++;
        return area.remove(keys);
      },
    };
    const plan = await saveChapterBody(counting, input(CH1.slice()));
    expect(plan.unchanged).toBe(true);
    expect(writes).toBe(0);
    expect(await getBook(area, 'bk1')).toEqual(book);
    expect(await getMemo(area, memo.id)).toEqual(memo);
  });

  it('4.3-5, 4.4-1, 4.4-2 fixes a typo: counts, moved memos, completion and one write', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const before = memoAt(CH1, 'ch1', 1, 'cat');
    const onTypo = memoAt(CH1, 'ch1', 1, 'teh warm');
    const after = memoAt(CH1, 'ch1', 1, 'window');
    const untouched = memoAt(CH1, 'ch1', 2, 'roof');
    for (const m of [before, onTypo, after, untouched]) await putMemo(area, m);
    await setChapterDone(area, 'bk1', 'ch1', true, 5);
    let writes = 0;
    const counting: StorageArea = {
      ...area,
      set: (items) => {
        writes++;
        return area.set(items);
      },
    };
    const fixed = [CH1[0], 'A cat slept beside the warm window.', CH1[2]];
    const plan = await saveChapterBody(counting, input(fixed), 900);
    expect(plan.lost).toEqual([]);
    expect(writes).toBe(1);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(fixed);
    const saved = (await getBook(area, 'bk1'))!;
    expect(saved.updatedAt).toBeGreaterThan(book.updatedAt);
    expect(saved.chapters[0]).toMatchObject({ paragraphCount: 3, charCount: fixed.join('').length });
    expect(saved.chapters[1]).toEqual(book.chapters[1]);
    expect(await getMemo(area, before.id)).toMatchObject({ start: before.start, quote: 'cat', contextText: fixed[1], note: 'my note' });
    expect(await getMemo(area, onTypo.id)).toMatchObject({ quote: 'the warm', start: onTypo.start, end: onTypo.end, contextText: fixed[1] });
    expect(await getMemo(area, after.id)).toMatchObject({ quote: 'window', start: after.start, contextText: fixed[1] });
    expect(await getMemo(area, untouched.id)).toEqual(untouched);
    for (const m of await listMemos(area)) expect(isBookMemoAnchored(m, fixed)).toBe(true);
    expect((await listCompletions(area, 'bk1'))[0]).toMatchObject({ chapterId: 'ch1', done: true });
  });

  it('4.3-3 can save a body with no paragraphs', async () => {
    const area = createMemoryArea();
    await seed(area);
    await saveChapterBody(area, input([]));
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual([]);
    expect((await getBook(area, 'bk1'))!.chapters[0]).toMatchObject({ paragraphCount: 0, charCount: 0 });
  });

  it('4.3-8 refuses a save that takes the book over the limit, and allows exactly the limit', async () => {
    const area = createMemoryArea();
    await seed(area);
    const others = [...CH2, ...CH3].join('').length;
    const exact = ['x'.repeat(MAX_BOOK_CHARS - others)];
    let caught: unknown;
    await saveChapterBody(area, input([`${exact[0]}y`])).catch((e) => (caught = e));
    expect((caught as BookEditError).code).toBe('too-long');
    expect((caught as BookEditError).detail.chars).toBe(MAX_BOOK_CHARS + 1);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
    await saveChapterBody(area, input(exact));
    expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[0]).toHaveLength(MAX_BOOK_CHARS - others);
  });

  it('4.3-8 lets a book that is already over the limit be shortened or kept the same length', async () => {
    const area = createMemoryArea();
    const big = ['x'.repeat(MAX_BOOK_CHARS), 'tail words here'];
    await saveBook(area, { id: 'bk1', title: 'Big', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'ch1', title: 'One', paragraphs: big },
      { id: 'ch2', title: 'Two', paragraphs: ['more'] },
    ]);
    const same = [big[0], 'tail wards here'];
    await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: big, after: same });
    expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[1]).toBe('tail wards here');
    expect(await code(saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: same, after: [big[0], 'tail wards here!'] }))).toBe('too-long');
    await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: same, after: [big[0], 'tail'] });
    expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[1]).toBe('tail');
  });

  it('4.3-14 saves a one-word fix in a chapter of a million characters', async () => {
    const area = createMemoryArea();
    const paragraphs = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i} ${'steady words fill this line '.repeat(18)}`.trim());
    expect(paragraphs.join('').length).toBeGreaterThan(1_000_000);
    await saveBook(area, { id: 'bk1', title: 'Long', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'ch1', title: 'One', paragraphs },
    ]);
    const start = paragraphs[1500].indexOf('steady');
    await putMemo(
      area,
      bookMemo({ id: 'far', sourceId: 'bk1', chapterId: 'ch1', paragraphIndex: 1500, contextText: paragraphs[1500], start, end: start + 6, quote: 'steady' })
    );
    const after = paragraphs.slice();
    after[1000] = after[1000].replace('steady', 'stedy');
    after.unshift('A new opening.');
    const plan = await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: paragraphs, after });
    expect(plan.lost).toEqual([]);
    expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[1001]).toBe(after[1001]);
    expect(await getMemo(area, 'far')).toMatchObject({ paragraphIndex: 1501, quote: 'steady' });
  });

  it('4.2-1, 4.3-8 applies the same limit when adding a chapter', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const used = [...CH1, ...CH2, ...CH3].join('').length;
    expect(await code(addChapter(area, book, { title: 'Big', paragraphs: ['x'.repeat(MAX_BOOK_CHARS - used + 1)] }))).toBe('too-long');
    expect((await addChapter(area, book, { title: 'Big', paragraphs: ['x'.repeat(MAX_BOOK_CHARS - used)] })).book.chapters).toHaveLength(4);
  });

  it('4.3-12 refuses to save when the body changed elsewhere after the editor opened', async () => {
    const area = createMemoryArea();
    await seed(area);
    const elsewhere = [CH1[0], 'Changed in another tab.', CH1[2]];
    await area.set({ [KEY.chapter('bk1', 'ch1')]: elsewhere });
    expect(await code(saveChapterBody(area, input([CH1[0], 'My edit.', CH1[2]])))).toBe('chapter-changed');
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(elsewhere);
  });

  it('4.3-12 treats a body that already equals the edit as saved, not as a conflict', async () => {
    const area = createMemoryArea();
    await seed(area);
    const after = [CH1[0], 'My edit.', CH1[2]];
    await saveChapterBody(area, input(after));
    // 저장이 끝났는데 화면이 실패로 알고 같은 글을 다시 저장하는 경우.
    const again = await saveChapterBody(area, input(after));
    expect(again.unchanged).toBe(true);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(after);
  });

  it('4.3-12 reports a deleted chapter or book', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    await deleteChapter(area, book, 'ch1', { deleteMemos: false });
    expect(await code(saveChapterBody(area, input(['x'])))).toBe('chapter-missing');
    await area.remove([KEY.book('bk1')]);
    expect(await code(saveChapterBody(area, input(['x'])))).toBe('book-missing');
  });

  it('4.3-12 carries over a memo added elsewhere after the editor opened', async () => {
    const area = createMemoryArea();
    await seed(area);
    // 편집 창을 연 뒤 다른 화면에서 단 메모.
    const late = memoAt(CH1, 'ch1', 2, 'Rain');
    await putMemo(area, late);
    const after = ['A new opening line.', ...CH1];
    await saveChapterBody(area, input(after));
    const saved = (await getMemo(area, late.id))!;
    expect(saved.paragraphIndex).toBe(3);
    expect(isBookMemoAnchored(saved, after)).toBe(true);
  });

  it('4.4-3, 4.4-6, 4.4-7 plans lost memos and keeps them unchanged after saving', async () => {
    const area = createMemoryArea();
    await seed(area);
    const lost = memoAt(CH1, 'ch1', 2, 'Rain tapped');
    const kept = memoAt(CH1, 'ch1', 0, 'lamp');
    const alreadyDetached = memoAt(CH1, 'ch1', 0, 'desk', { id: 'old-detached', contextText: 'An earlier desk sentence.', start: 11, end: 15 });
    const otherChapter = memoAt(CH2, 'ch2', 0, 'river');
    const otherBook = memoAt(CH1, 'ch1', 2, 'Rain tapped', { id: 'other-book', sourceId: 'bk2' });
    const netflix = netflixMemo({ id: 'nf' });
    for (const m of [lost, kept, alreadyDetached, otherChapter, otherBook, netflix]) await putMemo(area, m);
    const after = [CH1[0], CH1[1]];
    const plan = await planChapterSave(area, input(after));
    expect(plan.lost.map((m) => m.id)).toEqual([lost.id]);
    expect(plan.changed).toEqual([]);
    // 계획만으로는 아무것도 쓰지 않는다.
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
    await saveChapterBody(area, input(after));
    for (const m of [lost, kept, alreadyDetached, otherChapter, otherBook, netflix]) expect(await getMemo(area, m.id)).toEqual(m);
    expect(isBookMemoAnchored((await getMemo(area, lost.id))!, after)).toBe(false);
  });

  it('4.5-1 moves the reading position with the paragraph and leaves another chapter position alone', async () => {
    const area = createMemoryArea();
    await seed(area);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 2, updatedAt: 5 });
    await saveChapterBody(area, input(['New a.', 'New b.', ...CH1]), 700);
    expect(await getPosition(area, 'bk1')).toEqual({ bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 4, updatedAt: 700 });
    const now = await getChapterParagraphs(area, 'bk1', 'ch1');
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 800 });
    await saveChapterBody(area, input(now.slice(1), now));
    expect(await getPosition(area, 'bk1')).toEqual({ bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 800 });
  });
});

describe('book-edit 4.6 detached memos follow moved text', () => {
  it('4.6-1 re-attaches after cutting a paragraph from one chapter and pasting it into another', async () => {
    const area = createMemoryArea();
    await seed(area);
    const memo = memoAt(CH1, 'ch1', 1, 'cat slept');
    await putMemo(area, memo);
    const cut = await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: [CH1[0], CH1[2]] });
    expect(cut.lost.map((m) => m.id)).toEqual([memo.id]);
    const pasted = [CH2[0], CH1[1], CH2[1]];
    const paste = await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch2', original: CH2, after: pasted }, 900);
    expect(paste.lost).toEqual([]);
    const saved = (await getMemo(area, memo.id))!;
    expect(saved).toMatchObject({ chapterId: 'ch2', paragraphIndex: 1, start: memo.start, end: memo.end, quote: 'cat slept', note: 'my note' });
    expect(isBookMemoAnchored(saved, pasted)).toBe(true);
  });

  it('4.6-1 re-attaches a memo kept from a deleted chapter when its paragraph is added as a new chapter', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const memo = memoAt(CH3, 'ch3', 0, 'short');
    await putMemo(area, memo);
    const next = await deleteChapter(area, book, 'ch3', { deleteMemos: false });
    const { chapterId } = await addChapter(area, next, { title: 'Back Again', paragraphs: ['Intro.', CH3[0]] });
    expect(await getMemo(area, memo.id)).toMatchObject({ chapterId, paragraphIndex: 1, quote: 'short' });
  });

  it('4.6-1 keeps a memo on a paragraph moved inside the chapter in one save', async () => {
    const area = createMemoryArea();
    await seed(area);
    const memo = memoAt(CH1, 'ch1', 0, 'lamp');
    await putMemo(area, memo);
    const after = [CH1[1], CH1[2], CH1[0]];
    const plan = await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after });
    expect(plan.lost).toEqual([]);
    expect(await getMemo(area, memo.id)).toMatchObject({ chapterId: 'ch1', paragraphIndex: 2, quote: 'lamp' });
  });

  it('4.6-2 does not attach to duplicate paragraphs, near matches, attached memos or other books', async () => {
    const area = createMemoryArea();
    const book = await seed(area);
    const detached = memoAt(CH3, 'gone', 0, 'short', { id: 'detached' });
    const attachedElsewhere = memoAt(CH1, 'ch1', 0, 'lamp');
    const otherBook = memoAt(CH3, 'gone', 0, 'short', { id: 'other-book', sourceId: 'bk2' });
    for (const m of [detached, attachedElsewhere, otherBook]) await putMemo(area, m);
    // 같은 글의 문단이 둘이면 붙이지 않는다.
    const twice = await addChapter(area, book, { title: 'Twice', paragraphs: [CH3[0], CH3[0]] });
    expect(await getMemo(area, 'detached')).toEqual(detached);
    // 글자 하나가 다르면 붙이지 않는다.
    const near = await addChapter(area, twice.book, { title: 'Near', paragraphs: ['Three is short and quiet!'] });
    expect(await getMemo(area, 'detached')).toEqual(detached);
    // 다른 장에 붙어 있는 메모는 같은 글을 다른 장에 복사해도 그대로다. 다른 책의 메모도 그대로다.
    await addChapter(area, near.book, { title: 'Copy', paragraphs: [CH1[0], 'Three is short and quiet.'] });
    expect(await getMemo(area, attachedElsewhere.id)).toEqual(attachedElsewhere);
    expect(await getMemo(area, 'other-book')).toEqual(otherBook);
    expect((await getMemo(area, 'detached'))!.chapterId).not.toBe('gone');
  });
});
