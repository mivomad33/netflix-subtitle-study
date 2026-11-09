import {
  BRIDGE_EVENT,
  BRIDGE_RESPONSE,
  BridgeCall,
  BridgeEvent,
  BridgeResponse,
  isBridgeEvent,
  parseBridgeRequest,
} from '../../shared/bridge/protocol';
import { NETFLIX_PORT } from '../../shared/rpc/protocol';
import { PortLike, createPortClient } from '../../shared/rpc/portClient';
import { toStorageErrorCode } from '../../shared/storage/errors';

// 넷플릭스 페이지 코드의 요청을 받아 서비스 워커에 넘기고 답을 돌려준다. Firebase는 여기서 돌지 않는다(4.3-4).
// 서비스 워커가 알리는 변경(무엇이 바뀌었는지만)도 페이지에 넘긴다. 서비스 워커가 멈췄다 다시 붙으면
// 그 사이 놓친 변경이 있을 수 있어 "모두 다시 읽기"를 알린다(4.2-3).
export function installStoreBridge(
  win: Window,
  connect: () => PortLike = () => chrome.runtime.connect({ name: NETFLIX_PORT }) as unknown as PortLike
): () => void {
  const post = (message: BridgeResponse | BridgeEvent) => win.postMessage(message, win.location.origin);
  const client = createPortClient({
    connect,
    onEvent(event) {
      if (isBridgeEvent(event)) post(event);
    },
    onReconnect() {
      post({ channel: BRIDGE_EVENT, event: 'changed', scope: 'all' });
    },
  });
  const listener = (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const request = parseBridgeRequest(event.data);
    if (!request) return;
    const { channel: _channel, requestId, ...call } = request;
    client.request('bridge', call as BridgeCall).then(
      (result) => post({ channel: BRIDGE_RESPONSE, requestId, ok: true, result }),
      (e) => post({ channel: BRIDGE_RESPONSE, requestId, ok: false, error: toStorageErrorCode(e) })
    );
  };
  win.addEventListener('message', listener);
  // 처음 붙어 로그인 상태를 받아 둔다.
  client.request('bridge', { op: 'auth.status' }).catch(() => {});
  return () => {
    win.removeEventListener('message', listener);
    client.close();
  };
}
