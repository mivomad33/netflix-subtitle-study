import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 헬퍼/유틸 Mocking
vi.mock('./utils/networkInterceptor', () => ({
  initNetworkInterceptor: vi.fn(),
  exportDataMap: new Map(),
}));

vi.mock('./utils/layoutManager', () => ({
  setupUI: vi.fn(),
  cleanupUI: vi.fn(),
  getIsPanelVisible: vi.fn(() => true),
  getIsOverlayVisible: vi.fn(() => false),
  togglePanelVisibility: vi.fn(),
  toggleOverlayVisibility: vi.fn(),
  resetRenderedVideoId: vi.fn(),
}));

vi.mock('./utils/domInjector', () => ({
  injectDashboardTab: vi.fn((parent, callback) => {
    // 탭 클릭 시의 동작 검증을 위해 바로 콜백 실행 기능 부여 가능
  }),
  injectBottomToggleButton: vi.fn(),
}));

describe('Content index.tsx Entry Point Flow', () => {
  beforeEach(async () => {
    vi.stubGlobal('location', {
      href: 'https://www.netflix.com/watch/12345',
    });
    
    // 모킹 활성화 상태에서 파일 동적 임포트
    await import('./index');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes network interceptor on startup', async () => {
    const { initNetworkInterceptor } = await import('./utils/networkInterceptor');
    expect(initNetworkInterceptor).toHaveBeenCalled();
  });
});
