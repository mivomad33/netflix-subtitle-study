import { OPEN_PAGE_MESSAGE, extensionPagePath, isExtensionPage } from '../../shared/bridge/protocol';

console.log('[NF-STUDY] Background service worker initialized.');

// 넷플릭스 페이지에서 원서 리더·메모 모아 보기를 새 탭으로 열어 달라는 요청을 처리한다.
chrome.runtime.onMessage.addListener((request) => {
  if (request?.type === OPEN_PAGE_MESSAGE && isExtensionPage(request.page)) {
    chrome.tabs.create({ url: chrome.runtime.getURL(extensionPagePath(request.page)) });
  }
  return false;
});
