import { describe, expect, it } from 'vitest';
import { Memo } from '../memo/types';
import {
  editorOffsetOfParagraph,
  editorText,
  parseEditorText,
  reattachByParagraph,
  remapChapter,
} from './chapterEdit';

const NOW = 5000;

// 문단 글에서 고른 글(quote)의 nth번째(0부터) 자리에 메모를 만든다.
function memoOn(paragraphs: string[], paragraphIndex: number, quote: string, nth = 0, id = `m-${paragraphIndex}-${quote}-${nth}`): Memo {
  const text = paragraphs[paragraphIndex];
  let start = -1;
  for (let i = 0; i <= nth; i++) start = text.indexOf(quote, start + 1);
  if (start < 0) throw new Error(`quote not found: ${quote}`);
  return {
    id,
    kind: 'book',
    sourceId: 'book-1',
    contextText: text,
    start,
    end: start + quote.length,
    quote,
    note: 'note',
    createdAt: 1,
    updatedAt: 1,
    chapterId: 'ch1',
    paragraphIndex,
  };
}

const anchored = (memo: Memo, paragraphs: string[]) =>
  memo.contextText === paragraphs[memo.paragraphIndex!] && memo.contextText.slice(memo.start, memo.end) === memo.quote;

// 메모 하나를 옮긴 결과. 값이 그대로면 원래 메모를 돌려준다.
function remapOne(before: string[], after: string[], memo: Memo) {
  const result = remapChapter(before, after, [memo], NOW);
  if (result.lost.length > 0) return { lost: true as const };
  const next = result.moved[0] ?? memo;
  expect(anchored(next, after)).toBe(true);
  return { lost: false as const, memo: next, untouched: result.untouched === 1 };
}

