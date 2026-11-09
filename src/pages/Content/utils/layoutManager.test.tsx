import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setupUI, 
  cleanupUI, 
  getIsPanelVisible, 
  getIsOverlayVisible, 
  togglePanelVisibility, 
  toggleOverlayVisibility,
  resetRenderedVideoId,
} from './layoutManager';
import { installFakeStore } from '../testing/fakeStore';
import { setStoreClient } from './storeClient';
import { createMemoryArea } from '../../../shared/storage/storageArea';
import { createDirectClient } from '../../../shared/bridge/directClient';
import { BridgeCall } from '../../../shared/bridge/protocol';

describe('layoutManager UI Controller', () => {
  let store: ReturnType<typeof installFakeStore>;

  beforeEach(() => {
    localStorage.clear();
    store = installFakeStore();
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
    resetRenderedVideoId();
    setStoreClient(null);
    delete (window as any).netflix;
    vi.restoreAllMocks();
  });

  it('toggles visibility and saves new state to the store', async () => {
    // 초기 디폴트: Panel = true, Overlay = false
    expect(getIsPanelVisible()).toBe(true);
    expect(getIsOverlayVisible()).toBe(false);

    togglePanelVisibility();
    expect(getIsPanelVisible()).toBe(false); // 토글되어 false

    toggleOverlayVisibility();
    expect(getIsOverlayVisible()).toBe(true); // 토글되어 true

    await vi.waitFor(async () =>
      expect((await store.area!.get(['nf:settings']))['nf:settings']).toMatchObject({
        isPanelVisible: false,
        isOverlayVisible: true,
      })
    );
  });

  it('starts with the default layout and applies the stored width and visibility once they arrive', async () => {
    let release: (() => void) | undefined;
    const area = createMemoryArea({ 'nf:settings': { studyPanelWidthRatio: 0.3, isOverlayVisible: true } });
    const direct = createDirectClient(area);
    // 저장된 설정을 늦게 돌려주는 저장소
    setStoreClient({
      async call<T>(c: BridgeCall): Promise<T> {
        if (c.op === 'nfSettings.get') await new Promise<void>((r) => (release = r));
        return direct.call<T>(c);
      },
    });

    setupUI([], '12345');
    const appMountPoint = document.getElementById('appMountPoint')!;
    expect(appMountPoint.style.width).toBe('40%');
    expect(getIsOverlayVisible()).toBe(false);

    await vi.waitFor(() => expect(release).toBeDefined());
    release!();
    await vi.waitFor(() => expect(appMountPoint.style.width).toBe('30%'));
    expect(document.getElementById('studyPanel')!.style.width).toBe('70%');
    expect(getIsOverlayVisible()).toBe(true);
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
