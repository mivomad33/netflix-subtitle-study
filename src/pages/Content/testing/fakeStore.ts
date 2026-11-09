import { createDirectClient } from '../../../shared/bridge/directClient';
import { BRIDGE_EVENT, BridgeCall, BridgeEvent, BridgeEventScope, BridgeOp } from '../../../shared/bridge/protocol';
import { StorageError, StorageErrorCode } from '../../../shared/storage/errors';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { StoreClient, setStoreClient } from '../utils/storeClient';

// 테스트용 저장소 길. 메모리 저장소(area가 null이면 로그아웃)를 서비스 워커 처리기에 바로 붙이고,
// 부른 작업을 모두 기록한다. failures에 적은 작업은 그 오류 종류로 실패한다.
export function installFakeStore(
  area: StorageArea | null = createMemoryArea(),
  failures: Partial<Record<BridgeOp, StorageErrorCode>> = {},
  // false면 저장소가 바뀌어도 알리지 않는다(알림을 놓친 뒤 'all'로 다시 읽는 경우를 흉내 낼 때).
  liveEvents = true
) {
  const direct = createDirectClient(area);
  const calls: BridgeCall[] = [];
  const extraListeners = new Set<(event: BridgeEvent) => void>();
  const client: StoreClient = {
    call<T>(call: BridgeCall): Promise<T> {
      calls.push(call);
      const code = failures[call.op];
      if (code) return Promise.reject(new StorageError(code));
      return direct.call<T>(call);
    },
    subscribe(listener) {
      extraListeners.add(listener);
      const off = liveEvents ? direct.subscribe(listener) : () => {};
      return () => {
        extraListeners.delete(listener);
        off();
      };
    },
  };
  setStoreClient(client);
  return {
    area,
    calls,
    failures,
    ops: () => calls.map((c) => c.op),
    // 서비스 워커가 보내는 알림을 흉내 낸다(로그인 상태 변화, 서비스 워커가 다시 깨어난 뒤의 'all').
    emit: (event: { event: 'auth'; signedIn: boolean } | { event: 'changed'; scope: BridgeEventScope; videoId?: string }) =>
      extraListeners.forEach((l) => l({ channel: BRIDGE_EVENT, ...event } as BridgeEvent)),
  };
}
