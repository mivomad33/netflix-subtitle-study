import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import ReactDOM from 'react-dom';
import './StudyPanel.css';
import StudyChecklist from './StudyChecklist';
import { VideoOverlaySubtitle } from './VideoOverlaySubtitle';
import {
  VideoMetadata,
  PageChecklist,
} from '../../types';
import { useNetflixPlayer } from './hooks/useNetflixPlayer';
import { useStudyHotkeys } from './hooks/useStudyHotkeys';
import { useAnnotations } from './hooks/useAnnotations';
import { StudyControlPanel } from './components/StudyControlPanel';
import { SentenceList } from './components/SentenceList';
import { RoundSelector } from './components/RoundSelector';
import { copyStudyPrompt, copySpeakingPrompt } from './utils/promptTemplates';
import { registerVideoMetadata } from './utils/dashboardHelper';
import { togglePanelVisibility } from './utils/layoutManager';
import { useVideoProgress } from './hooks/useVideoProgress';
import { settingSetter, useNetflixSettings, useStudyAuth } from './utils/studyStore';
import { LoginNotice, StorageErrorNotice, WaitingNotice } from './components/StudyNotices';

interface StudyPanelProps {
  sentences: {
    startTime_ms: number;
    endTime_ms: number;
    text: string;
    hTranslation: string;
  }[];
  videoId: string | number;
  isPanelVisible: boolean;
  isOverlayVisible: boolean;
  onTogglePanel: () => void;
  onToggleOverlay: () => void;
}

