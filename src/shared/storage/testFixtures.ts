import { Memo } from '../memo/types';

// 테스트용 가짜 메모. 글은 직접 쓴 문장이다.
export const netflixMemo = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'n1',
  kind: 'netflix',
  sourceId: 'v1',
  contextText: 'Good morning.',
  start: 5,
  end: 12,
  quote: 'morning',
  note: '',
  createdAt: 1,
  updatedAt: 1,
  sentenceStartMs: 1500,
  videoTitle: 'Test Show',
  seasonSeq: 1,
  episodeSeq: 2,
  episodeTitle: 'Pilot',
  ...overrides,
});

export const bookMemo = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'b1',
  kind: 'book',
  sourceId: 'bk1',
  contextText: 'The kettle sang on the old stove.',
  start: 4,
  end: 10,
  quote: 'kettle',
  note: 'a pot for boiling water',
  createdAt: 1,
  updatedAt: 1,
  chapterId: 'c1',
  paragraphIndex: 0,
  ...overrides,
});
