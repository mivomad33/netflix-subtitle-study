import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoSaver, withPending } from './memoSaver';
import { netflixMemo } from '../storage/testFixtures';

describe('memo saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes a memo being typed once, with the last text, after typing pauses', () => {
    const write = vi.fn();
    const saver = createMemoSaver(write, 400);
    'hello'.split('').forEach((_, i) => {
      saver.schedule(netflixMemo({ id: 'm1', note: 'hello'.slice(0, i + 1) }));
      vi.advanceTimersByTime(100);
    });
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].note).toBe('hello');
  });

  it('flushes waiting memos at once, writes new memos at once, and drops deleted ones', () => {
    const write = vi.fn();
    const saver = createMemoSaver(write, 400);
    saver.schedule(netflixMemo({ id: 'a', note: 'a1' }));
    saver.schedule(netflixMemo({ id: 'b', note: 'b1' }));
    saver.cancel('b');
    expect(saver.pending().has('a')).toBe(true);
    saver.flush();
    expect(write.mock.calls.map((c) => c[0].id)).toEqual(['a']);
    saver.now(netflixMemo({ id: 'c' }));
    expect(write).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(saver.pending().size).toBe(0);
  });

  it('keeps unsaved text over a reloaded list', () => {
    const stored = [netflixMemo({ id: 'a', note: 'old' }), netflixMemo({ id: 'b', note: 'b' })];
    const pending = new Map([
      ['a', netflixMemo({ id: 'a', note: 'new' })],
      ['c', netflixMemo({ id: 'c', note: 'c' })],
    ]);
    expect(withPending(stored, pending).map((m) => `${m.id}:${m.note}`)).toEqual(['a:new', 'b:b', 'c:c']);
  });
});
