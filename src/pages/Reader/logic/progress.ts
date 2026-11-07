import { BookMeta, ReadingPosition } from '../../../shared/memo/types';

// 책 한 권의 학습 진행률. 글자 수 기준이고, 장 수도 함께 센다(4.2-1).
export interface BookProgress {
  percent: number;
  done: number;
  total: number;
}

export function bookProgress(
  book: BookMeta,
  counts: Record<string, number>,
  doneIds: Set<string>
): BookProgress {
  let all = 0;
  let finished = 0;
  let done = 0;
  book.chapters.forEach((c) => {
    const n = counts[c.id] ?? 0;
    all += n;
    if (doneIds.has(c.id)) {
      finished += n;
      done += 1;
    }
  });
  const total = book.chapters.length;
  if (all === 0) return { percent: 0, done, total };
  const percent = Math.floor((finished / all) * 100);
  // 글자가 없는 장이 남아도 모든 장을 완료하기 전에는 100%가 아니다.
  return { percent: done === total ? percent : Math.min(percent, 99), done, total };
}

export const progressText = (p: BookProgress) => `${p.percent}% · ${p.total}장 중 ${p.done}장 완료`;

// 읽던 장(학습 완료와 다르다, 4.2-3)
export function continueLabel(book: BookMeta, position: ReadingPosition | null): string {
  const index = position ? book.chapters.findIndex((c) => c.id === position.chapterId) : -1;
  return index >= 0 ? `이어 읽기: ${index + 1}장 〈${book.chapters[index].title}〉` : '아직 읽지 않음';
}
