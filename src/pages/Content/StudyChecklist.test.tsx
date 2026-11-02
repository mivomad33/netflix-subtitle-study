import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StudyChecklist from './StudyChecklist';

describe('StudyChecklist Component', () => {
  const defaultChecklist = {
    preStudy: false,
    noSubtitles: false,
    scriptAnalysis: false,
    shadowing: false,
    speaking: false,
  };

  it('renders check labels and checklist texts correctly', () => {
    const onToggle = vi.fn();
    render(
      <StudyChecklist
        currentTab={0}
        currentChecklist={defaultChecklist}
        onToggleChecklist={onToggle}
      />
    );

    expect(screen.getByText('사전 학습')).toBeInTheDocument();
    expect(screen.getByText('무자막 시청')).toBeInTheDocument();
    expect(screen.getByText('스크립트 해석')).toBeInTheDocument();
    expect(screen.getByText('쉐도잉')).toBeInTheDocument();
    expect(screen.getByText('영작 연습')).toBeInTheDocument();
    expect(screen.queryByText('🎉 학습 완료!')).toBeNull();
  });

  it('triggers onToggleChecklist callback with correct parameter when clicking a label', () => {
    const onToggle = vi.fn();
    render(
      <StudyChecklist
        currentTab={0}
        currentChecklist={defaultChecklist}
        onToggleChecklist={onToggle}
      />
    );

    const checkbox = screen.getByLabelText('사전 학습');
    fireEvent.click(checkbox);

    expect(onToggle).toHaveBeenCalledWith('preStudy');
  });
});
