import { describe, it, expect } from 'vitest';
import { createMemoryArea } from './storageArea';
import {
  countBookMemos,
  deleteBook,
  getChapterParagraphs,
  getMemo,
  getPosition,
  getReaderSettings,
  listBooks,
  listMemos,
  listMemosBySource,
  putMemo,
  saveBook,
  setPosition,
} from './repo';
import { netflixMemo, bookMemo } from './testFixtures';

describe('repo', () => {
  it('stores netflix and book memos with all fields', async () => {
    const area = createMemoryArea();
    const n = netflixMemo({ id: 'n1' });
    const b = bookMemo({ id: 'b1' });
    await putMemo(area, n);
    await putMemo(area, b);
    expect(await getMemo(area, 'n1')).toEqual(n);
    expect(await getMemo(area, 'b1')).toEqual(b);
    expect((await listMemos(area)).length).toBe(2);
    expect((await listMemosBySource(area, 'netflix', 'v1')).map((m) => m.id)).toEqual(['n1']);
  });

  it('rejects invalid memos', async () => {
    const area = createMemoryArea();
    await expect(putMemo(area, { ...netflixMemo(), end: 999 })).rejects.toThrow();
  });

  it('keeps both memos when two writers save different memos alternately', async () => {
    const area = createMemoryArea();
    // 넷플릭스 쪽과 리더 쪽이 같은 저장소에 번갈아 쓴다.
    await putMemo(area, netflixMemo({ id: 'from-netflix' }));
    await putMemo(area, bookMemo({ id: 'from-reader' }));
    await putMemo(area, netflixMemo({ id: 'from-netflix', note: 'edited' }));
    const ids = (await listMemos(area)).map((m) => m.id).sort();
    expect(ids).toEqual(['from-netflix', 'from-reader']);
    expect((await getMemo(area, 'from-netflix'))!.note).toBe('edited');
  });

  it('saves a book and deletes only that book with its memos and position', async () => {
    const area = createMemoryArea();
    const now = 1;
    await saveBook(area, { id: 'bk1', title: 'One', author: '', createdAt: now, updatedAt: now }, [
      { id: 'c1', title: 'Chapter 1', paragraphs: ['A.', 'B.'] },
    ]);
    await saveBook(area, { id: 'bk2', title: 'Two', author: '', createdAt: now, updatedAt: 2 }, [
      { id: 'c1', title: 'Chapter 1', paragraphs: ['C.'] },
    ]);
    await putMemo(area, bookMemo({ id: 'm1', sourceId: 'bk1' }));
    await putMemo(area, bookMemo({ id: 'm2', sourceId: 'bk2' }));
    await putMemo(area, netflixMemo({ id: 'n1' }));
    await setPosition(area, { bookId: 'bk1', chapterId: 'c1', paragraphIndex: 1, updatedAt: 1 });

    expect((await listBooks(area)).map((b) => b.id)).toEqual(['bk2', 'bk1']);
    expect(await getChapterParagraphs(area, 'bk1', 'c1')).toEqual(['A.', 'B.']);
    expect(await countBookMemos(area, 'bk1')).toBe(1);

    await deleteBook(area, 'bk1');
    expect((await listBooks(area)).map((b) => b.id)).toEqual(['bk2']);
    expect(await getChapterParagraphs(area, 'bk1', 'c1')).toEqual([]);
    expect(await getPosition(area, 'bk1')).toBeNull();
    expect((await listMemos(area)).map((m) => m.id).sort()).toEqual(['m2', 'n1']);
    expect(await getChapterParagraphs(area, 'bk2', 'c1')).toEqual(['C.']);
  });

  it('falls back to default reader settings for broken values', async () => {
    const area = createMemoryArea({ 'reader:settings': { fontSize: 'big' } });
    expect(await getReaderSettings(area)).toEqual({ fontSize: 14 });
  });
});
