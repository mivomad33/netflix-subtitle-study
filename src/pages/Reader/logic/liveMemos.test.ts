import { describe, expect, it } from 'vitest';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { applyMemoChanges, touches } from './liveMemos';

describe('4.2-3 applying memo changes from other places', () => {
  const a = bookMemo({ id: 'a', note: 'first' });
  const b = bookMemo({ id: 'b' });

  it('adds, replaces and removes memos, and keeps the one being edited', () => {
    const changes = {
      'memo:a': { oldValue: a, newValue: { ...a, note: 'changed elsewhere' } },
      'memo:b': { oldValue: b, newValue: undefined },
      'memo:c': { newValue: bookMemo({ id: 'c' }) },
      'memo:n': { newValue: netflixMemo({ id: 'n' }) },
      'pos:x': { newValue: {} },
    };
    const next = applyMemoChanges([a, b], changes, (m) => m.kind === 'book', null);
    expect(next.map((m) => [m.id, m.note])).toEqual([
      ['a', 'changed elsewhere'],
      ['c', bookMemo({ id: 'c' }).note],
    ]);
    expect(applyMemoChanges([a, b], changes, () => true, 'a').find((m) => m.id === 'a')).toBe(a);
  });

  it('returns the same list when nothing it shows changed', () => {
    const prev = [a];
    expect(applyMemoChanges(prev, { 'memo:a': { newValue: { ...a } } }, () => true, null)).toBe(prev);
    expect(touches({ 'pos:x': {} }, ['memo:', 'book:'])).toBe(false);
    expect(touches({ 'book:x': {} }, ['memo:', 'book:'])).toBe(true);
  });
});
