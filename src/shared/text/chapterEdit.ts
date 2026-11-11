// 장 본문을 고칠 때 쓰는 순수 함수. 편집 창의 글과 문단 목록을 오가고,
// 고치기 전후 본문을 비교해 메모와 읽던 위치를 새 본문에 맞게 옮긴다(명세서 book-edit 4.3-3, 4.4, 4.5, 4.6).
import diff from 'fast-diff';
import { Memo } from '../memo/types';
import { trimRange } from '../memo/annotate';

// ---- 편집 창의 글 ↔ 문단 ----

// 문단 사이에 빈 줄 하나를 둔다.
export const editorText = (paragraphs: string[]) => paragraphs.join('\n\n');

// 글이 있는 줄 하나가 문단 하나다. 빈 줄은 버리고 줄 앞뒤 공백은 뺀다.
export function parseEditorText(text: string): string[] {
  const result: string[] = [];
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) result.push(trimmed);
    });
  return result;
}

// 편집 창의 글에서 index번째 문단이 시작하는 글자 위치.
export function editorOffsetOfParagraph(paragraphs: string[], index: number): number {
  let offset = 0;
  const last = Math.min(index, paragraphs.length);
  for (let i = 0; i < last; i++) offset += paragraphs[i].length + 2;
  return Math.min(offset, Math.max(0, editorText(paragraphs).length));
}

export const sameParagraphs = (a: string[], b: string[]) => a.length === b.length && a.every((p, i) => p === b[i]);

// ---- 본문 비교 ----

// 고친 곳 하나. 옛 글의 [a, b)가 새 글의 [c, d)로 바뀌었다. 위치는 문단마다 끝에 '\n'을 붙여 이은 글 기준이다.
export interface Hunk {
  a: number;
  b: number;
  c: number;
  d: number;
}

// 한 글자로 바꿔 비교할 수 있는 낱개(문단, 낱말)의 최대 종류 수. 대리 쌍 영역(0xD800~0xDFFF)은 쓰지 않는다.
const MAX_CODES = 0xd800 - 1 + (0xffff - 0xdfff);

class Encoder {
  private codes = new Map<string, string>();
  full = false;

  encode(items: string[]): string | null {
    let out = '';
    for (const item of items) {
      let ch = this.codes.get(item);
      if (ch === undefined) {
        const n = this.codes.size + 1;
        if (n > MAX_CODES) {
          this.full = true;
          return null;
        }
        ch = String.fromCharCode(n < 0xd800 ? n : n + 0x800);
        this.codes.set(item, ch);
      }
      out += ch;
    }
    return out;
  }
}

// 낱개 목록 둘을 비교해 바뀐 구간을 낱개 번호로 돌려준다. 낱개 종류가 너무 많으면 앞뒤 같은 부분만 뺀 한 구간.
function diffItems(before: string[], after: string[]): { i0: number; i1: number; j0: number; j1: number }[] {
  const encoder = new Encoder();
  const x = encoder.encode(before);
  const y = x === null ? null : encoder.encode(after);
  if (x === null || y === null) {
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (
      tail < before.length - head &&
      tail < after.length - head &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
      tail++;
    }
    return head === before.length && head === after.length
      ? []
      : [{ i0: head, i1: before.length - tail, j0: head, j1: after.length - tail }];
  }
  const blocks: { i0: number; i1: number; j0: number; j1: number }[] = [];
  let i = 0;
  let j = 0;
  let open: { i0: number; i1: number; j0: number; j1: number } | null = null;
  // cleanup을 켜지 않는다: 낱개 하나가 글자 하나라 뜻 단위 정리는 맞지 않는다.
  for (const [op, text] of diff(x, y)) {
    if (op === 0) {
      open = null;
      i += text.length;
      j += text.length;
      continue;
    }
    if (!open) {
      open = { i0: i, i1: i, j0: j, j1: j };
      blocks.push(open);
    }
    if (op === -1) {
      i += text.length;
      open.i1 = i;
    } else {
      j += text.length;
      open.j1 = j;
    }
  }
  return blocks;
}

// 낱말: 글자·숫자의 묶음(안쪽의 ' ’ - 포함). 공백과 문장 부호는 낱말 사이의 틈으로 본다.
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

interface Word {
  text: string;
  start: number;
  end: number;
}

