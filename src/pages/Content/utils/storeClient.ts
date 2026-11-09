import {
  BRIDGE_REQUEST,
  BRIDGE_RESPONSE,
  BridgeCall,
  BridgeEvent,
  BridgeResponse,
  isBridgeEvent,
} from '../../../shared/bridge/protocol';
import { StorageError, storageErrorFromCode } from '../../../shared/storage/errors';

// 넷플릭스 페이지 코드에서 저장소를 쓰는 길. 페이지 코드는 chrome.*를 쓸 수 없어서
// content script(ContentLoader)에 메시지로 부탁하고, content script가 서비스 워커에 넘긴다.
// 실패하면 오류 종류 코드만 담은 StorageError를 던진다.
export interface StoreClient {
  call<T = unknown>(call: BridgeCall): Promise<T>;
  // 서비스 워커가 알리는 로그인 상태와 변경(무엇이 바뀌었는지만).
  subscribe?(listener: (event: BridgeEvent) => void): () => void;
}

let counter = 0;

export function createBridgeClient(win: Window = window, timeoutMs = 20000): StoreClient {
  return {
    call<T>(call: BridgeCall) {
      const requestId = `nfs-${Date.now().toString(36)}-${counter++}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          win.removeEventListener('message', listener);
          reject(new StorageError('unavailable'));
        }, timeoutMs);
        const listener = (event: MessageEvent) => {
          const data = event.data as BridgeResponse;
          if (event.source !== win || data?.channel !== BRIDGE_RESPONSE) return;
          if (data.requestId !== requestId) return;
          clearTimeout(timer);
          win.removeEventListener('message', listener);
          if (data.ok) resolve(data.result as T);
          else reject(storageErrorFromCode(data.error));
        };
        win.addEventListener('message', listener);
        win.postMessage({ channel: BRIDGE_REQUEST, requestId, ...call }, win.location.origin);
      });
    },
    subscribe(listener) {
      const handler = (event: MessageEvent) => {
        if (event.source !== win || event.origin !== win.location.origin) return;
        if (isBridgeEvent(event.data)) listener(event.data);
      };
      win.addEventListener('message', handler);
      return () => win.removeEventListener('message', handler);
    },
  };
}

let current: StoreClient | null = null;

export const getStoreClient = (): StoreClient => {
  if (!current) current = createBridgeClient();
  return current;
};

// 테스트에서 가짜 저장소를 붙일 때 쓴다.
export const setStoreClient = (client: StoreClient | null) => {
  current = client;
};
