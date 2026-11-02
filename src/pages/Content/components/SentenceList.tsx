import React from 'react';

interface SentenceListProps {
  sentences: {
    startTime_ms: number;
    endTime_ms: number;
    text: string;
    hTranslation: string;
  }[];
  currentTab: number;
  itemsPerPage: number;
  activeIndex: number | null;
  isEnglishVisible: boolean;
  isAllVisible: boolean;
  visibleTranslations: Set<number>;
  visibleEnglishSentences: Set<number>;
  toggleEnglishSentence: (index: number) => void;
  toggleTranslation: (index: number) => void;
  handlePlaySentence: (startTime_ms: number) => void;
  sentenceRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export const SentenceList: React.FC<SentenceListProps> = ({
  sentences,
  currentTab,
  itemsPerPage,
  activeIndex,
  isEnglishVisible,
  isAllVisible,
  visibleTranslations,
  visibleEnglishSentences,
  toggleEnglishSentence,
  toggleTranslation,
  handlePlaySentence,
  sentenceRefs,
}) => {
  const getCurrentPageSentences = () => {
    const start = currentTab * itemsPerPage;
    const end = start + itemsPerPage;
    return sentences.slice(start, end);
  };

  return (
    <div className="sentence-list">
      {getCurrentPageSentences().map((sentence, index) => {
        const globalIndex = currentTab * itemsPerPage + index;
        return (
          <div
            key={index}
            ref={(el) => (sentenceRefs.current[globalIndex] = el)}
            className={`sentence ${
              globalIndex === activeIndex ? 'active' : ''
            }`}
          >
            <div className="sentence-header">
              <div
                className="sentence-time"
                onClick={() => handlePlaySentence(sentence.startTime_ms)}
              >
                {formatTime(sentence.startTime_ms)}
              </div>
            </div>
            <div
              className={`sentence-text ${
                !isEnglishVisible
                  ? visibleEnglishSentences.has(globalIndex)
                    ? 'hide-english always-visible'
                    : 'hide-english'
                  : ''
              }`}
              onClick={() => {
                if (!isEnglishVisible) {
                  toggleEnglishSentence(globalIndex);
                }
              }}
            >
              {sentence.text}
            </div>
            <div
              className={`sentence-translation ${
                isAllVisible || visibleTranslations.has(globalIndex)
                  ? 'always-visible'
                  : ''
              }`}
              onClick={() => toggleTranslation(globalIndex)}
            >
              {sentence.hTranslation}
            </div>
          </div>
        );
      })}
    </div>
  );
};
