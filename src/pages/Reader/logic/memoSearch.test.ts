import { describe, it, expect } from 'vitest';
import { Memo } from '../../../shared/memo/types';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { excerptAround, filterMemos, SourceFilter } from './memoSearch';

const titles: Record<string, string> = {
  v1: 'Test Show',
  v2: 'Other Show',
  bk1: 'Quiet Kitchen',
  bk2: 'Long Road',
};
const sourceTitle = (m: Memo) => titles[m.sourceId] ?? '';

const memos: Memo[] = [
  netflixMemo({ id: 'n1', sourceId: 'v1', updatedAt: 3 }),
  netflixMemo({
    id: 'n2',
    sourceId: 'v2',
    contextText: 'See you tomorrow.',
    start: 8,
    end: 16,
    quote: 'tomorrow',
    note: 'next day',
    updatedAt: 5,
  }),
  bookMemo({ id: 'b1', sourceId: 'bk1', updatedAt: 1 }),
  bookMemo({
    id: 'b2',
    sourceId: 'bk2',
    contextText: 'Wind bent the tall grass.',
    start: 14,
    end: 19,
    quote: 'tall ',
    note: '',
    updatedAt: 4,
  }),
];

const run = (
  query: string,
  source: SourceFilter = { kind: 'all' },
  onlyWithNote = false
) =>
  filterMemos(memos, { query, source, onlyWithNote, sourceTitle }).map(
    (m) => m.id
  );

describe('filterMemos', () => {
  it('returns all memos sorted by updatedAt desc for an empty query', () => {
    expect(run('')).toEqual(['n2', 'b2', 'n1', 'b1']);
    expect(run('   ')).toEqual(['n2', 'b2', 'n1', 'b1']);
  });

  it('matches each field alone', () => {
    expect(run('kettle')).toEqual(['b1']); // quote(+ context)
    expect(run('boiling')).toEqual(['b1']); // note
    expect(run('stove')).toEqual(['b1']); // contextText
    expect(run('Long Road')).toEqual(['b2']); // sourceTitle
    expect(run('next day')).toEqual(['n2']); // note
  });

  it('ignores case and trims the query', () => {
    expect(run('  KETTLE ')).toEqual(['b1']);
    expect(run('GRASS')).toEqual(['b2']);
  });

  it('excludes memos that do not match', () => {
    expect(run('zebra')).toEqual([]);
  });

  it('applies each source filter', () => {
    expect(run('', { kind: 'netflix' })).toEqual(['n2', 'n1']);
    expect(run('', { kind: 'book' })).toEqual(['b2', 'b1']);
    expect(run('', { kind: 'video', videoId: 'v1' })).toEqual(['n1']);
    expect(run('', { kind: 'bookId', bookId: 'bk2' })).toEqual(['b2']);
  });

  it('combines source filter, query and only-with-note', () => {
    expect(run('', { kind: 'book' }, true)).toEqual(['b1']);
    expect(run('show', { kind: 'netflix' })).toEqual(['n2', 'n1']);
    expect(run('show', { kind: 'netflix' }, true)).toEqual(['n2']);
    expect(run('kitchen', { kind: 'netflix' })).toEqual([]);
  });

  it('treats a whitespace-only note as no note', () => {
    const withSpace = [bookMemo({ id: 'x', note: '   ' })];
    expect(
      filterMemos(withSpace, {
        query: '',
        source: { kind: 'all' },
        onlyWithNote: true,
        sourceTitle,
      })
    ).toEqual([]);
  });
});

describe('excerptAround', () => {
  it('returns the whole text when short', () => {
    expect(excerptAround('Short line here.', 6, 10)).toBe('Short line here.');
  });

  it('cuts both ends around the quote with an ellipsis', () => {
    const text = `${'a'.repeat(200)}TARGET${'b'.repeat(200)}`;
    const out = excerptAround(text, 200, 206, 10);
    expect(out).toBe(`…${'a'.repeat(10)}TARGET${'b'.repeat(10)}…`);
  });

  it('marks only the cut end', () => {
    const text = `TARGET${'b'.repeat(200)}`;
    expect(excerptAround(text, 0, 6, 10)).toBe(`TARGET${'b'.repeat(10)}…`);
    const tail = `${'a'.repeat(200)}TARGET`;
    expect(excerptAround(tail, 200, 206, 10)).toBe(`…${'a'.repeat(10)}TARGET`);
  });
});
