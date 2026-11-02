// Layout Manager for netflix-subtitle-study
// Manages split layouts, resizable divider, and React component mount/unmount.

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import StudyPanel from '../StudyPanel';
import { exportDataMap } from './networkInterceptor';
import { STORAGE_KEYS } from '../constants/storageKeys';

let root: Root | null = null;
let divider: HTMLDivElement | null = null;
let renderedVideoId: string | number | null = null;

let isPanelVisible = localStorage.getItem(STORAGE_KEYS.IS_PANEL_VISIBLE) !== 'false';
let isOverlayVisible = localStorage.getItem(STORAGE_KEYS.IS_OVERLAY_VISIBLE) === 'true';

export const getIsPanelVisible = () => isPanelVisible;
export const getIsOverlayVisible = () => isOverlayVisible;

export const togglePanelVisibility = () => {
  isPanelVisible = !isPanelVisible;
  localStorage.setItem(STORAGE_KEYS.IS_PANEL_VISIBLE, isPanelVisible.toString());
  applyExtensionStates();
};

export const toggleOverlayVisibility = () => {
  isOverlayVisible = !isOverlayVisible;
  localStorage.setItem(STORAGE_KEYS.IS_OVERLAY_VISIBLE, isOverlayVisible.toString());
  applyExtensionStates();
};

export const applyExtensionStates = () => {
  console.log('[NF-STUDY] applyExtensionStates. isPanelVisible:', isPanelVisible, 'isOverlayVisible:', isOverlayVisible);
  const appMountPoint = document.getElementById('appMountPoint');
  const studyPanel = document.getElementById('studyPanel');
  const divElement = document.getElementById('divider');

  const panelBtn = document.getElementById('netflix-subtitle-study-panel-button');
  const overlayBtn = document.getElementById('netflix-subtitle-study-overlay-button');

  if (panelBtn) {
    panelBtn.style.color = isPanelVisible ? '#10b981' : '#888';
    panelBtn.setAttribute('aria-label', isPanelVisible ? '스터디패널 숨기기' : '스터디패널 보이기');
  }
  if (overlayBtn) {
    overlayBtn.style.color = isOverlayVisible ? '#10b981' : '#888';
    overlayBtn.setAttribute('aria-label', isOverlayVisible ? '오버레이 자막 끄기' : '오버레이 자막 켜기');
  }

  // 1. 둘 다 OFF 상태인 경우 ➡️ 완전히 순정 넷플릭스로 복원 (unmount)
  if (!isPanelVisible && !isOverlayVisible) {
    if (root) {
      root.unmount();
      root = null;
      console.log('[NF-STUDY] Both OFF. Unmounted StudyPanel.');
    }
    if (studyPanel) studyPanel.style.display = 'none';
    if (divElement) divElement.style.display = 'none';
    if (appMountPoint) appMountPoint.style.width = '100%';
    return;
  }

  // 2. 하나라도 ON 상태인 경우 ➡️ 마운트 보장 및 레이아웃 제어
  if (studyPanel && divElement && appMountPoint) {
    if (isPanelVisible) {
      studyPanel.style.display = 'block';
      divElement.style.display = 'block';
      const savedRatio = localStorage.getItem(STORAGE_KEYS.STUDY_PANEL_WIDTH_RATIO);
      const defaultWidth = savedRatio ? `${parseFloat(savedRatio) * 100}%` : '40%';
      const panelWidth = savedRatio ? `${(1 - parseFloat(savedRatio)) * 100}%` : '60%';

      appMountPoint.style.width = defaultWidth;
      studyPanel.style.width = panelWidth;
      divElement.style.left = defaultWidth;
    } else {
      studyPanel.style.display = 'none';
      divElement.style.display = 'none';
      appMountPoint.style.width = '100%';
    }
  }

  // 마운트가 해제된 상태라면 새로 마운트
  if (!root && studyPanel) {
    const videoId = getVideoIdFromWindow();
    const exportData = exportDataMap.get(videoId?.toString());
    console.log('[NF-STUDY] Attempting to mount StudyPanel. videoId:', videoId, 'hasExportData:', !!exportData);
    if (exportData && videoId) {
      root = createRoot(studyPanel);
      root.render(
        <StudyPanel 
          sentences={exportData} 
          videoId={videoId} 
          isPanelVisible={isPanelVisible}
          isOverlayVisible={isOverlayVisible}
          onTogglePanel={togglePanelVisibility}
          onToggleOverlay={toggleOverlayVisibility}
        />
      );
      console.log('[NF-STUDY] StudyPanel mounted.');
    } else {
      console.warn('[NF-STUDY] StudyPanel cannot mount due to missing videoId or exportData.');
    }
  } else if (root) {
    const videoId = getVideoIdFromWindow();
    const exportData = exportDataMap.get(videoId?.toString());
    if (exportData && videoId) {
      root.render(
        <StudyPanel 
          sentences={exportData} 
          videoId={videoId} 
          isPanelVisible={isPanelVisible}
          isOverlayVisible={isOverlayVisible}
          onTogglePanel={togglePanelVisibility}
          onToggleOverlay={toggleOverlayVisibility}
        />
      );
    }
  }
};

