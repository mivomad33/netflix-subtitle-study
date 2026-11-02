// DOM Injector for netflix-subtitle-study
// Ported from index.jsx without changing any UI decoration or styles

export function injectDashboardTab(navList: Element, onOpenDashboard: () => void): void {
  console.log('[NF-STUDY] Attempting to inject Dashboard tab. navList tag:', navList.tagName);
  const isUl = navList.tagName === 'UL' || navList.tagName === 'OL';
  const container = document.createElement(isUl ? 'li' : 'div');
  container.id = 'netflix-subtitle-study-dashboard-tab';
  
  if (isUl) {
    container.className = 'navigation-tab';
  } else {
    // 넷플릭스 새로운 내비게이션 구조(div)에 맞춤 데코레이션
    container.className = 'navigation-tab-div';
    container.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 0 10px; cursor: pointer;';
  }

  const a = document.createElement('a');
  a.href = '#';
  a.style.cssText = 'color: #10b981; font-weight: bold; cursor: pointer; text-decoration: none; font-size: 14px; display: flex; align-items: center; transition: color 0.2s;';
  a.innerText = '📚 나의 학습 대시보드';

  a.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('[NF-STUDY] Dashboard tab clicked.');
    onOpenDashboard();
  });

  // 호버 효과 추가
  a.addEventListener('mouseenter', () => {
    a.style.color = '#34d399';
  });
  a.addEventListener('mouseleave', () => {
    a.style.color = '#10b981';
  });

  container.appendChild(a);
  navList.appendChild(container);
  console.log('[NF-STUDY] Dashboard tab injected successfully.');
}

export function injectBottomToggleButton(
  controlsGroup: Element,
  volumeWrapper: Element,
  isPanelVisible: boolean,
  isOverlayVisible: boolean,
  onTogglePanel: () => void,
  onToggleOverlay: () => void
): void {
  console.log('[NF-STUDY] injectBottomToggleButton called.');
  const container = document.createElement('div');
  container.id = 'netflix-subtitle-study-toggle-button-container';
  container.className = volumeWrapper.className;
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.alignItems = 'center';

  // 1. 스터디 패널 토글 버튼 (📖)
  const panelButton = document.createElement('button');
  panelButton.id = 'netflix-subtitle-study-panel-button';
  panelButton.className = 'default-ltr-iqcdef-cache-1enhvti';
  panelButton.style.cssText = `
    background: transparent;
    border: none;
    color: ${isPanelVisible ? '#10b981' : '#888'};
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 36px;
    height: 36px;
    transition: color 0.2s, transform 0.1s;
  `;
  panelButton.setAttribute('type', 'button');
  panelButton.setAttribute('title', '스터디패널 열기/닫기');
  panelButton.setAttribute('aria-label', isPanelVisible ? '스터디패널 닫기' : '스터디패널 열기');

  panelButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" style="pointer-events: none;">
      <defs>
        <mask id="netflix-subtitle-study-book-mask">
          <rect width="24" height="24" fill="white" />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </mask>
      </defs>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" mask="url(#netflix-subtitle-study-book-mask)" />
    </svg>
  `;

  panelButton.addEventListener('click', () => {
    onTogglePanel();
  });

  panelButton.addEventListener('mouseenter', () => {
    panelButton.style.transform = 'scale(1.1)';
  });
  panelButton.addEventListener('mouseleave', () => {
    panelButton.style.transform = 'scale(1)';
  });

  // 2. 비디오 오버레이 자막 토글 버튼 (💬)
  const overlayButton = document.createElement('button');
  overlayButton.id = 'netflix-subtitle-study-overlay-button';
  overlayButton.className = 'default-ltr-iqcdef-cache-1enhvti';
  overlayButton.style.cssText = `
    background: transparent;
    border: none;
    color: ${isOverlayVisible ? '#10b981' : '#888'};
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 36px;
    height: 36px;
    transition: color 0.2s, transform 0.1s;
  `;
  overlayButton.setAttribute('type', 'button');
  overlayButton.setAttribute('title', '화면 오버레이 자막 켜기/끄기');
  overlayButton.setAttribute('aria-label', isOverlayVisible ? '오버레이 자막 끄기' : '오버레이 자막 켜기');

  overlayButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" style="pointer-events: none;">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" fill="currentColor" />
    </svg>
  `;

  overlayButton.addEventListener('click', () => {
    onToggleOverlay();
  });

  overlayButton.addEventListener('mouseenter', () => {
    overlayButton.style.transform = 'scale(1.1)';
  });
  overlayButton.addEventListener('mouseleave', () => {
    overlayButton.style.transform = 'scale(1)';
  });

  container.appendChild(panelButton);
  container.appendChild(overlayButton);

  controlsGroup.insertBefore(container, volumeWrapper.nextSibling);
  console.log('[NF-STUDY] Injected both panel & overlay toggle buttons successfully.');
}
