import { Memo } from '../../../shared/memo/types';
import { memoMatchesText } from '../../../shared/memo/annotate';

// 원서 문단 하나에 그릴 메모. 장·문단 위치가 같고, 문단 원문과 고른 글이 그대로일 때만 그린다(4.1-5).
export function memosForParagraph(
  memos: Memo[],
  chapterId: string,
  paragraphIndex: number,
  text: string
): Memo[] {
  return memos
    .filter(
      (m) =>
        m.kind === 'book' &&
        m.chapterId === chapterId &&
        m.paragraphIndex === paragraphIndex &&
        memoMatchesText(m, text)
    )
    .sort((a, b) => a.start - b.start);
}

// 위치를 다시 찾을 수 있는 원서 메모인가. 장 본문(문단 목록)이 없으면 찾지 못한 것으로 본다.
export function isBookMemoAnchored(memo: Memo, paragraphs: string[] | undefined): boolean {
  if (!paragraphs || memo.paragraphIndex === undefined) return false;
  const text = paragraphs[memo.paragraphIndex];
  return text !== undefined && memoMatchesText(memo, text);
}
