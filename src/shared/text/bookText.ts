// 붙여 넣은 영어 원서 본문(OCR/PDF 복사본)을 문단으로 정리하고 장으로 나누는 순수 함수.

export interface ChapterDraft {
  title: string;
  paragraphs: string[];
}

// 한 권에 넣을 수 있는 본문 글자 수.
export const MAX_BOOK_CHARS = 2_000_000;

const MAX_HEADING_LENGTH = 80;

// 1~399. M, D 를 빼서 "mix", "dim" 같은 낱말이 로마 숫자로 잡히지 않게 한다.
const ROMAN = '(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const UNITS = 'one|two|three|four|five|six|seven|eight|nine';
const TEENS =
  'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const NUMBER_WORD = `(?:(?:${TENS})(?:[- ](?:${UNITS}))?|${TEENS}|${UNITS}|hundred)`;
const NUMBER = `(?:\\d{1,4}|${ROMAN}|${NUMBER_WORD})`;

// "Chapter 12", "Part Two", "Book IV" 뒤에는 구분 기호(. : - — –) 다음의 제목만 허용한다.
const LABELED_RE = new RegExp(`^(?:chapter|part|book) ${NUMBER}(?:\\s*[.:\\-—–].*)?$`, 'i');
const PRO_EPI_RE = /^(?:prologue|epilogue)(?:\s*[.:\-—–].*)?$/i;
const BARE_NUMBER_RE = new RegExp(`^(?:\\d{1,3}|${ROMAN})\\.?$`, 'i');

export function isChapterHeading(paragraph: string): boolean {
  if (paragraph.indexOf('\n') !== -1 || paragraph.indexOf('\r') !== -1) return false;
  const line = paragraph.trim().replace(/\s+/g, ' ');
  if (line.length === 0 || line.length > MAX_HEADING_LENGTH) return false;
  return LABELED_RE.test(line) || PRO_EPI_RE.test(line) || BARE_NUMBER_RE.test(line);
}

const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();
const isLower = (c: string) => isLetter(c) && c === c.toLowerCase();
const isUpper = (c: string) => isLetter(c) && c === c.toUpperCase();
const isDigit = (c: string) => c >= '0' && c <= '9';

export function toParagraphs(raw: string, options: { clean: boolean }): string[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  if (!options.clean) {
    const result: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) result.push(trimmed);
    }
    return result;
  }

  const result: string[] = [];
  let pieces: string[] = [];

  const flush = () => {
    if (pieces.length > 0) {
      result.push(pieces.join(''));
      pieces = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) {
      flush();
      continue;
    }
    if (isChapterHeading(line)) {
      flush();
      result.push(line);
      continue;
    }
    if (pieces.length === 0) {
      pieces.push(line);
      continue;
    }

    const prev = pieces[pieces.length - 1];
    const last = prev[prev.length - 1];
    const first = line[0];
    if (last === '-' && prev.length >= 2 && isLetter(prev[prev.length - 2])) {
      if (isLower(first)) {
        pieces[pieces.length - 1] = prev.slice(0, -1);
      } else if (!isUpper(first) && !isDigit(first)) {
        pieces.push(' ');
      }
    } else if (last !== '—' && last !== '–') {
      pieces.push(' ');
    }
    pieces.push(line);
  }
  flush();
  return result;
}

export function detectChapterStarts(paragraphs: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (isChapterHeading(paragraphs[i])) starts.push(i);
  }
  return starts;
}

// 나눌 곳을 정리한다: 범위 안의 정수만, 겹치지 않게, 오름차순.
export function normalizeChapterStarts(paragraphCount: number, starts: number[]): number[] {
  return Array.from(
    new Set(starts.filter((s) => Number.isInteger(s) && s >= 0 && s < paragraphCount)),
  ).sort((a, b) => a - b);
}

export function splitIntoChapters(paragraphs: string[], starts: number[]): ChapterDraft[] {
  if (paragraphs.length === 0) return [];

  const valid = normalizeChapterStarts(paragraphs.length, starts);

  if (valid.length === 0) return [{ title: '본문', paragraphs: paragraphs.slice() }];

  const chapters: ChapterDraft[] = [];
  if (valid[0] > 0) chapters.push({ title: '앞부분', paragraphs: paragraphs.slice(0, valid[0]) });

  valid.forEach((start, i) => {
    const end = i + 1 < valid.length ? valid[i + 1] : paragraphs.length;
    const first = paragraphs[start];
    if (isChapterHeading(first)) {
      chapters.push({ title: first.trim(), paragraphs: paragraphs.slice(start + 1, end) });
    } else {
      chapters.push({ title: `장 ${i + 1}`, paragraphs: paragraphs.slice(start, end) });
    }
  });
  return chapters;
}