describe('book-edit 4.3-3 editor text and paragraphs', () => {
  it('puts one blank line between paragraphs', () => {
    expect(editorText(['One.', 'Two.', 'Three.'])).toBe('One.\n\nTwo.\n\nThree.');
  });

  it('makes one paragraph per non-empty line, dropping blank lines and outer spaces', () => {
    expect(parseEditorText('a\nb\n\n\n c \n\n')).toEqual(['a', 'b', 'c']);
    expect(parseEditorText('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
    expect(parseEditorText(' \n\t\n')).toEqual([]);
  });

  it('round-trips paragraphs', () => {
    const paragraphs = ['The keeper lit the lamp.', 'Fog rolled in.', 'Chapter 3'];
    expect(parseEditorText(editorText(paragraphs))).toEqual(paragraphs);
  });

  it('finds where a paragraph starts in the editor text', () => {
    const paragraphs = ['One.', 'Two two.', 'Three.'];
    const text = editorText(paragraphs);
    expect(text.slice(editorOffsetOfParagraph(paragraphs, 0))).toBe(text);
    expect(text.slice(editorOffsetOfParagraph(paragraphs, 1)).startsWith('Two two.')).toBe(true);
    expect(text.slice(editorOffsetOfParagraph(paragraphs, 2))).toBe('Three.');
    expect(editorOffsetOfParagraph(paragraphs, 9)).toBe(text.length);
  });
});

describe('book-edit 4.4-1 memos whose chosen text is unchanged stay on that text', () => {
  const before = ['The keeper saw the gray cat.', 'Fog rolled over the gray rocks.', 'He wrote it down.'];

  it('shifts the position when text before it in the same paragraph changes', () => {
    const memo = memoOn(before, 0, 'gray cat');
    const after = ['The old keeper saw the gray cat.', before[1], before[2]];
    const r = remapOne(before, after, memo);
    expect(r).toMatchObject({ lost: false, memo: { paragraphIndex: 0, start: memo.start + 4, quote: 'gray cat', note: 'note', updatedAt: NOW } });
  });

  it('leaves the memo untouched when text after it changes only in another paragraph', () => {
    const memo = memoOn(before, 0, 'gray cat');
    const r = remapOne(before, [before[0], before[1], 'He wrote it all down.'], memo);
    expect(r).toMatchObject({ lost: false, untouched: true });
  });

  it('updates the paragraph text when another part of the same paragraph changes after it', () => {
    const memo = memoOn(before, 0, 'keeper');
    const r = remapOne(before, ['The keeper saw the grey cat.', before[1], before[2]], memo);
    expect(r).toMatchObject({ lost: false, memo: { start: memo.start, end: memo.end, contextText: 'The keeper saw the grey cat.' } });
  });

  it('changes the paragraph number when paragraphs are added or removed before it', () => {
    const memo = memoOn(before, 2, 'wrote');
    expect(remapOne(before, ['A new line.', 'Another.', ...before], memo)).toMatchObject({ lost: false, memo: { paragraphIndex: 4, start: memo.start } });
    expect(remapOne(before, [before[0], before[2]], memo)).toMatchObject({ lost: false, memo: { paragraphIndex: 1 } });
  });

  it('follows the text when two paragraphs are merged', () => {
    const memo = memoOn(before, 1, 'gray rocks');
    const after = [`${before[0]} ${before[1]}`, before[2]];
    const r = remapOne(before, after, memo);
    expect(r).toMatchObject({ lost: false, memo: { paragraphIndex: 0, start: before[0].length + 1 + memo.start, quote: 'gray rocks' } });
  });

  it('follows the text when paragraphs are merged without a space', () => {
    const memo = memoOn(['foo', 'bar baz'], 1, 'bar');
    const r = remapOne(['foo', 'bar baz'], ['foobar baz'], memo);
    expect(r).toMatchObject({ lost: false, memo: { paragraphIndex: 0, start: 3, end: 6, quote: 'bar' } });
  });

  it('follows the text when the paragraph is split outside the chosen text', () => {
    const memo = memoOn(before, 0, 'gray cat');
    const r = remapOne(before, ['The keeper', 'saw the gray cat.', before[1], before[2]], memo);
    expect(r).toMatchObject({ lost: false, memo: { paragraphIndex: 1, start: 8, quote: 'gray cat' } });
  });

  it('does not take in text inserted right before or right after the chosen text', () => {
    const memo = memoOn(before, 0, 'gray cat');
    expect(remapOne(before, ['The keeper saw the big gray cat.', before[1], before[2]], memo)).toMatchObject({
      lost: false,
      memo: { quote: 'gray cat', start: memo.start + 4 },
    });
    expect(remapOne(before, ['The keeper saw the gray cat again.', before[1], before[2]], memo)).toMatchObject({
      lost: false,
      memo: { quote: 'gray cat', start: memo.start, end: memo.end },
    });
  });

  it('stays on the same occurrence when the text appears several times', () => {
    const paragraphs = ['the cat and the cat and the cat', 'the cat'];
    const second = memoOn(paragraphs, 0, 'the cat', 1);
    const r = remapOne(paragraphs, ['a dog, the cat and the cat and the cat', 'the cat'], second);
    expect(r).toMatchObject({ lost: false, memo: { paragraphIndex: 0, start: second.start + 7 } });
    // 첫 번째 것을 지워도 두 번째에 단 메모는 원래 그 자리의 글에 남는다.
    const r2 = remapOne(paragraphs, ['and the cat and the cat', 'the cat'], second);
    expect(r2).toMatchObject({ lost: false, memo: { paragraphIndex: 0, start: 4, quote: 'the cat' } });
  });

  it('keeps a memo that ends in the middle of a word when the rest of the word changes', () => {
    const memo = memoOn(['the cat sat'], 0, 'the ca');
    const r = remapOne(['the cat sat'], ['the cats sat'], memo);
    expect(r).toMatchObject({ lost: false, memo: { start: 0, end: 6, quote: 'the ca' } });
  });
});

describe('book-edit 4.4-2 a fix inside the chosen text keeps the memo and changes the chosen text', () => {
  it('fixes a typo inside a longer selection', () => {
    const before = ['He saw teh cat run.'];
    const memo = memoOn(before, 0, 'saw teh cat');
    const r = remapOne(before, ['He saw the cat run.'], memo);
    expect(r).toMatchObject({ lost: false, memo: { quote: 'saw the cat', start: 3, end: 14, note: 'note' } });
  });

  it('fixes a typo that is exactly the selection', () => {
    const before = ['He saw teh cat run.'];
    const memo = memoOn(before, 0, 'teh');
    const r = remapOne(before, ['He saw the cat run.'], memo);
    expect(r).toMatchObject({ lost: false, memo: { quote: 'the', start: 7, end: 10 } });
  });

  it('keeps what is left when a word in the middle is removed', () => {
    const before = ['He saw the big gray cat run.'];
    const memo = memoOn(before, 0, 'the big gray cat');
    const r = remapOne(before, ['He saw the gray cat run.'], memo);
    expect(r).toMatchObject({ lost: false, memo: { quote: 'the gray cat', start: 7 } });
  });

  it('covers a longer replacement of the whole selection', () => {
    const before = ['He saw the cat run.'];
    const memo = memoOn(before, 0, 'cat');
    const r = remapOne(before, ['He saw the cats run.'], memo);
    expect(r).toMatchObject({ lost: false, memo: { quote: 'cats' } });
  });
});

describe('book-edit 4.4-3 memos that cannot be kept', () => {
  const before = ['The keeper saw the gray cat sit down.', 'Fog rolled in.'];

  it('loses the memo when the chosen text is deleted with nothing in its place', () => {
    const memo = memoOn(before, 0, 'gray cat');
    expect(remapOne(before, ['The keeper saw the sit down.', before[1]], memo).lost).toBe(true);
  });

  it('loses the memo when its paragraph is deleted', () => {
    const memo = memoOn(before, 1, 'Fog');
    expect(remapOne(before, [before[0]], memo).lost).toBe(true);
  });

  it('loses the memo when a change crosses the edge of the chosen text', () => {
    const memo = memoOn(before, 0, 'the gray cat');
    expect(remapOne(before, ['The keeper saw the gray down.', before[1]], memo).lost).toBe(true);
    expect(remapOne(before, ['The keeper gray cat sit down.', before[1]], memo).lost).toBe(true);
  });

  it('loses the memo when the paragraph is split in the middle of the chosen text', () => {
    const memo = memoOn(before, 0, 'the gray cat');
    expect(remapOne(before, ['The keeper saw the gray', 'cat sit down.', before[1]], memo).lost).toBe(true);
  });

  it('returns lost memos unchanged', () => {
    const memo = memoOn(before, 1, 'Fog');
    const result = remapChapter(before, [before[0]], [memo], NOW);
    expect(result.lost).toEqual([memo]);
    expect(result.moved).toEqual([]);
  });
});

describe('book-edit 4.4-4 uncertain memos are not attached to other text', () => {
  it('loses the memo when its sentence is rewritten into unrelated words', () => {
    const before = ['The gray cat sat down.', 'Fog rolled in.'];
    const memo = memoOn(before, 0, 'cat');
    expect(remapOne(before, ['A wholly new line here.', 'Fog rolled in.'], memo).lost).toBe(true);
  });

  it('keeps a memo on one of two neighbouring typos fixed together', () => {
    const before = ['He saw teh cta run.'];
    const r = remapOne(before, ['He saw the cat run.'], memoOn(before, 0, 'teh'));
    expect(r).toMatchObject({ lost: false, memo: { quote: 'the', start: 7, end: 10 } });
  });

  it('does not move a memo onto a repeated word elsewhere when its own word is deleted', () => {
    const before = ['one cat two cat three'];
    const memo = memoOn(before, 0, 'cat', 1);
    expect(remapOne(before, ['one cat two three'], memo).lost).toBe(true);
  });
});

describe('book-edit 4.5-1 reading position follows the paragraph', () => {
  const before = ['One.', 'Two.', 'Three.', 'Four.'];
  const map = (after: string[], index: number) => remapChapter(before, after, [], NOW).mapParagraph(index);

  it('moves with paragraphs added before it', () => {
    expect(map(['New a.', 'New b.', ...before], 2)).toBe(4);
  });

  it('goes to the nearest paragraph before it when the paragraph is deleted', () => {
    expect(map(['One.', 'Two.', 'Four.'], 2)).toBe(1);
    expect(map(['Two.', 'Three.', 'Four.'], 0)).toBe(0);
  });

  it('moves back by one when two paragraphs before it are merged', () => {
    expect(map(['One. Two.', 'Three.', 'Four.'], 2)).toBe(1);
  });

  it('stays on a paragraph whose text was fixed', () => {
    expect(map(['One.', 'Two.', 'Threee indeed.', 'Four.'], 2)).toBe(2);
  });

  it('is zero when no paragraph is left and unchanged when nothing changed', () => {
    expect(map([], 3)).toBe(0);
    expect(map(before, 3)).toBe(3);
  });
});

describe('book-edit 4.6 detached memos are attached to an identical paragraph', () => {
  const paragraphs = ['Alpha line.', 'The lamp was lit at dusk.', 'Omega line.'];
  const detached: Memo = { ...memoOn(['The lamp was lit at dusk.'], 0, 'lamp'), chapterId: 'ch-old', paragraphIndex: 7 };

  it('attaches to the single paragraph with the same text', () => {
    const [memo] = reattachByParagraph([detached], 'ch2', paragraphs, NOW);
    expect(memo).toMatchObject({ chapterId: 'ch2', paragraphIndex: 1, start: detached.start, end: detached.end, quote: 'lamp', note: 'note', updatedAt: NOW });
  });

  it('does not attach when two paragraphs have that text', () => {
    expect(reattachByParagraph([detached], 'ch2', [...paragraphs, 'The lamp was lit at dusk.'], NOW)).toEqual([]);
  });

  it('does not attach when the paragraph differs by one character', () => {
    expect(reattachByParagraph([detached], 'ch2', ['Alpha line.', 'The lamp was lit at dusk!'], NOW)).toEqual([]);
  });
});

// ---- 4.4-4: 씨앗값으로 만든 여러 수정 ----

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 글자마다 원래 위치(id)를 달고 수정해, 메모가 고른 글자가 그대로 남았는지 스스로 안다. 새로 넣은 글자의 id는 -1이다.
interface Cell {
  ch: string;
  id: number;
}

function runCase(seed: number) {
  const rand = prng(seed);
  const pick = (n: number) => Math.floor(rand() * n);
  let word = 0;
  const nextWord = () => `w${(word++).toString(36)}x`;
  const before: string[] = [];
  for (let p = 0; p < 6 + pick(5); p++) {
    const words: string[] = [];
    for (let w = 0; w < 4 + pick(8); w++) words.push(nextWord());
    before.push(words.join(' '));
  }
  // 문단마다 끝에 '\n'을 둔 한 줄의 글자 목록.
  let cells: Cell[] = [];
  let id = 0;
  const paragraphStart: number[] = [];
  before.forEach((p) => {
    paragraphStart.push(id);
    `${p}\n`.split('').forEach((ch) => cells.push({ ch, id: id++ }));
  });

  const memos: Memo[] = [];
  for (let k = 0; k < 12; k++) {
    const pi = pick(before.length);
    const text = before[pi];
    let start = pick(text.length);
    let end = Math.min(text.length, start + 1 + pick(14));
    while (start < end && text[start] === ' ') start++;
    while (end > start && text[end - 1] === ' ') end--;
    if (start >= end) continue;
    memos.push({
      id: `m${k}`,
      kind: 'book',
      sourceId: 'book-1',
      contextText: text,
      start,
      end,
      quote: text.slice(start, end),
      note: '',
      createdAt: 1,
      updatedAt: 1,
      chapterId: 'ch1',
      paragraphIndex: pi,
    });
  }

  const insert = (at: number, text: string) => {
    cells.splice(at, 0, ...text.split('').map((ch) => ({ ch, id: -1 })));
  };
  const wordSpans = () => {
    const spans: [number, number][] = [];
    let from = -1;
    cells.forEach((c, i) => {
      const isWord = c.ch !== ' ' && c.ch !== '\n';
      if (isWord && from < 0) from = i;
      if (!isWord && from >= 0) {
        spans.push([from, i]);
        from = -1;
      }
    });
    return spans;
  };
  const positionsOf = (ch: string) => cells.map((c, i) => (c.ch === ch ? i : -1)).filter((i) => i >= 0);

  let movedParagraph = false;
  for (let step = 0; step < 1 + pick(6); step++) {
    const spans = wordSpans();
    const kind = pick(7);
    if (kind === 0 && spans.length > 0) {
      // 낱말 앞에 새 낱말 넣기
      insert(spans[pick(spans.length)][0], `${nextWord()} `);
    } else if (kind === 1 && spans.length > 1) {
      // 낱말과 그 뒤 공백 지우기
      const [a, b] = spans[pick(spans.length)];
      cells.splice(a, cells[b]?.ch === ' ' ? b - a + 1 : b - a);
    } else if (kind === 2 && spans.length > 0) {
      // 낱말 바꾸기
      const [a, b] = spans[pick(spans.length)];
      cells.splice(a, b - a);
      insert(a, nextWord());
    } else if (kind === 3) {
      // 문단 합치기
      const breaks = positionsOf('\n').slice(0, -1);
      if (breaks.length > 0) cells[breaks[pick(breaks.length)]] = { ch: ' ', id: -1 };
    } else if (kind === 4) {
      // 문단 나누기
      const spaces = positionsOf(' ');
      if (spaces.length > 0) cells[spaces[pick(spaces.length)]] = { ch: '\n', id: -1 };
    } else if (kind === 5) {
      // 문단 지우기
      const breaks = positionsOf('\n');
      if (breaks.length > 2) {
        const k = pick(breaks.length);
        const from = k === 0 ? 0 : breaks[k - 1] + 1;
        cells.splice(from, breaks[k] - from + 1);
      }
    } else if (kind === 6) {
      // 문단 옮기기(옮긴 글자는 새 글자로 본다)
      movedParagraph = true;
      const breaks = positionsOf('\n');
      if (breaks.length > 2) {
        const k = pick(breaks.length);
        const from = k === 0 ? 0 : breaks[k - 1] + 1;
        const taken = cells.splice(from, breaks[k] - from + 1).map((c) => ({ ch: c.ch, id: -1 }));
        const rest = positionsOf('\n');
        const at = pick(rest.length + 1);
        cells.splice(at === 0 ? 0 : rest[at - 1] + 1, 0, ...taken);
      }
    }
  }
  // 문단 앞뒤 공백을 편집 창처럼 정리한다(공백 글자는 메모가 고른 글의 끝이 될 수 없어 영향이 없다).
  const text = cells.map((c) => c.ch).join('');
  const after = parseEditorText(text);
  // 정리한 뒤의 글자 목록을 다시 만든다(빈 줄과 줄 앞뒤 공백을 뺀다).
  const kept: Cell[] = [];
  let lineStart = 0;
  text.split('\n').forEach((line) => {
    const lead = line.length - line.trimStart().length;
    const body = line.trim();
    if (body) {
      for (let i = 0; i < body.length; i++) kept.push(cells[lineStart + lead + i]);
      kept.push({ ch: '\n', id: -1 });
    }
    lineStart += line.length + 1;
  });
  cells = kept;
  expect(cells.map((c) => c.ch).join('')).toBe(after.map((p) => `${p}\n`).join(''));

  const result = remapChapter(before, after, memos, NOW);
  const byId = new Map(result.moved.map((m) => [m.id, m]));
  const lostIds = new Set(result.lost.map((m) => m.id));
  const afterStart: number[] = [];
  let at = 0;
  after.forEach((p) => {
    afterStart.push(at);
    at += p.length + 1;
  });

  memos.forEach((memo) => {
    const now = lostIds.has(memo.id) ? null : byId.get(memo.id) ?? memo;
    if (now) {
      // 붙은 것으로 저장되는 메모는 새 문단 글과 맞아야 한다.
      expect(now.contextText, `seed ${seed} ${memo.id}`).toBe(after[now.paragraphIndex!]);
      expect(now.contextText.slice(now.start, now.end), `seed ${seed} ${memo.id}`).toBe(now.quote);
      expect(now.end, `seed ${seed} ${memo.id}`).toBeGreaterThan(now.start);
    }
    // 고른 글자가 모두 그대로 이어져 한 문단 안에 남았는가.
    const first = paragraphStart[memo.paragraphIndex!] + memo.start;
    const where = cells.findIndex((c) => c.id === first);
    let intact = where >= 0;
    for (let i = 0; intact && i < memo.end - memo.start; i++) {
      intact = cells[where + i]?.id === first + i;
    }
    // 문단을 옮긴 경우에는 옮긴 문단과 엇갈린 문단의 메모를 떨어진 것으로 알릴 수 있다(엉뚱한 자리에 붙이지 않으면 된다).
    if (intact && (!movedParagraph || now)) {
      expect(now, `seed ${seed} ${memo.id} should be kept`).not.toBeNull();
      expect(afterStart[now!.paragraphIndex!] + now!.start, `seed ${seed} ${memo.id}`).toBe(where);
      expect(now!.quote).toBe(memo.quote);
      expect(now!.note).toBe(memo.note);
    }
  });
}

describe('book-edit 4.4-4 seeded edits keep every attached memo consistent', () => {
  it('holds for 400 seeds of mixed edits', () => {
    for (let seed = 1; seed <= 400; seed++) runCase(seed);
  });
});