function wordsOf(text: string): Word[] {
  const result: Word[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    result.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return result;
}

// 두 낱말이 얼마나 닮았는가(0~1). 오타를 고친 낱말끼리는 높다.
function similarity(x: string, y: string): number {
  if (x === y) return 1;
  let same = 0;
  for (const [op, text] of diff(x, y)) if (op === 0) same += text.length;
  return (2 * same) / (x.length + y.length);
}

const starts = (paragraphs: string[]) => {
  const result = new Array<number>(paragraphs.length + 1);
  let at = 0;
  paragraphs.forEach((p, i) => {
    result[i] = at;
    at += p.length + 1;
  });
  result[paragraphs.length] = at;
  return result;
};

const joined = (paragraphs: string[]) => paragraphs.map((p) => `${p}\n`).join('');

// 두 글을 낱말 단위로 비교한 고친 곳. baseA, baseC는 두 글이 전체 글에서 시작하는 위치다.
// 낱말만 맞춘다. 공백까지 맞추면 통째로 바뀐 문장에서 무관한 낱말끼리 짝지어져 메모가 엉뚱한 글에 붙는다.
function tokenHunks(oldPart: string, newPart: string, baseA: number, baseC: number): Hunk[] {
  const oldWords = wordsOf(oldPart);
  const newWords = wordsOf(newPart);
  const hunks: Hunk[] = [];
  const push = (a: number, b: number, c: number, d: number) => hunks.push({ a: baseA + a, b: baseA + b, c: baseC + c, d: baseC + d });

  // 같은 낱말 사이의 틈 하나. 옛 글의 [oa, ob)와 낱말 [i0, i1), 새 글의 [na, nb)와 낱말 [j0, j1).
  const gap = (oa: number, ob: number, i0: number, i1: number, na: number, nb: number, j0: number, j1: number) => {
    if (ob - oa === nb - na && oldPart.slice(oa, ob) === newPart.slice(na, nb)) return;
    const k = i1 - i0;
    if (k > 0 && k === j1 - j0) {
      // 낱말 수가 같고 낱말 사이의 글이 모두 같으면 낱말끼리 하나씩 바뀐 것으로 본다(오타 여러 개를 고친 경우).
      let aligned = true;
      for (let n = 0; aligned && n <= k; n++) {
        const o0 = n === 0 ? oa : oldWords[i0 + n - 1].end;
        const o1 = n === k ? ob : oldWords[i0 + n].start;
        const n0 = n === 0 ? na : newWords[j0 + n - 1].end;
        const n1 = n === k ? nb : newWords[j0 + n].start;
        aligned = oldPart.slice(o0, o1) === newPart.slice(n0, n1);
      }
      for (let n = 0; aligned && k > 1 && n < k; n++) {
        aligned = similarity(oldWords[i0 + n].text, newWords[j0 + n].text) >= 0.5;
      }
      if (aligned) {
        for (let n = 0; n < k; n++) {
          const o = oldWords[i0 + n];
          const w = newWords[j0 + n];
          if (o.text !== w.text) push(o.start, o.end, w.start, w.end);
        }
        return;
      }
    }
    const trimmed = trimHunk({ a: oa, b: ob, c: na, d: nb }, oldPart, newPart);
    if (trimmed) push(trimmed.a, trimmed.b, trimmed.c, trimmed.d);
  };

  let i = 0;
  let j = 0;
  let oa = 0;
  let na = 0;
  const blocks = diffItems(
    oldWords.map((w) => w.text),
    newWords.map((w) => w.text)
  );
  // 같은 낱말 한 쌍마다 그 앞의 틈을 본다.
  const equalUntil = (iEnd: number) => {
    for (; i < iEnd; i++, j++) {
      gap(oa, oldWords[i].start, i, i, na, newWords[j].start, j, j);
      oa = oldWords[i].end;
      na = newWords[j].end;
    }
  };
  blocks.forEach((block, n) => {
    equalUntil(block.i0);
    // 바뀐 낱말 구간은 다음 같은 낱말(없으면 글의 끝)까지가 틈 하나다.
    const next = blocks[n + 1];
    const hasNextEqual = block.i1 < (next ? next.i0 : oldWords.length);
    const ob = hasNextEqual ? oldWords[block.i1].start : next ? -1 : oldPart.length;
    if (ob < 0) {
      // 바뀐 구간 둘이 붙어 있을 수는 없다(diffItems가 하나로 묶는다).
      throw new Error('adjacent diff blocks');
    }
    const nb = hasNextEqual ? newWords[block.j1].start : newPart.length;
    gap(oa, ob, block.i0, block.i1, na, nb, block.j0, block.j1);
    i = block.i1;
    j = block.j1;
    if (hasNextEqual) {
      oa = oldWords[i].end;
      na = newWords[j].end;
      i++;
      j++;
    } else {
      oa = oldPart.length;
      na = newPart.length;
    }
  });
  equalUntil(oldWords.length);
  gap(oa, oldPart.length, i, i, na, newPart.length, j, j);
  return hunks;
}

// 고치기 전후 문단 목록의 고친 곳. 문단 단위로 먼저 맞추고, 바뀐 구간만 낱말 단위로 비교한다.
export function diffParagraphs(before: string[], after: string[]): Hunk[] {
  const oldStarts = starts(before);
  const newStarts = starts(after);
  const hunks: Hunk[] = [];
  for (const block of diffItems(before, after)) {
    const baseA = oldStarts[block.i0];
    const baseC = newStarts[block.j0];
    hunks.push(...tokenHunks(joined(before.slice(block.i0, block.i1)), joined(after.slice(block.j0, block.j1)), baseA, baseC));
  }
  return hunks;
}

// 고친 곳의 앞뒤에서 글자가 같은 부분을 뺀다. 낱말 가운데에서 끝나는 하이라이트를 다시 볼 때 쓴다.
function trimHunk(h: Hunk, oldText: string, newText: string): Hunk | null {
  let { a, b, c, d } = h;
  while (a < b && c < d && oldText[a] === newText[c]) {
    a++;
    c++;
  }
  while (a < b && c < d && oldText[b - 1] === newText[d - 1]) {
    b--;
    d--;
  }
  return a === b && c === d ? null : { a, b, c, d };
}

// 옛 글의 [s, e)가 새 글의 어디가 되는지. 고친 곳이 경계에 걸치면 null.
function mapRange(s: number, e: number, hunks: Hunk[], oldText: string, newText: string): { s: number; e: number } | null {
  let before = 0;
  let inside = 0;
  const visit = (h: Hunk, canTrim: boolean): boolean => {
    if (h.b <= s) {
      before += h.d - h.c - (h.b - h.a);
      return true;
    }
    if (h.a >= e) return true;
    if (h.a >= s && h.b <= e) {
      inside += h.d - h.c - (h.b - h.a);
      return true;
    }
    if (!canTrim) return false;
    const trimmed = trimHunk(h, oldText, newText);
    return trimmed ? visit(trimmed, false) : true;
  };
  for (const h of hunks) {
    if (h.a >= e && h.a > s) break;
    if (!visit(h, true)) return null;
  }
  const ns = s + before;
  const ne = e + before + inside;
  return ne > ns ? { s: ns, e: ne } : null;
}

// 위치가 든 문단 번호. 문단 끝의 '\n'은 그 문단에 속한다.
function paragraphAt(position: number, paragraphStarts: number[]): number {
  let lo = 0;
  let hi = paragraphStarts.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (paragraphStarts[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface ChapterRemap {
  // 새 본문에 붙는 메모 가운데 값이 바뀐 것(문단 번호, 위치, 문단 원문, 고른 글). 고친 시각은 now다.
  moved: Memo[];
  // 새 본문에 붙일 수 없는 메모(값은 그대로).
  lost: Memo[];
  // 값이 바뀌지 않고 그대로 붙어 있는 메모 수.
  untouched: number;
  // 옛 문단 번호가 새 본문에서 몇 번째 문단이 되는지(4.5-1).
  mapParagraph(index: number): number;
}

// before에 붙어 있던 메모(memos)를 after에 맞게 옮긴다. memos는 before의 문단에 붙어 있는 것만 넘긴다.
export function remapChapter(before: string[], after: string[], memos: Memo[], now: number): ChapterRemap {
  const hunks = diffParagraphs(before, after);
  const oldText = joined(before);
  const newText = joined(after);
  const oldStarts = starts(before);
  const newStarts = starts(after);
  const moved: Memo[] = [];
  const lost: Memo[] = [];
  let untouched = 0;

  // 메모 하나를 주어진 고친 곳 목록으로 옮긴다. 붙일 수 없으면 null, 값이 그대로면 원래 메모.
  const place = (memo: Memo, by: Hunk[]): Memo | null => {
    const index = memo.paragraphIndex ?? -1;
    if (index < 0 || index >= before.length) return null;
    const s = oldStarts[index] + memo.start;
    const range = mapRange(s, s + (memo.end - memo.start), by, oldText, newText);
    if (!range) return null;
    let quote = newText.slice(range.s, range.e);
    if (quote.includes('\n')) return null;
    const paragraphIndex = paragraphAt(range.s, newStarts);
    const contextText = after[paragraphIndex];
    let start = range.s - newStarts[paragraphIndex];
    let end = start + quote.length;
    if (quote !== memo.quote) {
      // 고른 글이 바뀌었으면 끝에 남은 공백을 뺀다.
      const trimmed = trimRange(contextText, { start, end });
      if (!trimmed) return null;
      ({ start, end } = trimmed);
      quote = contextText.slice(start, end);
    }
    if (
      paragraphIndex === memo.paragraphIndex &&
      start === memo.start &&
      end === memo.end &&
      quote === memo.quote &&
      contextText === memo.contextText
    ) {
      return memo;
    }
    return { ...memo, paragraphIndex, start, end, quote, contextText, updatedAt: now };
  };

  const settle = (memo: Memo, placed: Memo) => {
    if (placed === memo) untouched += 1;
    else moved.push(placed);
  };

  const pending: Memo[] = [];
  memos.forEach((memo) => {
    const placed = place(memo, hunks);
    if (placed) settle(memo, placed);
    else pending.push(memo);
  });
  if (pending.length > 0) {
    // 문단을 옮기면서 그 사이의 문단도 고치면 문단 단위 맞춤이 어긋날 수 있다. 본문 전체를 낱말 단위로 다시 비교해 본다.
    const whole = tokenHunks(oldText, newText, 0, 0);
    pending.forEach((memo) => {
      const placed = place(memo, whole);
      if (placed) settle(memo, placed);
      else lost.push(memo);
    });
  }

  const mapParagraph = (index: number): number => {
    if (after.length === 0) return 0;
    const clamp = (n: number) => Math.max(0, Math.min(n, after.length - 1));
    if (index < 0 || index >= before.length) return clamp(index);
    const s = oldStarts[index];
    const e = s + before[index].length;
    // 이 문단에서 고쳐지지 않고 남은 첫 글자를 찾는다.
    let x = s;
    let delta = 0;
    for (const h of hunks) {
      if (h.b <= x) {
        delta += h.d - h.c - (h.b - h.a);
        continue;
      }
      if (h.a > x) break;
      // x가 고친 곳 안에 있다.
      if (h.b >= e) {
        // 문단이 남지 않았다: 그 앞에서 가장 가까운 문단.
        return h.c === 0 ? 0 : clamp(paragraphAt(h.c - 1, newStarts));
      }
      x = h.b;
      delta += h.d - h.c - (h.b - h.a);
    }
    return clamp(paragraphAt(x + delta, newStarts));
  };

  return { moved, lost, untouched, mapParagraph };
}

// 떨어진 메모 가운데 문단 원문이 paragraphs의 문단 하나와 글자 그대로 같은 것을 그 문단에 붙인다(4.6).
// 같은 글의 문단이 둘 이상이면 붙이지 않는다. 돌려주는 것은 붙인 메모(바뀐 값)다.
export function reattachByParagraph(detached: Memo[], chapterId: string, paragraphs: string[], now: number): Memo[] {
  if (detached.length === 0) return [];
  const where = new Map<string, number>();
  paragraphs.forEach((p, i) => where.set(p, where.has(p) ? -1 : i));
  const result: Memo[] = [];
  detached.forEach((memo) => {
    const index = where.get(memo.contextText);
    if (index === undefined || index < 0) return;
    if (memo.contextText.slice(memo.start, memo.end) !== memo.quote) return;
    result.push({ ...memo, chapterId, paragraphIndex: index, updatedAt: now });
  });
  return result;
}
