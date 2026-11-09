import { describe, it, expect, vi } from 'vitest';
import { MakeArea } from './repoCases';
import {
  deleteBook,
  getBookCharCounts,
  getReaderSettings,
  listBooks,
  listCompletions,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
  updateReaderSettings,
} from './repo';
import { KEY } from './keys';
import { bookMemo } from './testFixtures';
import { BookMeta } from '../memo/types';



// 메모리 저장소와 Firestore(에뮬레이터) 저장소에 같은 경우를 돌린다(4.2-2).
export function defineStudyProgressCases(makeArea: MakeArea) {
  // 테스트용 책. 글은 직접 쓴 문장이다.
  const meta = (id: string, updatedAt = 1) => ({ id, title: id, author: '', createdAt: 1, updatedAt });
  const chapters = [
    { id: 'c1', title: 'Preface', paragraphs: ['Hi.'] },
    { id: 'c2', title: 'One', paragraphs: ['The river ran fast.', 'Stones shone under it.'] },
  ];

  const chapterReads = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.flatMap((call) => call[0] as string[]).filter((k) => k.startsWith('bookch:'));

  // 이 기능 전에 저장한 모양: 장 정보에 글자 수가 없다.
  const withoutCounts = (book: BookMeta): BookMeta => ({
    ...book,
    chapters: book.chapters.map(({ charCount: _c, ...rest }) => rest),
  });

  describe('chapter completion', () => {
    it('4.1-3 keeps both chapters when two writers mark different chapters alternately', async () => {
      const area = await makeArea();
      await setChapterDone(area, 'bk1', 'c1', true, 10);
      await setChapterDone(area, 'bk1', 'c2', true, 11);
      await setChapterDone(area, 'bk1', 'c1', false, 12);
      await setChapterDone(area, 'bk1', 'c1', true, 13);
      const done = (await listCompletions(area, 'bk1')).filter((c) => c.done).map((c) => c.chapterId);
      expect(done.sort()).toEqual(['c1', 'c2']);
    });

    it('lists only the asked book and skips broken values', async () => {
      const area = await makeArea({
        [KEY.completion('bk1', 'c9')]: { bookId: 'bk1', chapterId: 'c9', done: 'yes', updatedAt: 1 },
        [KEY.completion('bk1', 'c8')]: { bookId: 'other', chapterId: 'c8', done: true, updatedAt: 1 },
      });
      await setChapterDone(area, 'bk1', 'c1', true, 1);
      await setChapterDone(area, 'bk2', 'c1', true, 1);
      expect((await listCompletions(area, 'bk1')).map((c) => c.chapterId)).toEqual(['c1']);
      expect((await listCompletions(area)).length).toBe(2);
    });
  });

  describe('chapter character counts', () => {
    it('4.2-4 saveBook stores counts so the first read does not open chapter text', async () => {
      const area = await makeArea();
      const book = await saveBook(area, meta('bk1'), chapters);
      const get = vi.spyOn(area, 'get');
      const counts = await getBookCharCounts(area, [book]);
      expect(counts.get('bk1')).toEqual({ c1: 3, c2: 41 });
      expect(chapterReads(get)).toEqual([]);
    });

    it('4.2-4 counts an old book without the count once and then reuses it', async () => {
      const area = await makeArea();
      const old = withoutCounts(await saveBook(area, meta('bk1'), chapters));
      await area.set({ [KEY.book('bk1')]: old });
      const get = vi.spyOn(area, 'get');
      expect((await getBookCharCounts(area, [old])).get('bk1')).toEqual({ c1: 3, c2: 41 });
      expect(chapterReads(get).sort()).toEqual(['bookch:bk1:c1', 'bookch:bk1:c2']);
      // 채운 책 정보를 다시 읽어 쓰면 본문을 읽지 않는다. 다른 정보는 그대로다.
      const [again] = await listBooks(area);
      expect(again).toEqual({ ...old, chapters: old.chapters.map((c, i) => ({ ...c, charCount: [3, 41][i] })) });
      get.mockClear();
      expect((await getBookCharCounts(area, [again])).get('bk1')).toEqual({ c1: 3, c2: 41 });
      expect(chapterReads(get)).toEqual([]);
    });

    it('does not overwrite a book another tab replaced meanwhile', async () => {
      const area = await makeArea();
      const old = withoutCounts(await saveBook(area, meta('bk1', 1), chapters));
      // 다른 탭(백업 가져오기)이 더 새 책으로 바꿨다.
      const newer: BookMeta = { ...meta('bk1', 5), chapters: [{ id: 'c1', title: 'Preface', paragraphCount: 1 }] };
      await area.set({ [KEY.book('bk1')]: newer });
      await getBookCharCounts(area, [old]);
      expect((await area.get([KEY.book('bk1')]))[KEY.book('bk1')]).toEqual(newer);
    });
  });

  describe('deleteBook with study progress', () => {
    it('4.5-2 removes completion and counts of that book only', async () => {
      const area = await makeArea();
      await saveBook(area, meta('bk1'), chapters);
      await saveBook(area, meta('bk2'), chapters);
      await setChapterDone(area, 'bk1', 'c1', true, 1);
      await setChapterDone(area, 'bk2', 'c2', true, 1);
      await setPosition(area, { bookId: 'bk1', chapterId: 'c1', paragraphIndex: 0, updatedAt: 1 });
      await putMemo(area, bookMemo({ id: 'm1', sourceId: 'bk1' }));
      await deleteBook(area, 'bk1');
      expect((await area.getKeys()).sort()).toEqual(
        ['book:bk2', 'bookch:bk2:c1', 'bookch:bk2:c2', 'done:bk2:c2'].sort()
      );
    });
  });

  describe('reader settings for reading aloud', () => {
    it('4.3-6 stores voice, rate, online permission, repeat and auto pause next to font size', async () => {
      const area = await makeArea();
      await updateReaderSettings(area, { fontSize: 18 });
      await updateReaderSettings(area, { voiceURI: 'Samantha', rate: 1.5 });
      await updateReaderSettings(area, { allowOnlineVoices: true, repeat: true, autoPause: true });
      expect(await getReaderSettings(area)).toEqual({
        fontSize: 18,
        voiceURI: 'Samantha',
        rate: 1.5,
        allowOnlineVoices: true,
        repeat: true,
        autoPause: true,
      });
    });

    it('keeps good fields and drops broken ones', async () => {
      const area = await makeArea({ 'reader:settings': { fontSize: 16, rate: 9, voiceURI: 3, repeat: true } });
      expect(await getReaderSettings(area)).toEqual({ fontSize: 16, repeat: true });
    });
  });

}