export const setupUI = (exportData: any, videoId: string | number) => {
  console.log('[NF-STUDY] setupUI called. videoId:', videoId, 'renderedVideoId:', renderedVideoId);
  if (renderedVideoId === videoId) {
    console.log('[NF-STUDY] Already rendered this videoId. Skipping setupUI.');
    return;
  }

  renderedVideoId = videoId;
  cleanupUI();

  const appMountPoint = document.getElementById('appMountPoint');
  if (!appMountPoint) {
    console.error('[NF-STUDY] Cannot find appMountPoint. This is critical!');
    throw new Error('Cannot find appMountPoint');
  }

  console.log('[NF-STUDY] Found appMountPoint. Modifying body style & injecting layouts.');
  document.body.style.display = 'flex';

  const savedRatio = localStorage.getItem(STORAGE_KEYS.STUDY_PANEL_WIDTH_RATIO);
  const defaultWidth = savedRatio ? `${parseFloat(savedRatio) * 100}%` : '40%';
  const panelWidth = savedRatio
    ? `${(1 - parseFloat(savedRatio)) * 100}%`
    : '60%';

  appMountPoint.style.width = defaultWidth;
  appMountPoint.style.position = 'relative';

  divider = document.createElement('div');
  divider.id = 'divider';
  divider.style.cssText = `
    position: fixed;
    top: 0;
    left: ${defaultWidth};
    width: 4px;
    height: 100vh;
    background-color: #333;
    cursor: ew-resize;
    z-index: 1000;
  `;
  document.body.appendChild(divider);

  const studyPanel = document.createElement('div');
  studyPanel.id = 'studyPanel';
  studyPanel.style.width = panelWidth;
  studyPanel.style.height = '100%';
  document.body.appendChild(studyPanel);

  // 드래그 기능 구현
  let isDragging = false;
  let startX: number;
  let startWidth: number;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = appMountPoint.offsetWidth;
    document.body.style.cursor = 'ew-resize';
    console.log('[NF-STUDY] Divider drag started.');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const width = startWidth + (e.clientX - startX);
    const windowWidth = window.innerWidth;

    const minWidth = windowWidth * 0.2;
    const maxWidth = windowWidth * 0.8;

    if (width >= minWidth && width <= maxWidth) {
      appMountPoint.style.width = `${width}px`;
      studyPanel.style.width = `${windowWidth - width}px`;
      if (divider) divider.style.left = `${width}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      const ratio = appMountPoint.offsetWidth / window.innerWidth;
      localStorage.setItem(STORAGE_KEYS.STUDY_PANEL_WIDTH_RATIO, ratio.toString());
      console.log('[NF-STUDY] Divider drag ended. New Ratio:', ratio);
    }
    isDragging = false;
    document.body.style.cursor = 'default';
  });

  if (isPanelVisible || isOverlayVisible) {
    console.log('[NF-STUDY] Mounting StudyPanel root (either panel or overlay is enabled).');
    root = createRoot(studyPanel);
    root.render(
      <StudyPanel 
        sentences={exportData} 
        videoId={videoId} 
        isPanelVisible={isPanelVisible}
        isOverlayVisible={isOverlayVisible}
        onTogglePanel={togglePanelVisibility}
        onToggleOverlay={toggleOverlayVisibility}
      />
    );
  } else {
    console.log('[NF-STUDY] Both panel and overlay are disabled. Skipping React mount in setupUI.');
  }

  applyExtensionStates();
};

export const cleanupUI = () => {
  console.log('[NF-STUDY] cleanupUI called.');
  if (root) {
    root.unmount();
    root = null;
    console.log('[NF-STUDY] Unmounted React root in cleanupUI.');
  }

  if (divider) {
    divider.remove();
    divider = null;
    console.log('[NF-STUDY] Removed divider element.');
  }

  document.body.style.display = '';

  const appMountPoint = document.getElementById('appMountPoint');
  if (appMountPoint) {
    appMountPoint.style.width = '';
    appMountPoint.style.position = '';
    console.log('[NF-STUDY] Reset appMountPoint styles.');
  }

  const studyPanel = document.getElementById('studyPanel');
  if (studyPanel) {
    studyPanel.remove();
    console.log('[NF-STUDY] Removed #studyPanel element.');
  }
};

export const setIsPanelVisible = (value: boolean) => {
  isPanelVisible = value;
};

export const setIsOverlayVisible = (value: boolean) => {
  isOverlayVisible = value;
};

export const resetRenderedVideoId = () => {
  renderedVideoId = null;
};

function getVideoIdFromWindow() {
  try {
    const playerSessionId = (window as any).netflix?.appContext?.state?.playerApp
      ?.getAPI()
      ?.videoPlayer?.getAllPlayerSessionIds()
      ?.find((id: string) => id.startsWith('watch'));
      
    if (!playerSessionId) return null;
    
    const movieId = (window as any).netflix?.appContext?.state?.playerApp
      ?.getAPI()
      ?.videoPlayer?.getVideoPlayerBySessionId(playerSessionId)
      ?.getMovieId();
      
    return movieId;
  } catch (error) {
    return null;
  }
}
