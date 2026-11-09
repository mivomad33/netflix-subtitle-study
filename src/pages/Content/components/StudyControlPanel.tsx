import React from 'react';

interface StudyControlPanelProps {
  isEnglishVisible: boolean;
  setIsEnglishVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isAllVisible: boolean;
  setIsAllVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isAutoPause: boolean;
  setIsAutoPause: React.Dispatch<React.SetStateAction<boolean>>;
  isSentenceLoop?: boolean;
  setIsSentenceLoop?: React.Dispatch<React.SetStateAction<boolean>>;
  isPageEndPause: boolean;
  setIsPageEndPause: React.Dispatch<React.SetStateAction<boolean>>;
  isAutoSkip: boolean;
  setIsAutoSkip: React.Dispatch<React.SetStateAction<boolean>>;
  isSmartSkim?: boolean;
  setIsSmartSkim?: React.Dispatch<React.SetStateAction<boolean>>;
  copied: boolean;
  handleCopyPrompt: () => void;
  speakingCopied: boolean;
  handleCopySpeakingPrompt: () => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  itemsPerPage: number;
  handleItemsPerPageChange: (size: number) => void;
  settingsRef: React.RefObject<HTMLDivElement>;
  onResetStudyProgress: () => void;
  // 로그인해 학습 기록을 저장할 수 있는지. 아니면 기록 초기화를 숨긴다(지울 기록이 없다).
  canSaveProgress?: boolean;
}

export const StudyControlPanel: React.FC<StudyControlPanelProps> = ({
  isEnglishVisible,
  setIsEnglishVisible,
  isAllVisible,
  setIsAllVisible,
  isAutoPause,
  setIsAutoPause,
  isSentenceLoop = false,
  setIsSentenceLoop,
  isPageEndPause,
  setIsPageEndPause,
  isAutoSkip,
  setIsAutoSkip,
  isSmartSkim = false,
  setIsSmartSkim,
  copied,
  handleCopyPrompt,
  speakingCopied,
  handleCopySpeakingPrompt,
  fontSize,
  setFontSize,
  showSettings,
  setShowSettings,
  itemsPerPage,
  handleItemsPerPageChange,
  settingsRef,
  onResetStudyProgress,
  canSaveProgress = true,
}) => {
  return (
    <div className="control-panel">
      <button
        className={`toggle-all-btn ${isEnglishVisible ? 'active' : ''}`}
        onClick={() => {
          setIsEnglishVisible((prev) => !prev);
        }}
      >
        💬 영어 자막
      </button>
      <button
        className={`toggle-all-btn ${isAllVisible ? 'active' : ''}`}
        onClick={() => {
          setIsAllVisible((prev) => !prev);
        }}
      >
        💬 한국어 자막
      </button>
      <button
        className={`toggle-all-btn ${isAutoPause ? 'active' : ''}`}
        onClick={() => {
          setIsAutoPause((prev) => !prev);
        }}
      >
        ⏱️ 자동 멈춤
      </button>
      <button
        className={`toggle-all-btn ${isSentenceLoop ? 'active' : ''}`}
        onClick={() => {
          if (setIsSentenceLoop) {
            setIsSentenceLoop((prev) => !prev);
          }
        }}
        title="현재 자막이 끝나면 자동으로 처음부터 무한 반복합니다."
      >
        🔁 문장 반복
      </button>
      <button
        className={`toggle-all-btn ${isPageEndPause ? 'active' : ''}`}
        onClick={() => {
          setIsPageEndPause((prev) => !prev);
        }}
        title="한 페이지(10문장 단위)의 마지막 대사 재생 후 자동으로 일시정지합니다."
      >
        🛑 페이지 멈춤
      </button>
      <button
        className={`toggle-all-btn ${isAutoSkip ? 'active' : ''}`}
        onClick={() => {
          setIsAutoSkip((prev) => {
            const next = !prev;
            if (next && setIsSmartSkim) {
              setIsSmartSkim(false);
            }
            return next;
          });
        }}
        title="대사가 없는 긴 구간(5초 이상)을 자동으로 통째로 건너뜁니다."
      >
        ⏭️ 자동 건너뛰기
      </button>
      <button
        className={`toggle-all-btn ${isSmartSkim ? 'active' : ''}`}
        onClick={() => {
          if (setIsSmartSkim) {
            setIsSmartSkim((prev) => {
              const next = !prev;
              if (next) {
                setIsAutoSkip(false);
              }
              return next;
            });
          }
        }}
        title="대사가 없는 구간을 5초 단위로 스킵하되 2초간 미리보기 화면을 재생합니다."
      >
        🎬 스마트 탐색
      </button>
      <button
        className={`toggle-all-btn ${copied ? 'active' : ''}`}
        onClick={handleCopyPrompt}
        title="현재 페이지 자막이 담긴 AI 학습 프롬프트 복사"
      >
        {copied ? '✅ 복사 완료!' : '📋 사전 프롬프트'}
      </button>
      <button
        className={`toggle-all-btn ${speakingCopied ? 'active' : ''}`}
        onClick={handleCopySpeakingPrompt}
        title="현재 페이지 자막이 담긴 Gemini 라이브 영작 프롬프트 복사"
      >
        {speakingCopied ? '✅ 복사 완료!' : '🎙️ 영작 프롬프트'}
      </button>
      <div className="font-size-controller">
        <button
          className="page-btn nav-btn"
          onClick={() => setFontSize((prev) => Math.max(12, prev - 1))}
          disabled={fontSize === 12}
          title="글자 크기 줄이기"
        >
          A-
        </button>
        <span className="font-size-display">{fontSize}</span>
        <button
          className="page-btn nav-btn"
          onClick={() => setFontSize((prev) => Math.min(22, prev + 1))}
          disabled={fontSize === 22}
          title="글자 크기 늘리기"
        >
          A+
        </button>
      </div>
      <div className="settings-container" ref={settingsRef}>
        <button
          className={`toggle-all-btn settings-btn ${
            showSettings ? 'active' : ''
          }`}
          onClick={() => setShowSettings((prev) => !prev)}
          title="학습 환경 설정"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            style={{ pointerEvents: 'none' }}
          >
            <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
          </svg>
        </button>
        {showSettings && (
          <div className="settings-popover">
            <div className="settings-section">
              <div className="settings-label">페이지당 대사 수</div>
              <div className="segmented-control">
                {[20, 50, 100, 150].map((size) => (
                  <button
                    key={size}
                    className={`segment-btn ${
                      itemsPerPage === size ? 'active' : ''
                    }`}
                    onClick={() => handleItemsPerPageChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="settings-tip">
                * 변경 시 현재 영상의 체크리스트가 초기화됩니다.
              </div>
            </div>
            {canSaveProgress && (
              <div className="settings-section" style={{ marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '12px' }}>
                <div className="settings-label" style={{ color: '#f87171' }}>위험 구역</div>
                <button
                  className="reset-progress-btn"
                  onClick={onResetStudyProgress}
                  title="이 영상의 모든 회차 학습 기록을 초기화합니다."
                >
                  현재 영상 학습 초기화
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
