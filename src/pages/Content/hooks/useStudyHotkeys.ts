import { useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

interface UseStudyHotkeysProps {
  player: any;
  sentences: {
    startTime_ms: number;
    endTime_ms: number;
    text: string;
    hTranslation: string;
  }[];
  activeIndex: number | null;
  isAutoPause: boolean;
  setIsAutoPause: React.Dispatch<React.SetStateAction<boolean>>;
  isSentenceLoop?: boolean;
  setIsSentenceLoop?: React.Dispatch<React.SetStateAction<boolean>>;
  handlePlaySentence: (startTime_ms: number) => void;
  onTogglePanel?: () => void;
}

export function useStudyHotkeys({
  player,
  sentences,
  activeIndex,
  isAutoPause,
  setIsAutoPause,
  isSentenceLoop,
  setIsSentenceLoop,
  handlePlaySentence,
  onTogglePanel,
}: UseStudyHotkeysProps) {
  const activeIndexRef = useRef<number | null>(activeIndex);
  const isAutoPauseRef = useRef(isAutoPause);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    isAutoPauseRef.current = isAutoPause;
  }, [isAutoPause]);

  const handleTempoSkip = useCallback(() => {
    if (!player) return;
    const currentTime = player.getCurrentTime();
    const nextSentence = sentences.find((s) => s.startTime_ms > currentTime);

    if (nextSentence) {
      const interval = nextSentence.startTime_ms - currentTime;
      if (interval < 5000) {
        handlePlaySentence(nextSentence.startTime_ms);
      } else {
        player.seek(currentTime + 5000);
      }
    } else {
      player.seek(currentTime + 5000);
    }
  }, [player, sentences, handlePlaySentence]);

  const handleTempoRewind = useCallback(() => {
    if (!player) return;
    const currentTime = player.getCurrentTime();
    
    const prevSentences = sentences
      .filter((s) => s.startTime_ms < currentTime)
      .reverse();

    if (prevSentences.length > 0) {
      const currentActiveIndex = activeIndexRef.current;
      let prevSentence = prevSentences[0];
      
      if (
        currentActiveIndex !== null &&
        sentences[currentActiveIndex].startTime_ms <= currentTime &&
        sentences[currentActiveIndex].endTime_ms >= currentTime
      ) {
        prevSentence = prevSentences[1] || prevSentences[0];
      }

      const interval = currentTime - prevSentence.startTime_ms;
      
      if (interval < 5000) {
        handlePlaySentence(prevSentence.startTime_ms);
      } else if (interval >= 5000 && interval < 10000) {
        player.seek(currentTime - interval / 2);
      } else {
        player.seek(Math.max(0, currentTime - 5000));
      }
    } else {
      player.seek(Math.max(0, currentTime - 5000));
    }
  }, [player, sentences, handlePlaySentence]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const currentActiveIndex = activeIndexRef.current;

      switch (event.code) {
        case 'KeyQ':
          setIsAutoPause((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEYS.IS_AUTO_PAUSE, next.toString());
            return next;
          });
          break;
        case 'KeyR':
          if (setIsSentenceLoop) {
            setIsSentenceLoop((prev) => {
              const next = !prev;
              localStorage.setItem(STORAGE_KEYS.IS_SENTENCE_LOOP, next.toString());
              return next;
            });
          }
          break;
        case 'KeyT':
          if (onTogglePanel) {
            onTogglePanel();
          }
          break;
        case 'KeyW':
          handleTempoRewind();
          break;
        case 'KeyE':
          handleTempoSkip();
          break;
        case 'KeyA':
          if (currentActiveIndex !== null && currentActiveIndex > 0) {
            handlePlaySentence(sentences[currentActiveIndex - 1].startTime_ms);
          }
          break;
        case 'KeyS':
          if (currentActiveIndex !== null) {
            handlePlaySentence(sentences[currentActiveIndex].startTime_ms);
          }
          break;
        case 'KeyD':
          if (
            currentActiveIndex !== null &&
            currentActiveIndex < sentences.length - 1
          ) {
            handlePlaySentence(sentences[currentActiveIndex + 1].startTime_ms);
          }
          break;
      }
    },
    [handlePlaySentence, handleTempoSkip, handleTempoRewind, onTogglePanel, sentences, setIsAutoPause, setIsSentenceLoop]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);
}
