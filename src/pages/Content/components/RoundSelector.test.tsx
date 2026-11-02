import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoundSelector } from './RoundSelector';

describe('RoundSelector Component', () => {
  const defaultProps = {
    currentActiveRound: 1,
    currentSelectedRound: 1,
    onChangeSelectedRound: vi.fn(),
    getCompletedPagesCountForRound: vi.fn().mockReturnValue(0),
    totalTabs: 5,
    onStartNewRound: vi.fn(),
  };

  it('renders select dropdown correctly with option', () => {
    render(<RoundSelector {...defaultProps} />);

    expect(screen.getByTitle('학습 회차 선택')).toBeInTheDocument();
    expect(screen.getByText('1회차')).toBeInTheDocument();
    expect(screen.queryByText('🚀 2회차 시작')).toBeNull();
  });

  it('renders trophies on completed rounds options', () => {
    const props = {
      ...defaultProps,
      currentActiveRound: 2,
      getCompletedPagesCountForRound: vi.fn().mockImplementation((r) => (r === 1 ? 5 : 2)),
    };
    render(<RoundSelector {...props} />);

    expect(screen.getByText('1회차 🏆')).toBeInTheDocument();
    expect(screen.getByText('2회차')).toBeInTheDocument();
  });

  it('shows next round button when active round is fully complete', () => {
    const props = {
      ...defaultProps,
      getCompletedPagesCountForRound: vi.fn().mockReturnValue(5), // 5 out of 5 complete
    };
    render(<RoundSelector {...props} />);

    const button = screen.getByRole('button', { name: '🚀 2회차 시작' });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(props.onStartNewRound).toHaveBeenCalled();
  });
});
