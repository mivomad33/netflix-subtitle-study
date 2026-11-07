import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('Space play/pause', () => {
    const makePlayer = (playing: boolean) => ({
      getCurrentTime: vi.fn(() => 0),
      seek: vi.fn(),
      isPlaying: vi.fn(() => playing),
      play: vi.fn(),
      pause: vi.fn(),
    });

    const setup = (player: any) =>
      renderHook(() =>
        useStudyHotkeys({
          player,
          sentences: mockSentences,
          activeIndex: 0,
          isAutoPause: false,
          setIsAutoPause: mockSetIsAutoPause,
          handlePlaySentence: mockHandlePlaySentence,
        })
      );

    let panel: HTMLDivElement;
    let netflixApp: HTMLDivElement;

    beforeEach(() => {
      panel = document.createElement('div');
      panel.id = 'studyPanel';
      panel.innerHTML = '<button>page</button><textarea></textarea>';
      netflixApp = document.createElement('div');
      netflixApp.id = 'appMountPoint';
      netflixApp.innerHTML = '<button>player</button>';
      document.body.append(netflixApp, panel);
    });

    afterEach(() => {
      panel.remove();
      netflixApp.remove();
    });

    const pressSpace = (target: EventTarget, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    };

    it('pauses when playing and plays when paused from a focused panel button', () => {
      const playing = makePlayer(true);
      const { unmount } = setup(playing);
      const pageButton = panel.querySelector('button')!;
      const outerListener = vi.fn();
      document.addEventListener('keydown', outerListener);

      const event = pressSpace(pageButton);
      expect(playing.pause).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
      expect(outerListener).not.toHaveBeenCalled();
      document.removeEventListener('keydown', outerListener);
      unmount();

      const paused = makePlayer(false);
      setup(paused);
      pressSpace(document.body);
      expect(paused.play).toHaveBeenCalledTimes(1);
    });

    it('also blocks the keyup so the focused button is not clicked', () => {
      setup(makePlayer(true));
      const event = new KeyboardEvent('keyup', {
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      panel.querySelector('button')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves Space alone in text fields, in the Netflix player, and on key repeat', () => {
      const player = makePlayer(true);
      setup(player);

      expect(pressSpace(panel.querySelector('textarea')!).defaultPrevented).toBe(false);
      expect(pressSpace(netflixApp.querySelector('button')!).defaultPrevented).toBe(false);
      pressSpace(panel, { repeat: true });
      expect(player.pause).not.toHaveBeenCalled();
    });
  });
});
