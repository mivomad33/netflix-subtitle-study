// 서비스 워커에 붙는 포트. 서비스 워커는 쉬면 멈추므로(약 30초), 끊기면 바로 다시 붙고
// 보내던 요청을 한 번 더 보낸다. 다시 붙으면 onReconnect로 알려, 그 사이 놓친 변경을 다시 읽게 한다(4.2-3).
import { StorageError, isStorageErrorCode } from '../storage/errors';
import { KEEPALIVE_MS, PING, RpcEvent, isRpcEvent, isRpcResponse } from './protocol';

export interface PortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (message: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

export interface PortClientOptions {
  connect: () => PortLike;
  onEvent?: (event: RpcEvent) => void;
  onReconnect?: () => void;
  timeoutMs?: number;
  keepaliveMs?: number;
}

export interface PortClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  close(): void;
}

interface Pending {
  message: { id: number; method: string; params?: unknown };
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  retried: boolean;
  timer: ReturnType<typeof setTimeout>;
}

export function createPortClient(options: PortClientOptions): PortClient {
  const timeoutMs = options.timeoutMs ?? 60_000;
  let port: PortLike | null = null;
  let closed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const onMessage = (message: unknown) => {
    if (isRpcResponse(message)) {
      const p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id);
      clearTimeout(p.timer);
      if (message.ok) p.resolve(message.result);
      else p.reject(new StorageError(isStorageErrorCode(message.error) ? message.error : 'unknown'));
      return;
    }
    if (isRpcEvent(message)) options.onEvent?.(message);
  };

  const connect = (): PortLike | null => {
    if (closed) return null;
    if (port) return port;
    try {
      const p = options.connect();
      port = p;
      p.onMessage.addListener(onMessage);
      p.onDisconnect.addListener(() => {
        if (port !== p) return;
        port = null;
        if (closed) return;
        // 보내던 요청을 다시 보낸다(한 번만). 다시 붙는 것 자체가 서비스 워커를 깨운다.
        const again = Array.from(pending.values());
        setTimeout(() => {
          const next = connect();
          if (!next) {
            again.forEach((r) => fail(r, new StorageError('unavailable')));
            return;
          }
          options.onReconnect?.();
          again.forEach((r) => {
            if (r.retried) fail(r, new StorageError('unavailable'));
            else {
              r.retried = true;
              next.postMessage(r.message);
            }
          });
        }, 0);
      });
      return p;
    } catch {
      return null;
    }
  };

  const fail = (r: Pending, e: unknown) => {
    if (!pending.has(r.message.id)) return;
    pending.delete(r.message.id);
    clearTimeout(r.timer);
    r.reject(e);
  };

  const keepalive = setInterval(() => {
    if (port) {
      try {
        port.postMessage(PING);
      } catch {
        // 끊긴 포트. onDisconnect가 다시 붙인다.
      }
    }
  }, options.keepaliveMs ?? KEEPALIVE_MS);

  return {
    request<T>(method: string, params?: unknown) {
      return new Promise<T>((resolve, reject) => {
        const p = connect();
        if (!p) {
          reject(new StorageError('unavailable'));
          return;
        }
        const message = { id: nextId++, method, params };
        const entry: Pending = {
          message,
          resolve: resolve as (v: unknown) => void,
          reject,
          retried: false,
          timer: setTimeout(() => fail(entry, new StorageError('unavailable')), timeoutMs),
        };
        pending.set(message.id, entry);
        p.postMessage(message);
      });
    },
    close() {
      closed = true;
      clearInterval(keepalive);
      port?.disconnect();
      port = null;
      pending.forEach((r) => fail(r, new StorageError('unavailable')));
    },
  };
}

