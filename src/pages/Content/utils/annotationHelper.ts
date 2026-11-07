import { Memo } from '../../../shared/memo/types';
import { memoMatchesText } from '../../../shared/memo/annotate';

// 자막을 다시 정렬하면 문장 시작 시간이 조금 달라질 수 있어 이만큼은 같은 문장으로 본다.
const SENTENCE_TIME_TOLERANCE_MS = 1000;

// 이 대사에 붙은 넷플릭스 메모만 고른다. 원문이 달라졌거나 위치가 맞지 않는 메모는 빼되 저장소에는 남겨 둔다.
export function getAnnotationsForSentence(
  memos: Memo[],
  sentence: { startTime_ms: number; text: string }
): Memo[] {
  return memos
    .filter(
      (m) =>
        m.kind === 'netflix' &&
        typeof m.sentenceStartMs === 'number' &&
        Math.abs(m.sentenceStartMs - sentence.startTime_ms) <= SENTENCE_TIME_TOLERANCE_MS &&
        memoMatchesText(m, sentence.text)
    )
    .sort((a, b) => a.start - b.start);
}
