import React from 'react';
import { ExtensionPage, extensionPagePath } from '../../shared/bridge/protocol';
import './Popup.css';

// 확장 프로그램 아이콘을 누르면 뜨는 창. 원서 리더와 모아 보기를 새 탭으로 연다.
function openPage(page: ExtensionPage) {
  chrome.tabs.create({ url: chrome.runtime.getURL(extensionPagePath(page)) });
  window.close();
}

const Popup = () => (
  <main className="popup">
    <h1 className="popup-title">넷플릭스 학습</h1>
    <p className="popup-desc">
      원서를 읽거나, 넷플릭스와 원서에서 남긴 메모를 모아 봅니다.
    </p>
    <div className="popup-actions">
      <button
        type="button"
        className="popup-button popup-button-primary"
        onClick={() => openPage('reader')}
      >
        원서 리더
      </button>
      <button
        type="button"
        className="popup-button"
        onClick={() => openPage('memos')}
      >
        메모 모아 보기
      </button>
    </div>
  </main>
);

export default Popup;
