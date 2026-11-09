import { StorageArea } from '../storage/storageArea';
import { StorageError } from '../storage/errors';
import { BridgeCall, BridgeEvent, ExtensionPage, parseBridgeCall } from './protocol';
import { handleBridgeCall } from './handler';
import { netflixEvents } from './events';

// 메시지를 거치지 않고 서비스 워커의 처리기를 바로 부르는 저장소 길. 테스트와 개발 화면에서 쓴다.
// area가 null이면 로그아웃 상태다.
export function createDirectClient(
  area: StorageArea | null,
  openPage: (page: ExtensionPage) => void = () => {}
) {
  return {
    async call<T>(call: BridgeCall): Promise<T> {
      const parsed = parseBridgeCall(call);
      if (!parsed) throw new StorageError('invalid');
      const result = await handleBridgeCall(area, parsed, openPage);
      if (!result.ok) throw new StorageError(result.error ?? 'unknown');
      return result.result as T;
    },
    subscribe(listener: (event: BridgeEvent) => void) {
      if (!area) return () => {};
      return area.onChanged((changes) => netflixEvents(changes).forEach(listener));
    },
  };
}
