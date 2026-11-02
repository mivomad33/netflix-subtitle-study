import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectDashboardTab, injectBottomToggleButton } from './domInjector';

describe('domInjector Utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('injects dashboard tab into navigation and triggers callback on click', () => {
    const navList = document.createElement('ul');
    document.body.appendChild(navList);

    const onOpen = vi.fn();
    injectDashboardTab(navList, onOpen);

    const injectedTab = document.getElementById('netflix-subtitle-study-dashboard-tab');
    expect(injectedTab).not.toBeNull();

    const link = injectedTab?.querySelector('a');
    expect(link).not.toBeNull();

    // 클릭 이벤트 트리거 검증
    link?.dispatchEvent(new MouseEvent('click'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('injects bottom toggle buttons beside volume wrapper and triggers callbacks', () => {
    const controlsGroup = document.createElement('div');
    const volumeWrapper = document.createElement('div');
    volumeWrapper.className = 'volume-class';
    controlsGroup.appendChild(volumeWrapper);
    document.body.appendChild(controlsGroup);

    const onTogglePanel = vi.fn();
    const onToggleOverlay = vi.fn();

    injectBottomToggleButton(
      controlsGroup,
      volumeWrapper,
      true,
      false,
      onTogglePanel,
      onToggleOverlay
    );

    const container = document.getElementById('netflix-subtitle-study-toggle-button-container');
    expect(container).not.toBeNull();

    const panelBtn = document.getElementById('netflix-subtitle-study-panel-button');
    const overlayBtn = document.getElementById('netflix-subtitle-study-overlay-button');

    expect(panelBtn).not.toBeNull();
    expect(overlayBtn).not.toBeNull();

    panelBtn?.dispatchEvent(new MouseEvent('click'));
    expect(onTogglePanel).toHaveBeenCalled();

    overlayBtn?.dispatchEvent(new MouseEvent('click'));
    expect(onToggleOverlay).toHaveBeenCalled();
  });
});
