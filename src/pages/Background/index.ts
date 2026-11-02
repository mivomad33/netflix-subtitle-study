console.log('[NF-STUDY] Background service worker initialized.');

// 현재는 미사용 (단어장 기능 제거로 인해 메세지 리스너가 비어 있습니다)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[NF-STUDY] Background received message:', request.type, request.videoId || '');
  return false;
});
