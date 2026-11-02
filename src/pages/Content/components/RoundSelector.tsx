import React from 'react';

interface RoundSelectorProps {
  currentActiveRound: number;
  currentSelectedRound: number;
  onChangeSelectedRound: (round: number) => void;
  getCompletedPagesCountForRound: (round: number) => number;
  totalTabs: number;
  onStartNewRound: () => void;
}

export const RoundSelector: React.FC<RoundSelectorProps> = ({
  currentActiveRound,
  currentSelectedRound,
  onChangeSelectedRound,
  getCompletedPagesCountForRound,
  totalTabs,
  onStartNewRound,
}) => {
  return (
    <div className="round-selector-inline">
      <select
        className="round-select"
        value={currentSelectedRound}
        onChange={(e) => onChangeSelectedRound(Number(e.target.value))}
        title="학습 회차 선택"
      >
        {Array.from({ length: currentActiveRound }, (_, i) => i + 1).map((r) => {
          const isRoundComplete = getCompletedPagesCountForRound(r) === totalTabs;
          return (
            <option key={r} value={r}>
              {r}회차 {isRoundComplete ? '🏆' : ''}
            </option>
          );
        })}
      </select>
      {getCompletedPagesCountForRound(currentActiveRound) === totalTabs && totalTabs > 0 && (
        <button
          className="new-round-btn-compact"
          onClick={onStartNewRound}
          title="다음 회차 시작하기"
        >
          🚀 {currentActiveRound + 1}회차 시작
        </button>
      )}
    </div>
  );
};
