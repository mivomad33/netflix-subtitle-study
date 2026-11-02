import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { calculateSmartSkimTarget } from '../utils/smartSkimHelper';

interface UseNetflixPlayerProps {
  sentences: {
    startTime_ms: number;
    endTime_ms: number;
    text: string;
    hTranslation: string;
  }[];
  videoId: string | number;
  currentTab: number;
  setCurrentTab: (tab: number) => void;
  itemsPerPage: number;
  isAutoSkip: boolean;
  isSmartSkim?: boolean;
  isAutoPause: boolean;
  isSentenceLoop?: boolean;
  isPageEndPause: boolean;
  sentenceRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

export function useNetflixPlayer({
  sentences,
  videoId,
  currentTab,
  setCurrentTab,
  itemsPerPage,
  isAutoSkip,
  isSmartSkim = false,
  isAutoPause,
  isSentenceLoop = false,
  isPageEndPause,
  sentenceRefs,
}: UseNetflixPlayerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isSubtitleActive, setIsSubtitleActive] = useState(false);

  const activeIndexRef = useRef<number | null>(null);
  const isSubtitleActiveRef = useRef(false);
  const isPrevPlayingRef = useRef(false);
  const lastSkipTargetRef = useRef<number | null>(null);
  const lastSkimTimeMsRef = useRef<number | null>(null);
  const lastLoopTargetRef = useRef<number | null>(null);
  const targetLoopIndexRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastIndexRef = useRef<number>(-1);

  // 최신 상태를 루프 내부에서 안전하게 참조하기 위해 Ref로 관리
  const isAutoSkipRef = useRef(isAutoSkip);
  const isSmartSkimRef = useRef(isSmartSkim);
  const isAutoPauseRef = useRef(isAutoPause);
  const isSentenceLoopRef = useRef(isSentenceLoop);
  const isPageEndPauseRef = useRef(isPageEndPause);

  useEffect(() => {
    isAutoSkipRef.current = isAutoSkip;
  }, [isAutoSkip]);

  useEffect(() => {
    isSmartSkimRef.current = isSmartSkim;
  }, [isSmartSkim]);

  useEffect(() => {
    isAutoPauseRef.current = isAutoPause;
  }, [isAutoPause]);

  useEffect(() => {
    isSentenceLoopRef.current = isSentenceLoop;
    targetLoopIndexRef.current = null;
  }, [isSentenceLoop]);

