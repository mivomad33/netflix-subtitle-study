// 소리 내어 읽기용 문장 나누기(4.3-2). 문단 안의 위치로 돌려준다.
export interface TextPiece {
  start: number;
  end: number;
}

// 한 번에 읽을 글의 최대 길이. 온라인 음성은 15초쯤 넘게 읽으면 끝 신호 없이 멈추는 일이 있어 짧게 자른다.
export const MAX_PIECE_LENGTH = 160;

// 마침표 뒤에서 끊지 않는 흔한 약어(소문자, 끝 마침표 뺌)
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'mt', 'vs', 'etc', 'no', 'fig', 'vol', 'rev', 'gen',
  'capt', 'col', 'lt', 'sgt', 'co', 'inc', 'ltd', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k',
]);

const CLOSERS = '"\'”’)]»';
const OPENERS = '"\'“‘([«';

const isUpperStart = (ch: string | undefined) => !!ch && /[A-Z0-9]/.test(ch);

// text[i]가 문장 끝 문장부호일 때, 그 뒤(닫는 따옴표 포함)의 끝 위치. 끝이 아니면 -1.
function sentenceEndAt(text: string, i: number): number {
  const ch = text[i];
  if (ch !== '.' && ch !== '!' && ch !== '?') return -1;
  // 말줄임표(... 또는 …)에서는 끊지 않는다.
  if (ch === '.' && (text[i + 1] === '.' || text[i - 1] === '.')) return -1;
  let end = i + 1;
  while (end < text.length && (text[end] === '!' || text[end] === '?')) end++;
  while (end < text.length && CLOSERS.includes(text[end])) end++;
  // 뒤가 공백이고, 그다음(여는 따옴표 뒤)이 대문자나 숫자여야 문장 끝이다.
  if (end < text.length && !/\s/.test(text[end])) return -1;
  let next = end;
  while (next < text.length && /\s/.test(text[next])) next++;
  if (next < text.length) {
    let first = next;
    while (first < text.length && OPENERS.includes(text[first])) first++;
    if (!isUpperStart(text[first])) return -1;
  }
  if (ch === '.') {
    let wordStart = i;
    while (wordStart > 0 && /[A-Za-z.]/.test(text[wordStart - 1])) wordStart--;
    const word = text.slice(wordStart, i).toLowerCase();
    // 약어와 이름 머리글자(J. R.)
    if (ABBREVIATIONS.has(word) || /^[a-z]$/.test(word)) return -1;
  }
  return end;
}

function trimPiece(text: string, start: number, end: number): TextPiece | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

// 긴 문장을 쉼표·세미콜론·콜론·대시 뒤에서, 없으면 공백에서 나눈다.
function splitLong(text: string, piece: TextPiece): TextPiece[] {
  const out: TextPiece[] = [];
  let { start } = piece;
  while (piece.end - start > MAX_PIECE_LENGTH) {
    const limit = start + MAX_PIECE_LENGTH;
    let cut = -1;
    for (let j = limit; j > start + MAX_PIECE_LENGTH / 4; j--) {
      if (/[,;:—–]/.test(text[j - 1]) && /\s/.test(text[j] ?? ' ')) {
        cut = j;
        break;
      }
    }
    if (cut < 0) {
      for (let j = limit; j > start; j--) {
        if (/\s/.test(text[j])) {
          cut = j;
          break;
        }
      }
    }
    if (cut < 0) cut = limit;
    const head = trimPiece(text, start, cut);
    if (head) out.push(head);
    start = cut;
  }
  const tail = trimPiece(text, start, piece.end);
  if (tail) out.push(tail);
  return out;
}

export function splitSentences(text: string): TextPiece[] {
  const sentences: TextPiece[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const end = sentenceEndAt(text, i);
    if (end < 0) continue;
    const piece = trimPiece(text, start, end);
    if (piece) sentences.push(piece);
    start = end;
    i = end - 1;
  }
  const last = trimPiece(text, start, text.length);
  if (last) sentences.push(last);
  return sentences.flatMap((s) => (s.end - s.start > MAX_PIECE_LENGTH ? splitLong(text, s) : [s]));
}
