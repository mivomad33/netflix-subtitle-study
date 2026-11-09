// 서비스 워커가 확장 프로그램 화면과 content script의 포트 요청을 받는다.
// 확장 프로그램 화면(EXT_PORT)은 저장소 전체와 로그인을 쓰고, 넷플릭스 content script(NETFLIX_PORT)는
// 넷플릭스 작업만 쓴다(4.3-1). 넷플릭스 쪽에는 로그인 여부 하나와 오류 종류 코드만 보낸다(4.3-2).
import { BRIDGE_EVENT, BridgeEvent, ExtensionPage, extensionPagePath, parseBridgeCall } from '../../shared/bridge/protocol';
import { netflixEvents } from '../../shared/bridge/events';
import { handleBridgeCall } from '../../shared/bridge/handler';
import { EXT_PORT, NETFLIX_PORT, RpcRequest, RpcResponse } from '../../shared/rpc/protocol';
import { StorageError, toStorageErrorCode } from '../../shared/storage/errors';
import { PREFIX } from '../../shared/storage/keys';
import { Backend } from './backend';

export interface ServerPort {
  name: string;
  sender?: { id?: string; url?: string; origin?: string };
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (message: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

export interface ServerEnv {
  extensionId: string;
  extensionOrigin: string; // chrome-extension://{id}
  openPage(page: ExtensionPage): void;
}

const NETFLIX_ORIGIN = 'https://www.netflix.com';

const isRequest = (m: unknown): m is RpcRequest =>
  !!m && typeof m === 'object' && typeof (m as RpcRequest).id === 'number' && typeof (m as RpcRequest).method === 'string';

const originOf = (sender: ServerPort['sender']) => {
  if (!sender) return '';
  if (sender.origin) return sender.origin;
  try {
    return sender.url ? new URL(sender.url).origin : '';
  } catch {
    return '';
  }
};

async function handleExt(backend: Backend, method: string, params: unknown): Promise<unknown> {
  const p = (params ?? {}) as Record<string, unknown>;
  const area = () => {
    const a = backend.area();
    if (!a) throw new StorageError(backend.state().status === 'unconfigured' ? 'not-configured' : 'signed-out');
    return a;
  };
  const strings = (v: unknown) => {
    if (!Array.isArray(v) || !v.every((k) => typeof k === 'string')) throw new StorageError('invalid');
    return v as string[];
  };
  switch (method) {
    case 'auth.state':
      return backend.state();
    case 'auth.signIn':
      return backend.signIn();
    case 'auth.signOut':
      return backend.signOut();
    case 'account.delete':
      return backend.deleteAccount();
    case 'area.snapshot': {
      const a = area();
      const keys = (await a.getKeys()).filter((k) => !k.startsWith(PREFIX.chapter));
      return keys.length > 0 ? a.get(keys) : {};
    }
    case 'area.get':
      return area().get(strings(p.keys));
    case 'area.getKeys':
      return area().getKeys();
    case 'area.set':
      if (!p.items || typeof p.items !== 'object') throw new StorageError('invalid');
      return area().set(p.items as Record<string, unknown>);
    case 'area.remove':
      return area().remove(strings(p.keys));
    case 'area.usage':
      return area().usage();
    default:
      throw new StorageError('invalid');
  }
}

export function attachPort(backend: Backend, env: ServerEnv, port: ServerPort): void {
  const sender = port.sender ?? {};
  const origin = originOf(sender);
  const unsubscribers: (() => void)[] = [];
  const post = (m: unknown) => {
    try {
      port.postMessage(m);
    } catch {
      // 끊긴 포트
    }
  };
  port.onDisconnect.addListener(() => unsubscribers.forEach((u) => u()));

  if (port.name === EXT_PORT && sender.id === env.extensionId && origin === env.extensionOrigin) {
    unsubscribers.push(backend.onState((state) => post({ event: 'auth', state })));
    unsubscribers.push(backend.onChanges((changes) => post({ event: 'changes', changes })));
    port.onMessage.addListener((m) => {
      if (!isRequest(m)) return;
      handleExt(backend, m.method, m.params).then(
        (result) => post({ id: m.id, ok: true, result } as RpcResponse),
        (e) => post({ id: m.id, ok: false, error: toStorageErrorCode(e) } as RpcResponse)
      );
    });
    return;
  }

  if (port.name === NETFLIX_PORT && sender.id === env.extensionId && origin === NETFLIX_ORIGIN) {
    let signedIn = backend.state().status === 'signedIn';
    post({ channel: BRIDGE_EVENT, event: 'auth', signedIn } as BridgeEvent);
    unsubscribers.push(
      backend.onState((state) => {
        const next = state.status === 'signedIn';
        if (next === signedIn) return;
        signedIn = next;
        post({ channel: BRIDGE_EVENT, event: 'auth', signedIn } as BridgeEvent);
      })
    );
    unsubscribers.push(backend.onChanges((changes) => netflixEvents(changes).forEach(post)));
    // 요청을 받은 순서대로 하나씩 처리한다. 저장과 지우기가 각각 읽은 뒤에 쓰므로, 겹쳐 돌면
    // 먼저 보낸 저장이 나중에 보낸 지우기보다 늦게 반영될 수 있다.
    let queue: Promise<void> = Promise.resolve();
    port.onMessage.addListener((m) => {
      if (!isRequest(m) || m.method !== 'bridge') return;
      const call = parseBridgeCall(m.params);
      queue = queue.then(async () => {
        const result = call
          ? await handleBridgeCall(backend.area(), call, env.openPage)
          : { ok: false, error: 'invalid' as const };
        post({ id: m.id, ...result } as RpcResponse);
      });
    });
    return;
  }

  port.disconnect();
}

// 서비스 워커에 붙는 포트를 모두 attachPort로 넘긴다.
export function serveChromePorts(backend: Backend) {
  const env: ServerEnv = {
    extensionId: chrome.runtime.id,
    extensionOrigin: new URL(chrome.runtime.getURL('')).origin,
    openPage: (page) => chrome.tabs.create({ url: chrome.runtime.getURL(extensionPagePath(page)) }),
  };
  chrome.runtime.onConnect.addListener((port) => attachPort(backend, env, port as unknown as ServerPort));
}