  useEffect(() => {
    isPageEndPauseRef.current = isPageEndPause;
  }, [isPageEndPause]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const player = useMemo(() => {
    console.log('[NF-STUDY] Initializing video player API link in hook...');
    try {
      if (!window.netflix?.appContext?.state?.playerApp) {
        console.warn(
          '[NF-STUDY] window.netflix.appContext.state.playerApp is undefined. Player instance will be null.'
        );
        return null;
      }
      const playerSessionId = window.netflix.appContext.state.playerApp
        .getAPI()
        .videoPlayer.getAllPlayerSessionIds()
        .find((id) => id.startsWith('watch'));
      if (!playerSessionId) {
        console.warn(
          '[NF-STUDY] No player session ID found starting with "watch".'
        );
        return null;
      }
      const playerInstance = window.netflix.appContext.state.playerApp
        .getAPI()
        .videoPlayer.getVideoPlayerBySessionId(playerSessionId);

      console.log(
        '[NF-STUDY] Successfully linked to video player API instance.',
        { playerSessionId, hasInstance: !!playerInstance }
      );
      return playerInstance;
    } catch (e) {
      console.error('[NF-STUDY] Error linking to Netflix player API:', e);
      return null;
    }
  }, []);

  useEffect(() => {
    const checkCurrentTime = () => {
      try {
        if (!player) {
          animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
          return;
        }

        const isPrevPlaying = isPrevPlayingRef.current;
        isPrevPlayingRef.current = player.isPlaying();

        if (!player || !player.isPlaying()) {
          animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
          return;
        }

        const currentTime = player.getCurrentTime();

        // 자동 건너뛰기가 비동기로 동작하여 seek 중인 경우, 타겟 위치에 도달할 때까지 락을 걸고 대기
        if (lastSkipTargetRef.current !== null) {
          if (
            currentTime < lastSkipTargetRef.current - 1500 ||
            currentTime > lastSkipTargetRef.current + 3000
          ) {
            animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
            return;
          } else {
            console.log(
              '[NF-STUDY] Auto-skip seek lock released. reached target:',
              currentTime
            );
            lastSkipTargetRef.current = null;
          }
        }

        // 문장 무한 반복 seek 중인 경우, 타겟 위치에 도달할 때까지 락을 걸고 대기
        if (lastLoopTargetRef.current !== null) {
          if (Math.abs(currentTime - lastLoopTargetRef.current) < 1500) {
            console.log(
              '[NF-STUDY] Sentence loop seek lock released. reached target:',
              currentTime
            );
            lastLoopTargetRef.current = null;
          } else {
            animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
            return;
          }
        }

        const currentPageEndIndex = Math.min(
          (currentTab + 1) * itemsPerPage - 1,
          sentences.length - 1
        );

        const lastIndex = lastIndexRef.current;
        let currentIndex = -1;

        if (lastIndex >= 0 && lastIndex < sentences.length) {
          const currentSentence = sentences[lastIndex];
          const nextSentence = sentences[lastIndex + 1];
          if (
            currentTime >= currentSentence.startTime_ms &&
            (!nextSentence || currentTime < nextSentence.startTime_ms)
          ) {
            currentIndex = lastIndex;
          } else if (lastIndex + 1 < sentences.length) {
            const nextSentenceCheck = sentences[lastIndex + 1];
            const afterNextSentence = sentences[lastIndex + 2];
            if (
              currentTime >= nextSentenceCheck.startTime_ms &&
              (!afterNextSentence || currentTime < afterNextSentence.startTime_ms)
            ) {
              currentIndex = lastIndex + 1;
              lastIndexRef.current = currentIndex;
            }
          }
        }

        if (currentIndex === -1) {
          currentIndex = findSubtitleIndex(sentences, currentTime);
          lastIndexRef.current = currentIndex;
        }

        if (currentIndex === -1) {
          if (isSubtitleActiveRef.current) {
            isSubtitleActiveRef.current = false;
            setIsSubtitleActive(false);
          }
          animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
          return;
        }

        const currentSentence = sentences[currentIndex];
        const nextSentence = sentences[currentIndex + 1];
        let extendedEndTime = currentSentence.endTime_ms + 1000;

        if (nextSentence) {
          extendedEndTime = Math.min(extendedEndTime, nextSentence.startTime_ms - 100);
        }

        const isTimeWithin =
          currentTime >= currentSentence.startTime_ms &&
          currentTime <= extendedEndTime;

        if (isSubtitleActiveRef.current !== isTimeWithin) {
          isSubtitleActiveRef.current = isTimeWithin;
          setIsSubtitleActive(isTimeWithin);
        }

        // 1) 스마트 템포 스킴 (1초 미리보기 건너뛰기) 기능 구현
        if (isSmartSkimRef.current) {
          const skimResult = calculateSmartSkimTarget({
            currentTimeMs: currentTime,
            sentences,
            lastSkimTimeMs: lastSkimTimeMsRef.current,
          });

          if (skimResult.shouldSeek && skimResult.targetTimeMs !== null) {
            console.log('[NF-STUDY] Smart-skim triggered.', {
              from: currentTime,
              to: skimResult.targetTimeMs,
              reason: skimResult.reason,
            });
            lastSkimTimeMsRef.current = skimResult.targetTimeMs;
            lastSkipTargetRef.current = skimResult.targetTimeMs;
            player.seek(skimResult.targetTimeMs);
            animationFrameRef.current =
              requestAnimationFrame(checkCurrentTime);
            return;
          }
        }
        // 2) 기존 자동 건너뛰기 기능 구현
        else if (isAutoSkipRef.current && currentIndex !== -1) {
          const currentSentence = sentences[currentIndex];
          const nextSentence = sentences[currentIndex + 1];
          if (nextSentence) {
            const silenceDuration =
              nextSentence.startTime_ms - currentSentence.endTime_ms;

            if (
              silenceDuration >= 5000 &&
              currentTime >= currentSentence.endTime_ms + 500 &&
              currentTime < nextSentence.startTime_ms - 1000
            ) {
              const targetTime = nextSentence.startTime_ms - 1000;
              console.log('[NF-STUDY] Auto-skip silent scene triggered.', {
                from: currentTime,
                to: targetTime,
                silenceDuration,
              });
              lastSkipTargetRef.current = targetTime;
              player.seek(targetTime);
              animationFrameRef.current =
                requestAnimationFrame(checkCurrentTime);
              return;
            }
          }
        }

        // 문장 무한 반복 (Sentence Loop) 구현
        if (
          isSentenceLoopRef.current &&
          isPrevPlaying &&
          lastLoopTargetRef.current === null
        ) {
          // 반복 대상 인덱스가 없으면 현재 activeIndex 또는 currentIndex로 최초 1회 고정
          if (targetLoopIndexRef.current === null) {
            if (currentIndex !== -1) {
              targetLoopIndexRef.current = currentIndex;
            } else if (activeIndexRef.current !== null) {
              targetLoopIndexRef.current = activeIndexRef.current;
            }
          }

          const loopIdx = targetLoopIndexRef.current;

          if (loopIdx !== null && loopIdx >= 0 && loopIdx < sentences.length) {
            const targetSentence = sentences[loopIdx];
            const nextSentence = sentences[loopIdx + 1];
            const loopEndTime = nextSentence
              ? Math.min(targetSentence.endTime_ms + 400, nextSentence.startTime_ms - 50)
              : targetSentence.endTime_ms + 400;

            if (currentTime >= loopEndTime) {
              console.log('[NF-STUDY] Sentence loop triggered. Seeking to sentence start:', {
                loopIdx,
                from: currentTime,
                to: targetSentence.startTime_ms,
              });
              lastLoopTargetRef.current = targetSentence.startTime_ms;
              lastIndexRef.current = loopIdx;
              player.seek(targetSentence.startTime_ms);
              animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
              return;
            }
          }
        }

        // 자동 멈춤 기능 구현
        if (
          isAutoPauseRef.current &&
          activeIndexRef.current !== null &&
          currentIndex === activeIndexRef.current + 1 &&
          isPrevPlaying
        ) {
          console.log(
            '[NF-STUDY] Auto-pause triggered.',
            {
              prevActiveIndex: activeIndexRef.current,
              newIndex: currentIndex,
            }
          );
          player.pause();
          animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
          return;
        }

        // 현재 페이지의 마지막 문장이 재생 중이고 다음 문장으로 넘어갈 때
        if (
          isPageEndPauseRef.current &&
          currentIndex === currentPageEndIndex + 1 &&
          isPrevPlaying
        ) {
          console.log(
            '[NF-STUDY] Auto-pause triggered (reached page boundary).',
            {
              currentPageEndIndex,
              newIndex: currentIndex,
            }
          );
          player.pause();
          animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
          return;
        }

        // 현재 문장이 있는 탭으로 자동 전환
        const targetTab = Math.floor(currentIndex / itemsPerPage);
        if (targetTab !== currentTab) {
          console.log('[NF-STUDY] Syncing tab index with current play time.', {
            prevTab: currentTab,
            targetTab,
            currentIndex,
          });
          setCurrentTab(targetTab);
        }

        setActiveIndex(currentIndex);

        const currentElement = sentenceRefs.current[currentIndex];
        if (currentElement) {
          const rect = currentElement.getBoundingClientRect();
          const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

          if (!isVisible) {
            currentElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }
        }
      } catch (error) {
        console.error('[NF-STUDY] Error in checkCurrentTime loop:', error);
      }

      animationFrameRef.current = requestAnimationFrame(checkCurrentTime);
    };

    animationFrameRef.current = requestAnimationFrame(checkCurrentTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [sentences, currentTab, player, activeIndex, itemsPerPage, setCurrentTab, sentenceRefs]);

  const handlePlaySentence = useCallback(
    (startTime_ms: number) => {
      if (!player) {
        return;
      }
      const newIndex = sentences.findIndex((s) => s.startTime_ms === startTime_ms);
      if (newIndex !== -1) {
        targetLoopIndexRef.current = newIndex;
        lastIndexRef.current = newIndex;
      }
      player.seek(startTime_ms);
      if (!player.isPlaying()) {
        player.play();
      }
    },
    [player, sentences]
  );

  return {
    player,
    activeIndex,
    isSubtitleActive,
    handlePlaySentence,
  };
}

// 이진 탐색을 기반으로 현재 시간에 해당하는 자막 인덱스 탐색 (O(log N))
export function findSubtitleIndex(
  sentences: { startTime_ms: number }[],
  currentTime: number
): number {
  let low = 0;
  let high = sentences.length - 1;
  let ans = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sentences[mid].startTime_ms <= currentTime) {
      ans = mid;
      low = mid + 1; // 더 뒤에 일치하는 것이 있는지 계속 탐색
    } else {
      high = mid - 1;
    }
  }
  return ans;
}
