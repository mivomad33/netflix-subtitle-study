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
  const listener = async (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const request = parseBridgeRequest(event.data);
    if (!request) return;
    const result = await handleBridgeRequest(area, request, openPage);
    const response: BridgeResponse = {
      channel: BRIDGE_RESPONSE,
      requestId: request.requestId,
      ...result,
    };
    win.postMessage(response, win.location.origin);
  };
  win.addEventListener('message', listener);
  return () => win.removeEventListener('message', listener);
}
