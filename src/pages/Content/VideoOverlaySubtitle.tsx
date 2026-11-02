import React from 'react';

interface Sentence {
  startTime_ms: number;
  endTime_ms: number;
  text: string;
  hTranslation: string;
}

interface VideoOverlaySubtitleProps {
  sentences: Sentence[];
  activeIndex: number | null;
  isEnglishVisible: boolean;
  isKoreanVisible: boolean;
}

export const VideoOverlaySubtitle: React.FC<VideoOverlaySubtitleProps> = ({
  sentences,
  activeIndex,
  isEnglishVisible,
  isKoreanVisible,
}) => {
  if (activeIndex === null || activeIndex === -1 || !sentences[activeIndex]) {
    return null;
  }

  const currentSentence = sentences[activeIndex];
  const hasEnglish = isEnglishVisible && currentSentence.text;
  const hasKorean = isKoreanVisible && currentSentence.hTranslation;

  // 둘 다 비활성화 상태이면 아무것도 렌더링하지 않음
  if (!hasEnglish && !hasKorean) {
    return null;
  }

  return (
    <div className="nf-study-overlay-subtitle-container">
      <div className="nf-study-overlay-subtitle-wrapper">
        {hasEnglish && (
          <div className="nf-study-overlay-sub-en">
            {currentSentence.text}
          </div>
        )}
        {hasKorean && (
          <div className="nf-study-overlay-sub-ko">
            {currentSentence.hTranslation}
          </div>
        )}
      </div>
    </div>
  );
};
