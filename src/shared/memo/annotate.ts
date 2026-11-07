import { Memo } from './types';

// 글 안에 하이라이트를 그리고 고른 위치를 계산하는 함수들. 넷플릭스 대사와 원서 문단이 함께 쓴다.

export interface TextRange {
  start: number;
  end: number;
}

export interface TextSegment {
  text: string;
  start: number;
  memo?: Memo;
}

export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

// 앞뒤 공백을 빼고 범위를 다듬는다. 남는 글이 없으면 null.
export function trimRange(text: string, range: TextRange): TextRange | null {
  let { start, end } = range;
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(0, Math.min(end, text.length));
  if (start > end) [start, end] = [end, start];
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

// 원문과 고른 글이 그대로인 메모만 그 글에 다시 그린다.
export const memoMatchesText = (memo: Memo, text: string) =>
  memo.contextText === text && text.slice(memo.start, memo.end) === memo.quote;

// 글을 하이라이트가 있는 조각과 없는 조각으로 나눈다. 겹치는 메모는 앞의 것만 쓴다.
export function buildSegments(text: string, memos: Memo[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  [...memos]
    .sort((a, b) => a.start - b.start)
    .forEach((memo) => {
      if (memo.start < cursor || memo.end > text.length) return;
      if (memo.start > cursor) {
        segments.push({ text: text.slice(cursor, memo.start), start: cursor });
      }
      segments.push({ text: text.slice(memo.start, memo.end), start: memo.start, memo });
      cursor = memo.end;
    });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), start: cursor });
  return segments;
}

// DOM 선택 영역을 element 글 안의 위치로 바꾼다. 선택이 element 밖으로 나가면 null.
export function getRangeOffsetsWithin(element: HTMLElement, range: Range): TextRange | null {
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    return null;
  }
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}
