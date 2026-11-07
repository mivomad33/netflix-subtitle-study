import {
  BRIDGE_REQUEST,
  BRIDGE_RESPONSE,
  BridgeCall,
  BridgeResponse,
} from '../../../shared/bridge/protocol';
import { STORAGE_KEYS } from '../constants/storageKeys';

// 넷플릭스 페이지 코드에서 공통 저장소를 쓰는 길. 페이지 코드는 chrome.*를 쓸 수 없어서
// content script(ContentLoader)에 메시지로 부탁한다.
export interface StoreClient {
  call<T = unknown>(call: BridgeCall): Promise<T>;
}

let counter = 0;

export function createBridgeClient(win: Window = window, timeoutMs = 10000): StoreClient {
  return {
    call<T>(call: BridgeCall) {
      const requestId = `nfs-${Date.now().toString(36)}-${counter++}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          win.removeEventListener('message', listener);
          reject(new Error('store bridge timeout'));
        }, timeoutMs);
        const listener = (event: MessageEvent) => {
          const data = event.data as BridgeResponse;
          if (event.source !== win || data?.channel !== BRIDGE_RESPONSE) return;
          if (data.requestId !== requestId) return;
          clearTimeout(timer);
          win.removeEventListener('message', listener);
          if (data.ok) resolve(data.result as T);
          else reject(new Error(data.error || 'store bridge error'));
        };
        win.addEventListener('message', listener);
        win.postMessage({ channel: BRIDGE_REQUEST, requestId, ...call }, win.location.origin);
      });
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
  migrationPromise = null;
};

const LEGACY_PREFIX = STORAGE_KEYS.LEGACY_ANNOTATIONS_PREFIX;
let migrationPromise: Promise<void> | null = null;

// 넷플릭스 localStorage의 옛 메모를 공통 저장소로 한 번 복사한다. 원본은 지우지 않는다.
export function ensureLegacyMigration(): Promise<void> {
  if (!migrationPromise) {
    const annotations: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) {
        annotations[key.slice(LEGACY_PREFIX.length)] = localStorage.getItem(key) ?? '';
      }
    }
    migrationPromise = getStoreClient()
      .call({
        op: 'legacy.migrate',
        payload: { annotations, studiedVideos: localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS) },
      })
      .then((result) => {
        console.log('[NF-STUDY] Legacy annotation migration:', result);
      })
      .catch((e) => {
        console.error('[NF-STUDY] Legacy annotation migration failed:', e);
        migrationPromise = null; // 다음에 다시 시도한다
      });
  }
  return migrationPromise ?? Promise.resolve();
}

