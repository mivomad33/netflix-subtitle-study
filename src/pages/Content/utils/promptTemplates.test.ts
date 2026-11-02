import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyStudyPrompt, copySpeakingPrompt } from './promptTemplates';

describe('promptTemplates Utilities', () => {
  beforeEach(() => {
    // navigator.clipboard Mocking
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  const mockSentences = [
    {
      startTime_ms: 1500, // 00:01
      endTime_ms: 3000,
      text: 'Good morning.',
      hTranslation: '좋은 아침입니다.',
    },
    {
      startTime_ms: 3662000, // 01:01:02
      endTime_ms: 3665000,
      text: 'How are you?',
      hTranslation: '어떻게 지내세요?',
    },
  ];

  describe('copyStudyPrompt', () => {
    it('formats sentences correctly with time format and calls navigator.clipboard', async () => {
      const onSuccess = vi.fn();
      copyStudyPrompt(mockSentences, onSuccess);

      // 클립보드 API가 호출되었는지 체크
      expect(navigator.clipboard.writeText).toHaveBeenCalled();

      const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
      
      // formatTime 변환값 검증:
      // 1500ms -> "00:01"
      // 3662000ms -> "01:01:02"
      expect(copiedText).toContain('[00:01] Good morning. / 좋은 아침입니다.');
      expect(copiedText).toContain('[01:01:02] How are you? / 어떻게 지내세요?');
      expect(copiedText).toContain('내가 영어-한글 자막을 제공하면 분석해서, 학습자가 영상을 보기 전에 반드시 익혀야 할 내용을 정리해줘.');
    });
  });

  describe('copySpeakingPrompt', () => {
    it('formats sentences correctly and copies speaking prompt guidelines', () => {
      const onSuccess = vi.fn();
      copySpeakingPrompt(mockSentences, onSuccess);

      expect(navigator.clipboard.writeText).toHaveBeenCalled();

      const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
      
      expect(copiedText).toContain('[00:01] Good morning. / 좋은 아침입니다.');
      expect(copiedText).toContain('[01:01:02] How are you? / 어떻게 지내세요?');
      expect(copiedText).toContain('내가 영어-한글 자막을 제공하면 분석해서, 이 자료를 바탕으로 영작 학습을 목적으로 짦은 영어 다이얼로그를 생성해줘');
    });
  });
});
