import { createChromeArea } from '../../shared/storage/storageArea';
import { installStoreBridge, OPEN_PAGE_MESSAGE } from './storeBridge';

console.log('[NF-STUDY] ContentLoader (index.ts) initialized. Injecting contentScript.bundle.js...');

// 공통 저장소(chrome.storage.local)와 넷플릭스 페이지 코드를 잇는다. 페이지 코드보다 먼저 듣기 시작한다.
installStoreBridge(window, createChromeArea(), (page) => {
  chrome.runtime.sendMessage({ type: OPEN_PAGE_MESSAGE, page });
});

const script = document.createElement('script');
script.src = chrome.runtime.getURL('contentScript.bundle.js');
document.head.appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', async (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type === 'SAVE_VOCABULARY_REQUEST') {
    try {
      // Forward the request to background script
      const response = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: 'SAVE_VOCABULARY', data: event.data.data },
            (response) => {
              resolve(response);
            }
          );
        }
      );

      // Send the response back to the injected script
      window.postMessage(
        {
          type: 'SAVE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response,
        },
        '*'
      );
    } catch (error) {
      // Send error response back to the injected script
      window.postMessage(
        {
          type: 'SAVE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : '단어장 저장에 실패했습니다.',
          },
        },
        '*'
      );
    }
  }

  if (event.data.type === 'GET_VOCABULARIES_REQUEST') {
    try {
      // Forward the request to background script
      const response = await new Promise<{
        success: boolean;
        data?: any;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_VOCABULARIES', videoId: event.data.videoId },
          (response) => {
            resolve(response);
          }
        );
      });

      // Send the response back to the injected script
      window.postMessage(
        {
          type: 'GET_VOCABULARIES_RESPONSE',
          messageId: event.data.messageId,
          response,
        },
        '*'
      );
    } catch (error) {
      // Send error response back to the injected script
      window.postMessage(
        {
          type: 'GET_VOCABULARIES_RESPONSE',
          messageId: event.data.messageId,
          response: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : '단어장 조회에 실패했습니다.',
          },
        },
        '*'
      );
    }
  }

  if (event.data.type === 'UPDATE_VOCABULARY_REQUEST') {
    try {
      // Forward the request to background script
      const response = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: 'UPDATE_VOCABULARY', data: event.data.data },
            (response) => {
              resolve(response);
            }
          );
        }
      );

      // Send the response back to the injected script
      window.postMessage(
        {
          type: 'UPDATE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response,
        },
        '*'
      );
    } catch (error) {
      // Send error response back to the injected script
      window.postMessage(
        {
          type: 'UPDATE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : '단어 수정에 실패했습니다.',
          },
        },
        '*'
      );
    }
  }

  if (event.data.type === 'DELETE_VOCABULARY_REQUEST') {
    try {
      // Forward the request to background script
      const response = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: 'DELETE_VOCABULARY', data: event.data.data },
            (response) => {
              resolve(response);
            }
          );
        }
      );

      // Send the response back to the injected script
      window.postMessage(
        {
          type: 'DELETE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response,
        },
        '*'
      );
    } catch (error) {
      // Send error response back to the injected script
      window.postMessage(
        {
          type: 'DELETE_VOCABULARY_RESPONSE',
          messageId: event.data.messageId,
          response: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : '단어 삭제에 실패했습니다.',
          },
        },
        '*'
      );
    }
  }
});
