import { SentenceAnnotation } from '../../../types';
import { STORAGE_KEYS } from '../constants/storageKeys';

// 자막을 다시 정렬하면 문장 시작 시간이 조금 달라질 수 있어 이만큼은 같은 문장으로 본다.
const SENTENCE_TIME_TOLERANCE_MS = 1000;

export interface TextRange {
  start: number;
  end: number;
}

export interface TextSegment {
  text: string;
  start: number;
  annotation?: SentenceAnnotation;
}

const storageKey = (videoId: string | number) =>
  `${STORAGE_KEYS.ANNOTATIONS_PREFIX}${videoId}`;

export function loadAnnotations(videoId: string | number): SentenceAnnotation[] {
  try {
    const saved = localStorage.getItem(storageKey(videoId));
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[NF-STUDY] Failed to load annotations:', e);
    return [];
  }
}

export function saveAnnotations(
  videoId: string | number,
  annotations: SentenceAnnotation[]
): void {
  try {
    if (annotations.length === 0) {
      localStorage.removeItem(storageKey(videoId));
    } else {
      localStorage.setItem(storageKey(videoId), JSON.stringify(annotations));
    }
  } catch (e) {
    console.error('[NF-STUDY] Failed to save annotations:', e);
  }
}

export function createAnnotationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 이 문장에 붙은 주석만 고른다. 원문이 달라졌거나 위치가 맞지 않는 주석은 빼되 저장소에는 남겨 둔다.
export function getAnnotationsForSentence(
  annotations: SentenceAnnotation[],
  sentence: { startTime_ms: number; text: string }
): SentenceAnnotation[] {
  return annotations
    .filter(
      (a) =>
        a.sentenceText === sentence.text &&
        Math.abs(a.sentenceStartMs - sentence.startTime_ms) <=
          SENTENCE_TIME_TOLERANCE_MS &&
        sentence.text.slice(a.start, a.end) === a.quote
    )
    .sort((a, b) => a.start - b.start);
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

// 문장을 하이라이트가 있는 조각과 없는 조각으로 나눈다. 겹치는 주석은 앞의 것만 쓴다.
export function buildSegments(
  text: string,
  annotations: SentenceAnnotation[]
): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  [...annotations]
    .sort((a, b) => a.start - b.start)
    .forEach((annotation) => {
      if (annotation.start < cursor || annotation.end > text.length) return;
      if (annotation.start > cursor) {
        segments.push({ text: text.slice(cursor, annotation.start), start: cursor });
      }
      segments.push({
        text: text.slice(annotation.start, annotation.end),
        start: annotation.start,
        annotation,
      });
      cursor = annotation.end;
    });
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor });
  }
  return segments;
}

// DOM 선택 영역을 element 글 안의 위치로 바꾼다. 선택이 element 밖으로 나가면 null.
export function getRangeOffsetsWithin(
  element: HTMLElement,
  range: Range
): TextRange | null {
  if (
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return null;
  }
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}
