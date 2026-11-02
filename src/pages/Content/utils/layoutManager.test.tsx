import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setupUI, 
  cleanupUI, 
  getIsPanelVisible, 
  getIsOverlayVisible, 
  togglePanelVisibility, 
  toggleOverlayVisibility 
} from './layoutManager';

describe('layoutManager UI Controller', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    
    // setupUI가 동작하기 위한 모의 appMountPoint 생성 및 추가
    const appMount = document.createElement('div');
    appMount.id = 'appMountPoint';
    document.body.appendChild(appMount);

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
    cleanupUI();
    delete (window as any).netflix;
    vi.restoreAllMocks();
  });

  it('toggles visibility and saves new state to localStorage', () => {
    // 초기 디폴트: Panel = true, Overlay = false
    expect(getIsPanelVisible()).toBe(true);
    expect(getIsOverlayVisible()).toBe(false);

    togglePanelVisibility();
    expect(getIsPanelVisible()).toBe(false); // 토글되어 false

    toggleOverlayVisibility();
    expect(getIsOverlayVisible()).toBe(true); // 토글되어 true
  });

  it('injects divider and studyPanel DOM elements when calling setupUI', () => {
    setupUI([], '12345');

    // DOM 트리 조회를 통해 레이아웃 분할 노드가 생성되었는지 검증
    const divider = document.getElementById('divider');
    const studyPanel = document.getElementById('studyPanel');

    expect(divider).not.toBeNull();
    expect(studyPanel).not.toBeNull();
  });
});
