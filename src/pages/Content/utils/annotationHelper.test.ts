import { describe, it, expect, beforeEach } from 'vitest';
import { SentenceAnnotation } from '../../../types';
import {
  buildSegments,
  getAnnotationsForSentence,
  getRangeOffsetsWithin,
  loadAnnotations,
  rangesOverlap,
  saveAnnotations,
  trimRange,
} from './annotationHelper';

const make = (overrides: Partial<SentenceAnnotation> = {}): SentenceAnnotation => ({
  id: 'a',
  sentenceStartMs: 1000,
  sentenceText: 'I am on it.',
  start: 5,
  end: 10,
  quote: 'on it',
  note: '',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('annotationHelper', () => {
  beforeEach(() => localStorage.clear());

  it('saves and loads annotations per video, removing the key when empty', () => {
    saveAnnotations('v1', [make()]);
    expect(loadAnnotations('v1')).toEqual([make()]);
    expect(loadAnnotations('v2')).toEqual([]);

    saveAnnotations('v1', []);
    expect(localStorage.getItem('NF_annotations_v1')).toBeNull();
  });

  it('returns an empty list for broken stored data', () => {
    localStorage.setItem('NF_annotations_v1', '{not json');
    expect(loadAnnotations('v1')).toEqual([]);
  });

  it('matches annotations by sentence text and nearby start time', () => {
    const sentence = { startTime_ms: 1500, text: 'I am on it.' };
    const list = [
      make({ id: 'ok' }),
      make({ id: 'far', sentenceStartMs: 5000 }),
      make({ id: 'text', sentenceText: 'I am in it.' }),
      make({ id: 'quote', quote: 'in it' }),
    ];
    expect(getAnnotationsForSentence(list, sentence).map((a) => a.id)).toEqual(['ok']);
  });

  it('trims whitespace and rejects empty ranges', () => {
    expect(trimRange('I am on it.', { start: 4, end: 11 })).toEqual({ start: 5, end: 11 });
    expect(trimRange('I am on it.', { start: 10, end: 4 })).toEqual({ start: 5, end: 10 });
    expect(trimRange('I am  it.', { start: 4, end: 6 })).toBeNull();
  });

  it('detects overlapping ranges', () => {
    expect(rangesOverlap({ start: 0, end: 5 }, { start: 4, end: 8 })).toBe(true);
    expect(rangesOverlap({ start: 0, end: 5 }, { start: 5, end: 8 })).toBe(false);
  });

  it('splits text into plain and highlighted segments', () => {
    const segments = buildSegments('I am on it.', [
      make({ id: 'b', start: 5, end: 10 }),
      make({ id: 'c', start: 7, end: 9 }), // 겹치면 앞의 것만 쓴다
      make({ id: 'a', start: 0, end: 1 }),
    ]);
    expect(segments.map((s) => [s.text, s.annotation?.id])).toEqual([
      ['I', 'a'],
      [' am ', undefined],
      ['on it', 'b'],
      ['.', undefined],
    ]);
  });

  it('converts a DOM range to offsets across highlight elements', () => {
    const div = document.createElement('div');
    div.innerHTML = 'I am <mark>on</mark> it.';
    document.body.appendChild(div);
    const range = document.createRange();
    range.setStart(div.querySelector('mark')!.firstChild!, 1);
    range.setEnd(div.lastChild!, 3);
    expect(getRangeOffsetsWithin(div, range)).toEqual({ start: 6, end: 10 });

    const outside = document.createElement('span');
    outside.textContent = 'x';
    document.body.appendChild(outside);
    range.setEnd(outside.firstChild!, 1);
    expect(getRangeOffsetsWithin(div, range)).toBeNull();
    div.remove();
    outside.remove();
  });
});
