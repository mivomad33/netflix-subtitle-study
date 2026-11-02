import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStudyHotkeys } from './useStudyHotkeys';

describe('useStudyHotkeys Hook', () => {
  const mockPlayer = {
    getCurrentTime: vi.fn(() => 2000),
    seek: vi.fn(),
    isPlaying: vi.fn(() => false),
    play: vi.fn(),
  };

  const mockSentences = [
    { startTime_ms: 1000, endTime_ms: 2500, text: 'Hello', hTranslation: '안녕' },
    { startTime_ms: 4000, endTime_ms: 5500, text: 'World', hTranslation: '세상' },
  ];

  const mockSetIsAutoPause = vi.fn();
  const mockHandlePlaySentence = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('registers keydown event listener on mount and removes on unmount', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    const removeEventSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useStudyHotkeys({
        player: mockPlayer,
        sentences: mockSentences,
        activeIndex: 0,
        isAutoPause: true,
        setIsAutoPause: mockSetIsAutoPause,
        handlePlaySentence: mockHandlePlaySentence,
      })
    );

    expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    
    unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('triggers setIsAutoPause when KeyQ is pressed', () => {
    renderHook(() =>
      useStudyHotkeys({
        player: mockPlayer,
        sentences: mockSentences,
        activeIndex: 0,
        isAutoPause: true,
        setIsAutoPause: mockSetIsAutoPause,
        handlePlaySentence: mockHandlePlaySentence,
      })
    );

    // 가상 키보드 이벤트 방출
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    expect(mockSetIsAutoPause).toHaveBeenCalled();
  });

  it('triggers setIsSentenceLoop when KeyR is pressed', () => {
    const mockSetIsSentenceLoop = vi.fn();
    renderHook(() =>
      useStudyHotkeys({
        player: mockPlayer,
        sentences: mockSentences,
        activeIndex: 0,
        isAutoPause: true,
        setIsAutoPause: mockSetIsAutoPause,
        isSentenceLoop: false,
        setIsSentenceLoop: mockSetIsSentenceLoop,
        handlePlaySentence: mockHandlePlaySentence,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    expect(mockSetIsSentenceLoop).toHaveBeenCalled();
  });

  it('triggers handlePlaySentence when KeyS (replay current sentence) is pressed', () => {
    renderHook(() =>
      useStudyHotkeys({
        player: mockPlayer,
        sentences: mockSentences,
        activeIndex: 1, // 'World'
        isAutoPause: true,
        setIsAutoPause: mockSetIsAutoPause,
        handlePlaySentence: mockHandlePlaySentence,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    expect(mockHandlePlaySentence).toHaveBeenCalledWith(4000);
  });

  it('triggers onTogglePanel when KeyT is pressed', () => {
    const mockOnTogglePanel = vi.fn();
    renderHook(() =>
      useStudyHotkeys({
        player: mockPlayer,
        sentences: mockSentences,
        activeIndex: 0,
        isAutoPause: true,
        setIsAutoPause: mockSetIsAutoPause,
        handlePlaySentence: mockHandlePlaySentence,
        onTogglePanel: mockOnTogglePanel,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' }));
    expect(mockOnTogglePanel).toHaveBeenCalled();
  });
});
