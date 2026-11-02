import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StudyControlPanel } from './StudyControlPanel';

describe('StudyControlPanel Component', () => {
  const defaultProps = {
    isEnglishVisible: true,
    setIsEnglishVisible: vi.fn(),
    isAllVisible: false,
    setIsAllVisible: vi.fn(),
    isAutoPause: true,
    setIsAutoPause: vi.fn(),
    isSentenceLoop: true,
    setIsSentenceLoop: vi.fn(),
    isPageEndPause: false,
    setIsPageEndPause: vi.fn(),
    isAutoSkip: false,
    setIsAutoSkip: vi.fn(),
    copied: false,
    handleCopyPrompt: vi.fn(),
    speakingCopied: false,
    handleCopySpeakingPrompt: vi.fn(),
    fontSize: 14,
    setFontSize: vi.fn(),
    showSettings: false,
    setShowSettings: vi.fn(),
    itemsPerPage: 50,
    handleItemsPerPageChange: vi.fn(),
    settingsRef: React.createRef<HTMLDivElement>(),
    onResetStudyProgress: vi.fn(),
  };

  it('renders toggler buttons correctly including sentence loop', () => {
    render(<StudyControlPanel {...defaultProps} />);

    expect(screen.getByText('💬 영어 자막')).toBeInTheDocument();
    expect(screen.getByText('💬 한국어 자막')).toBeInTheDocument();
    expect(screen.getByText('⏱️ 자동 멈춤')).toBeInTheDocument();
    expect(screen.getByText('🔁 문장 반복')).toBeInTheDocument();
    expect(screen.getByText('🛑 페이지 멈춤')).toBeInTheDocument();
    expect(screen.getByText('📋 사전 프롬프트')).toBeInTheDocument();
    expect(screen.getByText('🎙️ 영작 프롬프트')).toBeInTheDocument();

    const loopBtn = screen.getByText('🔁 문장 반복');
    expect(loopBtn).toHaveClass('active');
  });

  it('shows checkmark when prompt is copied', () => {
    render(<StudyControlPanel {...defaultProps} copied={true} speakingCopied={true} />);

    expect(screen.getAllByText('✅ 복사 완료!').length).toBe(2);
  });

  it('calls setIsSentenceLoop when clicking sentence loop button', () => {
    const setIsSentenceLoop = vi.fn();
    render(<StudyControlPanel {...defaultProps} setIsSentenceLoop={setIsSentenceLoop} />);

    fireEvent.click(screen.getByText('🔁 문장 반복'));
    expect(setIsSentenceLoop).toHaveBeenCalled();
  });

  it('calls handleCopyPrompt when clicking prompt button', () => {
    render(<StudyControlPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('📋 사전 프롬프트'));
    expect(defaultProps.handleCopyPrompt).toHaveBeenCalled();
  });

  it('renders smart skim button correctly and triggers callback', () => {
    const setIsSmartSkim = vi.fn();
    render(<StudyControlPanel {...defaultProps} isSmartSkim={true} setIsSmartSkim={setIsSmartSkim} />);

    const smartSkimBtn = screen.getByText('🎬 스마트 탐색');
    expect(smartSkimBtn).toBeInTheDocument();
    expect(smartSkimBtn).toHaveClass('active');

    fireEvent.click(smartSkimBtn);
    expect(setIsSmartSkim).toHaveBeenCalled();
  });

  it('turns off autoSkip when enabling smartSkim (mutually exclusive)', () => {
    const setIsSmartSkim = vi.fn((cb) => {
      if (typeof cb === 'function') cb(false);
    });
    const setIsAutoSkip = vi.fn();

    render(
      <StudyControlPanel
        {...defaultProps}
        isAutoSkip={false}
        setIsAutoSkip={setIsAutoSkip}
        isSmartSkim={false}
        setIsSmartSkim={setIsSmartSkim}
      />
    );

    fireEvent.click(screen.getByText('🎬 스마트 탐색'));
    expect(setIsSmartSkim).toHaveBeenCalled();
    expect(setIsAutoSkip).toHaveBeenCalledWith(false);
  });

  it('calls setFontSize with decreased value when clicking A- button', () => {
    render(<StudyControlPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('A-'));
    expect(defaultProps.setFontSize).toHaveBeenCalled();
  });
});
