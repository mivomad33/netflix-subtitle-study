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

const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable)
  );
};

// 학습 패널에 포커스가 있거나(버튼 포함) 아무 곳에도 포커스가 없을 때 누른 스페이스인지.
// 넷플릭스 플레이어에 포커스가 있을 때는 넷플릭스가 처리하게 둔다.
export const isPanelSpaceKey = (event: KeyboardEvent) => {
  if (event.code !== 'Space' || isEditableTarget(event.target)) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as Node | null;
  if (!target || target === document.body || target === document.documentElement) {
    return true;
  }
  const studyPanel = document.getElementById('studyPanel');
  return !!studyPanel && studyPanel.contains(target);
};

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

  // 스페이스 재생·정지. 넷플릭스보다 먼저 받도록 window의 캡처 단계에서 처리하고,
  // 넷플릭스가 또 토글하거나 포커스된 버튼이 다시 눌리지 않게 이벤트를 멈춘다.
  useEffect(() => {
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (!player || !isPanelSpaceKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (player.isPlaying()) {
        player.pause();
      } else {
        player.play();
      }
    };
    const handleSpaceUp = (event: KeyboardEvent) => {
      if (!player || !isPanelSpaceKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', handleSpaceDown, true);
    window.addEventListener('keyup', handleSpaceUp, true);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown, true);
      window.removeEventListener('keyup', handleSpaceUp, true);
    };
  }, [player]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);
}
