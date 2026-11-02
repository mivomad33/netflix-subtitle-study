import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  initNetworkInterceptor,
  exportDataMap,
} from './utils/networkInterceptor';
import {
  setupUI,
  cleanupUI,
  getIsPanelVisible,
  getIsOverlayVisible,
  togglePanelVisibility,
  toggleOverlayVisibility,
  resetRenderedVideoId,
} from './utils/layoutManager';
import {
  injectDashboardTab,
  injectBottomToggleButton,
} from './utils/domInjector';
import StudyDashboardModal from './StudyDashboardModal';

console.log('[NF-STUDY] Content Script (index.tsx) injected & initialized.');

// 네트워크 인터셉터 실행
initNetworkInterceptor(
  getVideoId,
  getIsNetflixWatchPage,
  (exportData, movieId) => {
    // 자막 로드 완료 시 setupUI 실행
    setupUI(exportData, movieId);
  }
);

function getVideoId(): string | number | null {
  if (!window.netflix) {
    return null;
  }
  
  try {
    const playerSessionId = window.netflix?.appContext?.state?.playerApp
      ?.getAPI()
      ?.videoPlayer?.getAllPlayerSessionIds()
      ?.find((id: string) => id.startsWith('watch'));
      
    if (!playerSessionId) {
      return null;
    }
    
    const movieId = window.netflix?.appContext?.state?.playerApp
      ?.getAPI()
      ?.videoPlayer?.getVideoPlayerBySessionId(playerSessionId)
      ?.getMovieId();
      
    return movieId;
  } catch (error) {
    console.error('[NF-STUDY] Error in getVideoId():', error);
    return null;
  }
}

function getIsNetflixWatchPage(): boolean {
  return window.location.href.startsWith('https://www.netflix.com/watch/');
}

let isPreviousNetflixWatchPage = getIsNetflixWatchPage();
let isPreviousVideoId = getVideoId();

// URL 변경 감지 및 UI 관리
const observer = new MutationObserver(() => {
  const isNetflixWatchPage = getIsNetflixWatchPage();
  const videoId = getVideoId();

  // 1. 글로벌 네비게이션 대시보드 탭 삽입 체크
  const navList = document.querySelector('.tabbed-primary-navigation, [data-nav-items="true"], [data-uia="navigation+group+items"]');
  if (navList && !document.getElementById('netflix-subtitle-study-dashboard-tab')) {
    console.log('[NF-STUDY] MutationObserver found navList. Injecting tab.');
    injectDashboardTab(navList, () => {
      // openDashboard ( StudyDashboardModal을 바디에 렌더링하는 기존 흐름 )
      console.log('[NF-STUDY] openDashboard called.');
      let container = document.getElementById('study-dashboard-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'study-dashboard-container';
        document.body.appendChild(container);
        console.log('[NF-STUDY] Created #study-dashboard-container.');
      }
      
      const dashboardRoot = createRoot(container!);
      const closeDashboard = () => {
        dashboardRoot.unmount();
        container?.remove();
      };
      dashboardRoot.render(<StudyDashboardModal onClose={closeDashboard} />);
    });
  }

  // 2. 비디오 시청 화면 하단 토글 버튼 삽입 체크
  if (isNetflixWatchPage) {
    const volumeBtn = document.querySelector('[data-uia^="control-volume-"]');
    if (volumeBtn) {
      const buttonWrapper = volumeBtn.closest('div');
      const controlsGroup = buttonWrapper?.parentElement;
      if (
        controlsGroup &&
        !document.getElementById('netflix-subtitle-study-toggle-button-container')
      ) {
        console.log('[NF-STUDY] MutationObserver found volume control in watch page. Injecting toggle button.');
        injectBottomToggleButton(
          controlsGroup,
          buttonWrapper,
          getIsPanelVisible(),
          getIsOverlayVisible(),
          togglePanelVisibility,
          toggleOverlayVisibility
        );
      }
    }
  }

  // 3. 비디오 시청 페이지 감지 및 UI 설정
  if (
    isNetflixWatchPage === isPreviousNetflixWatchPage &&
    videoId === isPreviousVideoId
  ) {
    return;
  }

  console.log('[NF-STUDY] MutationObserver page state changed:', {
    isNetflixWatchPage,
    videoId,
    isPreviousNetflixWatchPage,
    isPreviousVideoId
  });

  isPreviousNetflixWatchPage = isNetflixWatchPage;
  isPreviousVideoId = videoId;

  if (isNetflixWatchPage && videoId !== null) {
    const exportData = exportDataMap.get(videoId.toString());
    console.log('[NF-STUDY] Watch page active. Has exportData in cache?', !!exportData);
    if (exportData) {
      setupUI(exportData, videoId);
    } else {
      console.log('[NF-STUDY] No exportData in cache for videoId:', videoId, '. Waiting for JSON intercept.');
      resetRenderedVideoId();
    }
  } else {
    console.log('[NF-STUDY] Watch page inactive. Cleaning up UI.');
    cleanupUI();
  }
});

observer.observe(document, { subtree: true, childList: true });
