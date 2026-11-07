import { StorageArea } from '../storage/storageArea';
import { BRIDGE_REQUEST, BridgeCall, ExtensionPage, parseBridgeRequest } from './protocol';
import { handleBridgeRequest } from './handler';

// 메시지를 거치지 않고 content script 처리기를 바로 부르는 저장소 길. 테스트에서 쓴다.
export function createDirectClient(
  area: StorageArea,
  openPage: (page: ExtensionPage) => void = () => {}
) {
  return {
    async call<T>(call: BridgeCall): Promise<T> {
      const request = parseBridgeRequest({ channel: BRIDGE_REQUEST, requestId: 'direct', ...call });
      if (!request) throw new Error('invalid request');
      const result = await handleBridgeRequest(area, request, openPage);
      if (!result.ok) throw new Error(result.error);
      return result.result as T;
    },
  };
}
