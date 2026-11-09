// 단위 테스트용: 메모리 저장소를 쓰는 가짜 서비스 워커 백엔드와, 서비스 워커에 붙는 가짜 포트.
import { AuthState } from '../shared/auth/types';
import { StorageArea, StorageChanges, createMemoryArea } from '../shared/storage/storageArea';
import { FirestoreArea } from '../shared/storage/firestoreArea';
import { Backend } from '../pages/Background/backend';
import { ServerEnv, ServerPort, attachPort } from '../pages/Background/server';
import { PortLike } from '../shared/rpc/portClient';

export interface FakeBackend extends Backend {
  memory: StorageArea;
  setState(state: AuthState): void;
}

export function createFakeBackend(
  initial: Record<string, unknown> = {},
  state: AuthState = { status: 'signedIn', email: 'tester@example.test' }
): FakeBackend {
  const memory = createMemoryArea(initial);
  let current = state;
  const stateListeners = new Set<(s: AuthState) => void>();
  const changeListeners = new Set<(c: StorageChanges) => void>();
  memory.onChanged((c) => changeListeners.forEach((l) => l(c)));
  const area = {
    ...memory,
    ready: async () => {},
    usage: async () => JSON.stringify(await memory.get(await memory.getKeys())).length,
    deleteAll: async () => memory.remove(await memory.getKeys()),
    close: () => {},
  } as FirestoreArea;
  return {
    memory,
    state: () => current,
    setState(next) {
      current = next;
      stateListeners.forEach((l) => l(next));
    },
    onState(l) {
      stateListeners.add(l);
      return () => stateListeners.delete(l);
    },
    area: () => (current.status === 'signedIn' ? area : null),
    onChanges(l) {
      changeListeners.add(l);
      return () => changeListeners.delete(l);
    },
    signIn: async () => {},
    signOut: async () => {},
    deleteAccount: async () => {},
  };
}

export const TEST_EXTENSION_ID = 'flhkacfjjpipfoicbnmednajnhebihmb';
export const TEST_ENV: ServerEnv = {
  extensionId: TEST_EXTENSION_ID,
  extensionOrigin: `chrome-extension://${TEST_EXTENSION_ID}`,
  openPage: () => {},
};

type Listener<T> = (v: T) => void;
const later = (fn: () => void) => setTimeout(fn, 0);

// 비동기로 메시지를 주고받는 포트 한 쌍.
function portPair(name: string, sender: ServerPort['sender']) {
  const toClient: Listener<unknown>[] = [];
  const toServer: Listener<unknown>[] = [];
  const clientGone: (() => void)[] = [];
  const serverGone: (() => void)[] = [];
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    later(() => {
      clientGone.forEach((l) => l());
      serverGone.forEach((l) => l());
    });
  };
  const clone = (m: unknown) => (m === undefined ? m : JSON.parse(JSON.stringify(m)));
  const client: PortLike = {
    postMessage(m) {
      if (!open) throw new Error('disconnected');
      const copy = clone(m);
      later(() => open && toServer.forEach((l) => l(copy)));
    },
    disconnect: close,
    onMessage: { addListener: (fn) => toClient.push(fn) },
    onDisconnect: { addListener: (fn) => clientGone.push(fn) },
  };
  const server: ServerPort = {
    name,
    sender,
    postMessage(m) {
      if (!open) throw new Error('disconnected');
      const copy = clone(m);
      later(() => open && toClient.forEach((l) => l(copy)));
    },
    disconnect: close,
    onMessage: { addListener: (fn) => toServer.push(fn) },
    onDisconnect: { addListener: (fn) => serverGone.push(fn) },
  };
  return { client, server, close };
}

// 서비스 워커(가짜 백엔드)에 붙는 connect 함수. stopWorker()는 서비스 워커가 멈춘 것처럼 모든 포트를 끊는다.
export function fakeWorker(backend: Backend, env: ServerEnv = TEST_ENV) {
  const pairs: { close: () => void }[] = [];
  let connections = 0;
  const connect = (name: string, origin: string) => (): PortLike => {
    const pair = portPair(name, { id: env.extensionId, url: `${origin}/page`, origin });
    connections++;
    pairs.push(pair);
    attachPort(backend, env, pair.server);
    return pair.client;
  };
  return {
    connect,
    get connections() {
      return connections;
    },
    stopWorker() {
      pairs.splice(0).forEach((p) => p.close());
    },
  };
}
