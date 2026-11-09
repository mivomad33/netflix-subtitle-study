// 확장 프로그램 화면·content script와 서비스 워커 사이의 포트 메시지 형식.
// Firebase는 서비스 워커에서만 돈다. 넷플릭스 포트는 넷플릭스 작업만 받는다(4.3-1).
import { StorageErrorCode } from '../storage/errors';

export const EXT_PORT = 'nf-study-ext';
export const NETFLIX_PORT = 'nf-study-netflix';
// 서비스 워커가 쉬다 멈추지 않게 이 간격으로 신호를 보낸다(멈춰도 다시 이어 붙는다).
export const KEEPALIVE_MS = 20_000;

export type ExtMethod =
  | 'auth.state'
  | 'auth.signIn'
  | 'auth.signOut'
  | 'account.delete'
  | 'area.snapshot'
  | 'area.get'
  | 'area.getKeys'
  | 'area.set'
  | 'area.remove'
  | 'area.usage';

export interface RpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: StorageErrorCode;
}

export interface RpcEvent {
  event: string;
  [key: string]: unknown;
}

export const PING = { ping: true } as const;

export const isRpcResponse = (v: unknown): v is RpcResponse =>
  !!v && typeof v === 'object' && typeof (v as RpcResponse).id === 'number' && typeof (v as RpcResponse).ok === 'boolean';

export const isRpcEvent = (v: unknown): v is RpcEvent =>
  !!v && typeof v === 'object' && typeof (v as RpcEvent).event === 'string';
