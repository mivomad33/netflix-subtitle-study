import { Memo } from '../../../shared/memo/types';

// 넷플릭스 메모에서 그 장면(또는 영상 처음)으로 가는 주소를 만든다.
export function netflixWatchUrl(
  memo: Memo,
  { fromStart = false }: { fromStart?: boolean } = {}
) {
  const base = `https://www.netflix.com/watch/${encodeURIComponent(
    memo.sourceId
  )}`;
  if (fromStart || typeof memo.sentenceStartMs !== 'number') return base;
  return `${base}?t=${Math.floor(memo.sentenceStartMs / 1000)}`;
}
