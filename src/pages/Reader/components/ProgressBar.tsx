import React from 'react';
import { BookProgress, progressText } from '../logic/progress';

// 책 학습 진행률 막대와 문구. 막대는 꾸밈이고 내용은 문구가 전한다.
export const ProgressBar: React.FC<{ progress: BookProgress }> = ({ progress }) => (
  <span className="nfr-progress">
    <span className="nfr-progress-track" aria-hidden="true">
      <span
        className={`nfr-progress-fill ${progress.percent === 100 ? 'complete' : ''}`}
        style={{ width: `${progress.percent}%` }}
      />
    </span>
    <span className="nfr-progress-text">{progressText(progress)}</span>
  </span>
);
