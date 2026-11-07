import { describe, expect, it } from 'vitest';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { isBookMemoAnchored, memosForParagraph } from './bookMemos';

const text = 'The kettle sang on the old stove.';

describe('memosForParagraph', () => {
  it('draws only memos whose chapter, paragraph, source text and quote still match', () => {
    const ok = bookMemo({ id: 'ok', chapterId: 'ch1', paragraphIndex: 2 });
    const otherParagraph = bookMemo({ id: 'p', chapterId: 'ch1', paragraphIndex: 3 });
    const otherChapter = bookMemo({ id: 'c', chapterId: 'ch2', paragraphIndex: 2 });
    const changedQuote = bookMemo({ id: 'q', chapterId: 'ch1', paragraphIndex: 2, quote: 'kettlx' });
    const changedText = bookMemo({ id: 't', chapterId: 'ch1', paragraphIndex: 2, contextText: 'Other text here.' });
    const netflix = netflixMemo({ id: 'n', contextText: text, start: 4, end: 10, quote: 'kettle' });
    const result = memosForParagraph(
      [ok, otherParagraph, otherChapter, changedQuote, changedText, netflix],
      'ch1',
      2,
      text
    );
    expect(result.map((m) => m.id)).toEqual(['ok']);
  });

  it('tells whether a book memo can still find its paragraph', () => {
    const memo = bookMemo({ chapterId: 'ch1', paragraphIndex: 1 });
    expect(isBookMemoAnchored(memo, ['x', text])).toBe(true);
    expect(isBookMemoAnchored(memo, ['x', 'Changed paragraph.'])).toBe(false);
    expect(isBookMemoAnchored(memo, ['x'])).toBe(false);
    expect(isBookMemoAnchored(memo, undefined)).toBe(false);
  });
});
