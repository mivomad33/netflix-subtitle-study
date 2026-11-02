import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StudyPanel from './StudyPanel';

describe('StudyPanel Main Component', () => {
  const mockSentences = [
    { startTime_ms: 1000, endTime_ms: 2000, text: 'Sentence One', hTranslation: '번역 하나' },
    { startTime_ms: 3000, endTime_ms: 4000, text: 'Sentence Two', hTranslation: '번역 둘' },
  ];

  const mockTogglePanel = vi.fn();
  const mockToggleOverlay = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    // 넷플릭스 API 전역 가드 목킹
    (window as any).netflix = {
      appContext: {
        state: {
          playerApp: {
            getAPI: () => ({
              videoPlayer: {
                getAllPlayerSessionIds: () => ['watch-session-1'],
                getVideoPlayerBySessionId: () => ({
                  isPlaying: () => false,
                  getCurrentTime: () => 0,
                  seek: vi.fn(),
                  pause: vi.fn(),
                  play: vi.fn(),
                }),
              },
              getVideoMetadataByVideoId: () => ({
                _metadataObject: {
                  video: {
                    title: 'Test Show',
                    artwork: [],
                    seasons: [],
                  },
                },
              }),
            }),
          },
        },
      },
    };
  });

  afterEach(() => {
    delete (window as any).netflix;
    vi.restoreAllMocks();
  });

  it('renders correctly and mounts pagination, control panel, and sentences list', () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    // 문장 리스트가 잘 출력되는지 확인
    expect(screen.getByText('Sentence One')).toBeInTheDocument();
    expect(screen.getByText('Sentence Two')).toBeInTheDocument();

    // 페이지네이션 활성화 체크 (대사 수 50개 기본이므로 1페이지 노출)
    expect(screen.getByText('1')).toBeInTheDocument();

    // 조작 패널 버튼 마운트 확인
    expect(screen.getByText('💬 영어 자막')).toBeInTheDocument();
  });

  it('toggles settings popover when clicking the settings gear icon', () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    // 설정 팝오버는 처음에 보이지 않음
    expect(screen.queryByText('페이지당 대사 수')).toBeNull();

    // 톱니바퀴 설정 아이콘 클릭
    const settingsBtn = screen.getByTitle('학습 환경 설정');
    fireEvent.click(settingsBtn);

    // 설정 팝오버 렌더링 확인
    expect(screen.getByText('페이지당 대사 수')).toBeInTheDocument();
  });

  it('renders round selector dropdown with current rounds', () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    expect(screen.getByText('1회차')).toBeInTheDocument();
  });

  it('shows next round button only when all pages checklist are complete', () => {
    const fullChecklist = {
      currentActiveRound: 1,
      rounds: {
        1: {
          0: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true }
        }
      }
    };
    localStorage.setItem('NF_checklist_12345', JSON.stringify(fullChecklist));

    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    expect(screen.getByText('1회차 🏆')).toBeInTheDocument();
    const newRoundBtn = screen.getByText('🚀 2회차 시작');
    expect(newRoundBtn).toBeInTheDocument();

    fireEvent.click(newRoundBtn);
    expect(screen.getByText('2회차')).toBeInTheDocument();
  });

  it('triggers reset study progress when clicking reset button and confirming', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    const settingsBtn = screen.getByTitle('학습 환경 설정');
    fireEvent.click(settingsBtn);

    const resetBtn = screen.getByText('현재 영상 학습 초기화');
    fireEvent.click(resetBtn);

    expect(confirmSpy).toHaveBeenCalled();
  });
});
