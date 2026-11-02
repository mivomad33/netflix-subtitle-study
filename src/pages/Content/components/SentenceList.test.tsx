import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SentenceList } from './SentenceList';

describe('SentenceList Component', () => {
  const mockSentences = [
    {
      startTime_ms: 1500,
      endTime_ms: 3000,
      text: 'Good morning.',
      hTranslation: '좋은 아침입니다.',
    },
    {
      startTime_ms: 120000,
      endTime_ms: 125000,
      text: 'How are you?',
      hTranslation: '어떻게 지내세요?',
    },
  ];

  const defaultProps = {
    sentences: mockSentences,
    currentTab: 0,
    itemsPerPage: 50,
    activeIndex: null,
    isEnglishVisible: true,
    isAllVisible: false,
    visibleTranslations: new Set<number>(),
    visibleEnglishSentences: new Set<number>(),
    toggleEnglishSentence: vi.fn(),
    toggleTranslation: vi.fn(),
    handlePlaySentence: vi.fn(),
    sentenceRefs: { current: [] } as any,
  };

  it('renders sentences on current page with formatted timestamp', () => {
    render(<SentenceList {...defaultProps} />);

    expect(screen.getByText('Good morning.')).toBeInTheDocument();
    expect(screen.getByText('좋은 아침입니다.')).toBeInTheDocument();
    expect(screen.getByText('00:01')).toBeInTheDocument(); // 1500ms

    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.getByText('어떻게 지내세요?')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument(); // 120000ms
  });

  it('adds active class to activeIndex sentence', () => {
    const { container } = render(<SentenceList {...defaultProps} activeIndex={0} />);
    
    const sentenceElements = container.querySelectorAll('.sentence');
    expect(sentenceElements[0]).toHaveClass('active');
    expect(sentenceElements[1]).not.toHaveClass('active');
  });

  it('calls handlePlaySentence with correct time when clicking timestamp', () => {
    render(<SentenceList {...defaultProps} />);

    fireEvent.click(screen.getByText('00:01'));
    expect(defaultProps.handlePlaySentence).toHaveBeenCalledWith(1500);
  });

  it('calls toggleTranslation when clicking translation text', () => {
    render(<SentenceList {...defaultProps} />);

    fireEvent.click(screen.getByText('좋은 아침입니다.'));
    expect(defaultProps.toggleTranslation).toHaveBeenCalledWith(0);
  });
});
