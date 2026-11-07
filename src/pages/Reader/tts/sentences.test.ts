import { describe, it, expect } from 'vitest';
import { MAX_PIECE_LENGTH, splitSentences } from './sentences';

// 글은 모두 직접 쓴 문장이다.
const pieces = (text: string) => splitSentences(text).map((r) => text.slice(r.start, r.end));

describe('splitSentences', () => {
  it('4.3-2 splits after a period, question mark or exclamation mark followed by a capital', () => {
    expect(pieces('The tide was low. Boats waited! Would it rise? It did.')).toEqual([
      'The tide was low.',
      'Boats waited!',
      'Would it rise?',
      'It did.',
    ]);
  });

  it('4.3-2 does not split after common abbreviations or initials', () => {
    expect(pieces('Mr. Hale met Mrs. Bell and Dr. Park on St. Mary Road. They walked on.')).toEqual([
      'Mr. Hale met Mrs. Bell and Dr. Park on St. Mary Road.',
      'They walked on.',
    ]);
    expect(pieces('Bring tools, e.g. Hammers and nails, i.e. The basics. Then start.')).toEqual([
      'Bring tools, e.g. Hammers and nails, i.e. The basics.',
      'Then start.',
    ]);
    expect(pieces('A note from J. R. Miller arrived. It was short.')).toEqual([
      'A note from J. R. Miller arrived.',
      'It was short.',
    ]);
  });

  it('4.3-2 does not split at decimals or ellipses', () => {
    expect(pieces('The rope was 3.5 meters long. He waited... Then he waited… More.')).toEqual([
      'The rope was 3.5 meters long.',
      'He waited... Then he waited… More.',
    ]);
  });

  it('4.3-2 keeps quotes with their sentence and does not split at a period inside quotes', () => {
    expect(pieces('"Is it far?" she asked. "Not far." He smiled.')).toEqual([
      '"Is it far?" she asked.',
      '"Not far."',
      'He smiled.',
    ]);
    expect(pieces('He read the sign "Closed. back soon" and left. Then rain.')).toEqual([
      'He read the sign "Closed. back soon" and left.',
      'Then rain.',
    ]);
    expect(pieces('“It is late.” The bell rang.')).toEqual(['“It is late.”', 'The bell rang.']);
  });

  it('4.3-2 splits a long sentence further at commas, semicolons or dashes', () => {
    const long =
      'The keeper climbed the stairs slowly, counting every step in the cold dark tower, ' +
      'then he paused by the narrow window to watch the grey water below; the boats were still there — ' +
      'small and patient, waiting for the morning tide to lift them from the mud.';
    const result = pieces(long);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((p) => expect(p.length).toBeLessThanOrEqual(MAX_PIECE_LENGTH));
    expect(result.join(' ')).toBe(long);
    expect(result[0].endsWith(',') || result[0].endsWith(';') || result[0].endsWith('—')).toBe(true);
  });

  it('cuts a long run without punctuation at a space, and handles empty text', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const result = pieces(words);
    result.forEach((p) => expect(p.length).toBeLessThanOrEqual(MAX_PIECE_LENGTH));
    expect(result.join(' ')).toBe(words);
    expect(pieces('   ')).toEqual([]);
    expect(pieces('No final mark')).toEqual(['No final mark']);
  });

  it('returns offsets inside the paragraph', () => {
    const text = '  One. Two.';
    expect(splitSentences(text)).toEqual([
      { start: 2, end: 6 },
      { start: 7, end: 11 },
    ]);
  });
});
