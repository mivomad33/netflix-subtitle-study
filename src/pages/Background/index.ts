console.log('[NF-STUDY] Background service worker initialized.');

const OPEN_PAGE_MESSAGE = 'NF_STUDY_OPEN_PAGE';

// 넷플릭스 페이지에서 원서 리더·메모 모아 보기를 새 탭으로 열어 달라는 요청을 처리한다.
chrome.runtime.onMessage.addListener((request) => {
  if (request?.type === OPEN_PAGE_MESSAGE && (request.page === 'reader' || request.page === 'memos')) {
    const hash = request.page === 'memos' ? '#/memos' : '#/';
    chrome.tabs.create({ url: chrome.runtime.getURL(`reader.html${hash}`) });
  }
  return false;
});
