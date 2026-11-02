import { describe, it, expect } from 'vitest';
import { findSubtitleIndex } from './useNetflixPlayer';

describe('useNetflixPlayer Hook Utilities', () => {
  describe('findSubtitleIndex (Binary Search Algorithm)', () => {
    const mockSentences = [
      { startTime_ms: 1000 }, // index 0
      { startTime_ms: 3000 }, // index 1
      { startTime_ms: 5000 }, // index 2
      { startTime_ms: 8000 }, // index 3
    ];

    it('returns -1 if the currentTime is earlier than the first sentence', () => {
      const index = findSubtitleIndex(mockSentences, 500);
      expect(index).toBe(-1);
    });

    it('returns the exact index if the currentTime matches the startTime_ms exactly', () => {
      const index = findSubtitleIndex(mockSentences, 3000);
      expect(index).toBe(1);
    });

    it('returns the closest past index if the currentTime falls between two sentences', () => {
      const index = findSubtitleIndex(mockSentences, 4500);
      expect(index).toBe(1); // 3000ms 자막이 재생 중이어야 함 (5000ms 이전이므로)
    });

    it('returns the last index if the currentTime is past the last sentence startTime_ms', () => {
      const index = findSubtitleIndex(mockSentences, 10000);
      expect(index).toBe(3);
    });

    it('handles empty sentences list gracefully by returning -1', () => {
      const index = findSubtitleIndex([], 2000);
      expect(index).toBe(-1);
    });
  });
});
