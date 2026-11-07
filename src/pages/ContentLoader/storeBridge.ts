import {
  BRIDGE_RESPONSE,
  BridgeResponse,
  ExtensionPage,
  parseBridgeRequest,
} from '../../shared/bridge/protocol';
import { handleBridgeRequest } from '../../shared/bridge/handler';
import { StorageArea } from '../../shared/storage/storageArea';

// 넷플릭스 페이지 코드의 요청을 받아 공통 저장소에 반영하고 답을 돌려준다.
export function installStoreBridge(
  win: Window,
  area: StorageArea,
  openPage: (page: ExtensionPage) => void
): () => void {
  // 요청을 받은 순서대로 하나씩 처리한다. 저장과 지우기가 각각 읽은 뒤에 쓰므로, 겹쳐 돌면
  // 먼저 보낸 저장이 나중에 보낸 지우기보다 늦게 반영될 수 있다.
  let queue: Promise<void> = Promise.resolve();
  const listener = (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const request = parseBridgeRequest(event.data);
    if (!request) return;
    queue = queue.then(async () => {
      const result = await handleBridgeRequest(area, request, openPage);
      const response: BridgeResponse = {
        channel: BRIDGE_RESPONSE,
        requestId: request.requestId,
        ...result,
      };
      win.postMessage(response, win.location.origin);
    }).catch((e) => console.error('[NF-STUDY] Store bridge failed:', e));
  };
  win.addEventListener('message', listener);
  return () => win.removeEventListener('message', listener);
}