const StudyPanel: React.FC<StudyPanelProps> = ({
  sentences,
  videoId,
  isPanelVisible,
  isOverlayVisible,
  onTogglePanel,
  onToggleOverlay,
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(
    new Set()
  );
  // 설정은 한곳(studyStore)에 있다. 로그인했으면 저장되고, 아니면 이 화면에서만 바뀐다.
  const settings = useNetflixSettings();
  const auth = useStudyAuth();
  const {
    isEnglishVisible,
    isKoreanVisible: isAllVisible,
    isAutoPause,
    isPageEndPause,
    isAutoSkip,
    isSmartSkim,
    isSentenceLoop,
    fontSize,
  } = settings;
  const setIsEnglishVisible = settingSetter('isEnglishVisible');
  const setIsAllVisible = settingSetter('isKoreanVisible');
  const setIsAutoPause = settingSetter('isAutoPause');
  const setIsPageEndPause = settingSetter('isPageEndPause');
  const setIsAutoSkip = settingSetter('isAutoSkip');
  const setIsSmartSkim = settingSetter('isSmartSkim');
  const setIsSentenceLoop = settingSetter('isSentenceLoop');
  const setFontSize = settingSetter('fontSize');
  const [visibleEnglishSentences, setVisibleEnglishSentences] = useState<
    Set<number>
  >(new Set());

  const {
    status: progressStatus,
    checklists,
    itemsPerPage,
    updateChecklists: setChecklists,
    changeItemsPerPage,
  } = useVideoProgress(videoId);

  const [currentSelectedRound, setCurrentSelectedRound] = useState<number>(
    checklists.currentActiveRound
  );

  useEffect(() => {
    setCurrentSelectedRound(checklists.currentActiveRound);
  }, [checklists.currentActiveRound]);

  const roundChecklist = checklists.rounds[currentSelectedRound] || {};
  const currentChecklist: PageChecklist = roundChecklist[currentTab] || {
    preStudy: false,
    noSubtitles: false,
    scriptAnalysis: false,
    shadowing: false,
    speaking: false,
  };

  const totalTabs = Math.ceil(sentences.length / itemsPerPage);

  // 체크리스트·회차·공부한 영상 목록은 로그인해 다 읽은 뒤에만 쓸 수 있다.
  const canSaveProgress = progressStatus === 'ready';

  const handleToggleChecklist = (key: keyof PageChecklist) => {
    if (!canSaveProgress) return;
    setChecklists((prev) => {
      const roundData = prev.rounds[currentSelectedRound] || {};
      const pageData = roundData[currentTab] || {
        preStudy: false,
        noSubtitles: false,
        scriptAnalysis: false,
        shadowing: false,
        speaking: false,
      };
      return {
        ...prev,
        rounds: {
          ...prev.rounds,
          [currentSelectedRound]: {
            ...roundData,
            [currentTab]: {
              ...pageData,
              [key]: !pageData[key],
            },
          },
        },
      };
    });
    registerVideoMetadata(videoId, totalTabs);
  };

  const isPageCompletedForRound = (roundNum: number, pageIdx: number) => {
    const roundData = checklists.rounds[roundNum] || {};
    const pageData = roundData[pageIdx];
    return (
      pageData &&
      pageData.preStudy &&
      pageData.noSubtitles &&
      pageData.scriptAnalysis &&
      pageData.shadowing &&
      pageData.speaking
    );
  };

  const getCompletedPagesCountForRound = (roundNum: number) => {
    let count = 0;
    for (let i = 0; i < totalTabs; i++) {
      if (isPageCompletedForRound(roundNum, i)) {
        count++;
      }
    }
    return count;
  };

  const isPageCompleted = (pageIdx: number) => {
    return isPageCompletedForRound(currentSelectedRound, pageIdx);
  };

  const handleStartNewRound = () => {
    if (!canSaveProgress) return;
    const nextRound = checklists.currentActiveRound + 1;
    setChecklists((prev) => ({
      ...prev,
      currentActiveRound: nextRound,
      rounds: {
        ...prev.rounds,
        [nextRound]: {},
      },
    }));
    registerVideoMetadata(videoId, totalTabs);
  };

  const handleResetStudyProgress = () => {
    if (!canSaveProgress) return;
    if (
      window.confirm(
        '이 영상의 모든 회차 학습 기록을 초기화하시겠습니까?\n(이 작업은 되돌릴 수 없습니다.)'
      )
    ) {
      setChecklists(() => ({
        currentActiveRound: 1,
        rounds: {
          1: {},
        },
      }));
      registerVideoMetadata(videoId, totalTabs);
    }
  };

  const [copied, setCopied] = useState(false);
  const [speakingCopied, setSpeakingCopied] = useState(false);

  const getCurrentPageSentences = useCallback(() => {
    const start = currentTab * itemsPerPage;
    const end = start + itemsPerPage;
    return sentences.slice(start, end);
  }, [currentTab, itemsPerPage, sentences]);

  const handleCopyPrompt = () => {
    copyStudyPrompt(getCurrentPageSentences(), () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleCopySpeakingPrompt = () => {
    copySpeakingPrompt(getCurrentPageSentences(), () => {
      setSpeakingCopied(true);
      setTimeout(() => setSpeakingCopied(false), 1500);
    });
  };

  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalTabs <= 7) {
      for (let i = 0; i < totalTabs; i++) pages.push(i);
      return pages;
    }

    pages.push(0);

    let startPage = Math.max(1, currentTab - 2);
    let endPage = Math.min(totalTabs - 2, currentTab + 2);

    if (currentTab <= 3) {
      startPage = 1;
      endPage = 5;
    }
    if (currentTab >= totalTabs - 4) {
      startPage = totalTabs - 6;
      endPage = totalTabs - 2;
    }

    if (startPage > 1) {
      pages.push('left-ellipsis');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalTabs - 2) {
      pages.push('right-ellipsis');
    }

    pages.push(totalTabs - 1);

    return pages;
  };

  const { annotations, addAnnotation, updateNote, removeAnnotation, saveFailed } =
    useAnnotations(videoId, sentences);
  const [editingAnnotationId, setEditingAnnotationId] = useState<
    string | null
  >(null);

  // 1. 플레이어 상태 제어 훅
  const {
    player,
    activeIndex,
    isSubtitleActive,
    handlePlaySentence,
  } = useNetflixPlayer({
    sentences,
    videoId,
    currentTab,
    setCurrentTab,
    itemsPerPage,
    isAutoSkip,
    isSmartSkim,
    isAutoPause,
    isSentenceLoop,
    isPageEndPause,
    sentenceRefs,
    isFollowPaused: editingAnnotationId !== null,
  });

  // 메모를 여는 동안에는 영상을 멈춰 글을 쓰는 사이에 대사가 지나가지 않게 한다.
  const handleEditAnnotation = useCallback(
    (id: string | null) => {
      if (id !== null && player && player.isPlaying()) {
        player.pause();
      }
      setEditingAnnotationId(id);
    },
    [player]
  );

  useEffect(() => {
    setEditingAnnotationId(null);
  }, [currentTab]);

  // 3. 단축키 바인딩 훅
  useStudyHotkeys({
    player,
    sentences,
    activeIndex,
    isAutoPause,
    setIsAutoPause,
    isSentenceLoop,
    setIsSentenceLoop,
    handlePlaySentence,
    onTogglePanel: togglePanelVisibility,
  });

  const toggleTranslation = (index: number) => {
    setVisibleTranslations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleEnglishSentence = (index: number) => {
    setVisibleEnglishSentences((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleTabClick = (index: number) => {
    if (currentTab === index) {
      const firstSentenceIndex = index * itemsPerPage;
      handlePlaySentence(sentences[firstSentenceIndex].startTime_ms);
    } else {
      if (player && player.isPlaying()) {
        player.pause();
      }
      setCurrentTab(index);
    }
  };

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      settingsRef.current &&
      !settingsRef.current.contains(event.target as Node)
    ) {
      setShowSettings(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  const handleItemsPerPageChange = (newValue: number) => {
    if (newValue === itemsPerPage) return;

    let videoTitle = '이 영상';
    try {
      const videoMetadata = window.netflix.appContext.state.playerApp
        .getAPI()
        .getVideoMetadataByVideoId(videoId) as VideoMetadata;
      videoTitle = videoMetadata._metadataObject?.video?.title
        ? `"${videoMetadata._metadataObject.video.title}"`
        : '이 영상';
    } catch (e) {
      console.error(e);
    }

    if (
      window.confirm(
        `페이지당 대사 수를 ${newValue}개로 변경하시겠습니까?\n변경 시 ${videoTitle}의 체크리스트가 초기화될 수 있습니다.`
      )
    ) {
      changeItemsPerPage(newValue);
      setCurrentTab(0);

      if (canSaveProgress) {
        const nextTotalTabs = Math.ceil(sentences.length / newValue);
        registerVideoMetadata(videoId, nextTotalTabs);
      }
    }
  };



  const watchVideoElement = document.querySelector('.watch-video');

  return (
    <>
      {isOverlayVisible &&
        watchVideoElement &&
        ReactDOM.createPortal(
          <VideoOverlaySubtitle
            sentences={sentences}
            activeIndex={isSubtitleActive ? activeIndex : null}
            isEnglishVisible={isEnglishVisible}
            isKoreanVisible={isAllVisible}
          />,
          watchVideoElement
        )}

      {isPanelVisible && (
        <div
          className="container"
          style={{ '--base-font-size': `${fontSize}pt` } as React.CSSProperties}
        >
          <div className="pagination">
            {getPageNumbers().map((page, index) => {
              if (page === 'left-ellipsis' || page === 'right-ellipsis') {
                return (
                  <span key={`ellipsis-${index}`} className="page-ellipsis">
                    ...
                  </span>
                );
              }

              const pageIndex = page as number;
              const isCompleted = isPageCompleted(pageIndex);
              return (
                <button
                  key={pageIndex}
                  className={`page-btn ${
                    currentTab === pageIndex ? 'active' : ''
                  } ${isCompleted ? 'completed' : ''}`}
                  onClick={() => handleTabClick(pageIndex)}
                >
                  {pageIndex + 1}
                </button>
              );
            })}
          </div>
          
          <StudyControlPanel
            isEnglishVisible={isEnglishVisible}
            setIsEnglishVisible={setIsEnglishVisible}
            isAllVisible={isAllVisible}
            setIsAllVisible={setIsAllVisible}
            isAutoPause={isAutoPause}
            setIsAutoPause={setIsAutoPause}
            isSentenceLoop={isSentenceLoop}
            setIsSentenceLoop={setIsSentenceLoop}
            isPageEndPause={isPageEndPause}
            setIsPageEndPause={setIsPageEndPause}
            isAutoSkip={isAutoSkip}
            setIsAutoSkip={setIsAutoSkip}
            isSmartSkim={isSmartSkim}
            setIsSmartSkim={setIsSmartSkim}
            copied={copied}
            handleCopyPrompt={handleCopyPrompt}
            speakingCopied={speakingCopied}
            handleCopySpeakingPrompt={handleCopySpeakingPrompt}
            fontSize={fontSize}
            setFontSize={setFontSize}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            itemsPerPage={itemsPerPage}
            handleItemsPerPageChange={handleItemsPerPageChange}
            settingsRef={settingsRef}
            onResetStudyProgress={handleResetStudyProgress}
            canSaveProgress={canSaveProgress}
          />

          <div className="study-notice-row">
            <StorageErrorNotice />
          </div>

          {progressStatus === 'waiting' || progressStatus === 'out' ? (
            <div className="study-notice-row">
              <LoginNotice auth={auth} />
            </div>
          ) : progressStatus === 'loading' ? (
            <div className="study-notice-row">
              <WaitingNotice text="학습 기록을 불러오는 중…" />
            </div>
          ) : (
          <div className="checklist-row-container">
            <RoundSelector
              currentActiveRound={checklists.currentActiveRound}
              currentSelectedRound={currentSelectedRound}
              onChangeSelectedRound={setCurrentSelectedRound}
              getCompletedPagesCountForRound={getCompletedPagesCountForRound}
              totalTabs={totalTabs}
              onStartNewRound={handleStartNewRound}
            />

            <StudyChecklist
              currentTab={currentTab}
              currentChecklist={currentChecklist}
              onToggleChecklist={handleToggleChecklist}
            />
          </div>
          )}

          <SentenceList
            sentences={sentences}
            currentTab={currentTab}
            itemsPerPage={itemsPerPage}
            activeIndex={activeIndex}
            isEnglishVisible={isEnglishVisible}
            isAllVisible={isAllVisible}
            visibleTranslations={visibleTranslations}
            visibleEnglishSentences={visibleEnglishSentences}
            toggleEnglishSentence={toggleEnglishSentence}
            toggleTranslation={toggleTranslation}
            handlePlaySentence={handlePlaySentence}
            sentenceRefs={sentenceRefs}
            annotations={annotations}
            editingAnnotationId={editingAnnotationId}
            onAddAnnotation={addAnnotation}
            onUpdateNote={updateNote}
            onRemoveAnnotation={removeAnnotation}
            onEditAnnotation={handleEditAnnotation}
            saveFailed={saveFailed}
            canAnnotate={auth === 'in'}
          />
        </div>
      )}
    </>
  );
};

export default StudyPanel;
