import { describe, it, expect } from 'vitest';
import { BookMeta } from '../../../shared/memo/types';
import { bookProgress, continueLabel, progressText } from './progress';

const book = (ids: string[]): BookMeta => ({
  id: 'bk1',
  title: 'T',
  author: '',
  createdAt: 1,
  updatedAt: 1,
  chapters: ids.map((id, i) => ({ id, title: `Name ${i + 1}`, paragraphCount: 1 })),
});

describe('bookProgress', () => {
  it('4.2-1 weighs chapters by characters, not by count', () => {
    // 짧은 머리말(10자)과 긴 장(990자)
    const b = book(['pre', 'long']);
    const counts = { pre: 10, long: 990 };
    expect(bookProgress(b, counts, new Set(['pre']))).toEqual({ percent: 1, done: 1, total: 2 });
    expect(bookProgress(b, counts, new Set(['long']))).toEqual({ percent: 99, done: 1, total: 2 });
  });

  it('4.2-1 drops decimals and gives 100% only when every chapter is done', () => {
    const b = book(['a', 'b', 'c']);
    expect(bookProgress(b, { a: 999, b: 1, c: 0 }, new Set(['a'])).percent).toBe(99); // 99.9%
    // 글자가 없는 장만 남아도 모두 완료가 아니면 100%가 아니다.
    expect(bookProgress(b, { a: 999, b: 1, c: 0 }, new Set(['a', 'b'])).percent).toBe(99);
    expect(bookProgress(b, { a: 999, b: 1, c: 0 }, new Set(['a', 'b', 'c'])).percent).toBe(100);
  });

  it('4.2-1 is 0% for a book without chapters or characters', () => {
    expect(bookProgress(book([]), {}, new Set()).percent).toBe(0);
    expect(bookProgress(book(['a']), { a: 0 }, new Set(['a'])).percent).toBe(0);
  });

  it('ignores completion of chapters the book no longer has', () => {
    expect(bookProgress(book(['a']), { a: 5 }, new Set(['gone']))).toEqual({ percent: 0, done: 0, total: 1 });
  });

  it('4.2-1 writes percent with chapter counts', () => {
    expect(progressText({ percent: 45, done: 5, total: 12 })).toBe('45% · 12장 중 5장 완료');
  });
});

describe('continueLabel', () => {
  it('4.2-3 names the chapter to continue or says it was not read yet', () => {
    const b = book(['a', 'b']);
    expect(continueLabel(b, { bookId: 'bk1', chapterId: 'b', paragraphIndex: 0, updatedAt: 1 })).toBe(
      '이어 읽기: 2장 〈Name 2〉'
    );
    expect(continueLabel(b, null)).toBe('아직 읽지 않음');
    expect(continueLabel(b, { bookId: 'bk1', chapterId: 'gone', paragraphIndex: 0, updatedAt: 1 })).toBe(
      '아직 읽지 않음'
    );
  });
});
