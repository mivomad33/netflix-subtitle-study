import React from 'react';
import { PageChecklist } from '../../types';
import './StudyChecklist.css';

interface StudyChecklistProps {
  currentTab: number;
  currentChecklist: PageChecklist;
  onToggleChecklist: (key: keyof PageChecklist) => void;
}

const StudyChecklist: React.FC<StudyChecklistProps> = ({
  currentTab,
  currentChecklist,
  onToggleChecklist,
}) => {
  return (
    <div className="checklist-container">
      <div className="checklist-items">
        <label
          className={`checklist-item ${
            currentChecklist.preStudy ? 'checked' : ''
          }`}
        >
          <input
            type="checkbox"
            checked={currentChecklist.preStudy}
            onChange={() => onToggleChecklist('preStudy')}
          />
          <span className="checkbox-custom"></span>
          <span className="item-text">사전 학습</span>
        </label>
        <label
          className={`checklist-item ${
            currentChecklist.noSubtitles ? 'checked' : ''
          }`}
        >
          <input
            type="checkbox"
            checked={currentChecklist.noSubtitles}
            onChange={() => onToggleChecklist('noSubtitles')}
          />
          <span className="checkbox-custom"></span>
          <span className="item-text">무자막 시청</span>
        </label>
        <label
          className={`checklist-item ${
            currentChecklist.scriptAnalysis ? 'checked' : ''
          }`}
        >
          <input
            type="checkbox"
            checked={currentChecklist.scriptAnalysis}
            onChange={() => onToggleChecklist('scriptAnalysis')}
          />
          <span className="checkbox-custom"></span>
          <span className="item-text">스크립트 해석</span>
        </label>
        <label
          className={`checklist-item ${
            currentChecklist.shadowing ? 'checked' : ''
          }`}
        >
          <input
            type="checkbox"
            checked={currentChecklist.shadowing}
            onChange={() => onToggleChecklist('shadowing')}
          />
          <span className="checkbox-custom"></span>
          <span className="item-text">쉐도잉</span>
        </label>
        <label
          className={`checklist-item ${
            currentChecklist.speaking ? 'checked' : ''
          }`}
        >
          <input
            type="checkbox"
            checked={currentChecklist.speaking}
            onChange={() => onToggleChecklist('speaking')}
          />
          <span className="checkbox-custom"></span>
          <span className="item-text">영작 연습</span>
        </label>
      </div>
    </div>
  );
};

export default StudyChecklist;
