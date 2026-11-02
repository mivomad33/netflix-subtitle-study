import { describe, it, expect } from 'vitest';
import { 
  extractValidSubtitles, 
  alignSubtitles, 
  processExportSubtitles 
} from './subtitleHelper';

describe('subtitleHelper Core Algorithms', () => {
  describe('extractValidSubtitles (Filtering Rules)', () => {
    it('keeps normal alphanumeric subtitles and filters out bracket noises & non-alphanumeric ones', () => {
      const mockRawData = {
        parsedSubs: [
          [1000, 2000, 'Hello World'],              // 유효함
          [3000, 4000, '[Music playing]'],          // 괄호 효과음 (무효)
          [5000, 6000, '🎵🎵🎵'],                     // 기호만 있음 (무효)
          [7000, 8000, 'How are you? [chuckles]'], // 괄호가 섞여있지만 괄호로만 끝나거나 시작하는 게 아니므로 유효
        ],
      };

      const result = extractValidSubtitles(mockRawData);

      expect(result.length).toBe(2);
      expect(result[0].text).toBe('Hello World');
      expect(result[1].text).toBe('How are you? [chuckles]');
    });
  });

  describe('alignSubtitles (Timeline Pairing)', () => {
    it('pairs English and Korean subtitles that overlap in time', () => {
      const enSubs = [
        { begin: 1000, end: 2000, text: 'Hello' },
        { begin: 3000, end: 4000, text: 'World' },
      ];

      const koSubs = [
        { begin: 1100, end: 1900, text: '안녕' },
        { begin: 3200, end: 3800, text: '세상' },
      ];

      const aligned = alignSubtitles(enSubs, koSubs);

      // 정합 결과 검증 (printSubs는 [English, Korean][] 튜플 형태)
      expect(aligned.printSubs.length).toBe(2);
      expect(aligned.printSubs[0][0]).toBe('Hello');
      expect(aligned.printSubs[0][1]).toBe('안녕');
      
      expect(aligned.printSubs[1][0]).toBe('World');
      expect(aligned.printSubs[1][1]).toBe('세상');
    });

    it('returns empty mappings when no translation matched', () => {
      const enSubs = [
        { begin: 1000, end: 2000, text: 'Hello' },
      ];
      const koSubs: any[] = [];

      const aligned = alignSubtitles(enSubs, koSubs);
      
      // alignSubtitles는 source와 매칭된 것만 짝을 지으며
      // ko가 없으면 매칭된 매핑을 생성하지 않음 (printSubs.length = 0)
      expect(aligned.printSubs.length).toBe(0);
    });
  });

  describe('processExportSubtitles (Final Export Formatting)', () => {
    it('formats aligned subtitles into final array of sentences', async () => {
      const mockExportData = {
        subtitles: [
          { begin: 1000, end: 2000, text: 'Hello' },
        ],
        hTranslations: {
          printIndexes: [
            { sourceIndexes: [0], translationIndexes: [0] },
          ],
          raw: [
            { text: '안녕' },
          ],
          printSubs: [
            ['Hello', '안녕'],
          ],
        },
      };

      const finalResult = await processExportSubtitles(mockExportData);

      expect(finalResult.length).toBe(1);
      expect(finalResult[0].startTime_ms).toBe(1000);
      expect(finalResult[0].endTime_ms).toBe(2000);
      expect(finalResult[0].text).toBe('Hello');
      expect(finalResult[0].hTranslation).toBe('안녕');
    });
  });
});
