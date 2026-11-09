// 확장 프로그램 화면(원서 리더, 메모 모아 보기)이 서비스 워커의 저장소와 로그인을 쓰는 길.
// 다른 화면·기기에서 바뀐 것은 서비스 워커가 'changes'로 알린다. 서비스 워커가 멈췄다 다시 붙으면
// 그 사이 놓친 변경을 전체 목록을 다시 받아 비교해 알린다(4.2-3).
import { AuthClient, AuthState, isAuthState } from '../auth/types';
import { StorageArea, StorageChanges } from '../storage/storageArea';
import { EXT_PORT } from './protocol';
import { PortLike, createPortClient } from './portClient';

export interface ExtensionClient {
  area: StorageArea;
  auth: AuthClient;
  close(): void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createExtensionClient(
  connect: () => PortLike = () => chrome.runtime.connect({ name: EXT_PORT }) as unknown as PortLike
): ExtensionClient {
  let state: AuthState = { status: 'loading' };
  const authListeners = new Set<(s: AuthState) => void>();
  const areaListeners = new Set<(c: StorageChanges) => void>();
  // 변경 알림을 비교하려고 둔 작은 데이터의 사본(장 본문 제외). 읽기는 늘 서비스 워커에 묻는다.
  let mirror: Record<string, unknown> | null = null;
  let snapshotSeq = 0;

  const emit = (changes: StorageChanges) => {
    if (Object.keys(changes).length > 0) areaListeners.forEach((l) => l(changes));
  };

  const loadSnapshot = async () => {
    const seq = ++snapshotSeq;
    try {
      const values = await client.request<Record<string, unknown>>('area.snapshot');
      if (seq !== snapshotSeq) return;
      const before = mirror;
      mirror = values;
      if (!before) return;
      const changes: StorageChanges = {};
      new Set([...Object.keys(before), ...Object.keys(values)]).forEach((k) => {
        if (!same(before[k], values[k])) changes[k] = { oldValue: before[k], newValue: values[k] };
      });
      emit(changes);
    } catch {
      // 다음 변경 알림이나 재연결 때 다시 맞춘다.
    }
  };

  const setState = (next: AuthState) => {
    const wasSignedIn = state.status === 'signedIn';
    state = next;
    if (next.status === 'signedIn') {
      if (!wasSignedIn) mirror = null;
      loadSnapshot();
    } else {
      mirror = null;
    }
    authListeners.forEach((l) => l(next));
  };

  const client = createPortClient({
    connect,
    onEvent(event) {
      if (event.event === 'auth' && isAuthState(event.state)) setState(event.state);
      if (event.event === 'changes' && event.changes && typeof event.changes === 'object') {
        const changes = event.changes as StorageChanges;
        if (mirror) {
          Object.entries(changes).forEach(([k, c]) => {
            if (c.newValue === undefined) delete mirror![k];
            else mirror![k] = c.newValue;
          });
        }
        emit(changes);
      }
    },
    onReconnect() {
      refreshState();
    },
  });

  const refreshState = () => {
    client
      .request<AuthState>('auth.state')
      .then((s) => {
        if (!isAuthState(s)) return;
        if (s.status === 'signedIn' && state.status === 'signedIn' && s.email === state.email) {
          loadSnapshot();
          return;
        }
        setState(s);
      })
      .catch(() => {
        // 서비스 워커에 닿지 않으면 다음 재연결 때 다시 묻는다.
      });
  };
  refreshState();

  const area: StorageArea = {
    async get(keys) {
      if (keys.length === 0) return {};
      return client.request<Record<string, unknown>>('area.get', { keys });
    },
    getKeys: () => client.request<string[]>('area.getKeys'),
    async set(items) {
      await client.request('area.set', { items });
    },
    async remove(keys) {
      await client.request('area.remove', { keys });
    },
    onChanged(listener) {
      areaListeners.add(listener);
      return () => areaListeners.delete(listener);
    },
  };

  const auth: AuthClient = {
    getState: () => state,
    subscribe(listener) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
    async signIn() {
      await client.request('auth.signIn');
    },
    async signOut() {
      await client.request('auth.signOut');
    },
    async deleteAccount() {
      await client.request('account.delete');
    },
    usage: () => client.request<number>('area.usage'),
  };

  return { area, auth, close: () => client.close() };
}
