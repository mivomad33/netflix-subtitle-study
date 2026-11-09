import { Memo, isValidMemo } from '../memo/types';
import { StorageErrorCode } from '../storage/errors';
import {
  NetflixSettings,
  StudiedVideoRecord,
  isValidChecklist,
  isValidItemsPerPage,
  isValidNetflixSettings,
  jsonLength,
  isValidStudiedVideo,
} from './netflixRecords';

// 넷플릭스 페이지에 넣은 코드(chrome.* 없음)와 content script 사이의 메시지 형식.
// 넷플릭스 페이지의 다른 스크립트도 같은 창으로 메시지를 보낼 수 있으므로, 받는 쪽은 이 형식만 처리한다.
// content script는 요청을 서비스 워커에 넘기고, 서비스 워커가 같은 검사를 한 번 더 한 뒤 처리한다.
export const BRIDGE_REQUEST = 'NF_STUDY_STORE_REQUEST';
export const BRIDGE_RESPONSE = 'NF_STUDY_STORE_RESPONSE';
// 서비스 워커가 알리는 변경. 무엇이 바뀌었는지만 담고 값은 담지 않는다(넷플릭스 쪽은 다시 읽는다).
export const BRIDGE_EVENT = 'NF_STUDY_STORE_EVENT';

export type ExtensionPage = 'reader' | 'memos';

export const isExtensionPage = (value: unknown): value is ExtensionPage =>
  value === 'reader' || value === 'memos';

// 확장 프로그램 페이지 주소(chrome.runtime.getURL에 넘긴다).
export const extensionPagePath = (page: ExtensionPage) =>
  page === 'memos' ? 'reader.html#/memos' : 'reader.html#/';

export type BridgeCall =
  | { op: 'auth.status' }
  | { op: 'memos.list'; videoId: string }
  | { op: 'memos.put'; memo: Memo }
  | { op: 'memos.delete'; id: string }
  | { op: 'memos.reportUnplaced'; videoId: string; ids: string[] }
  | { op: 'nfSettings.get' }
  | { op: 'nfSettings.set'; settings: NetflixSettings }
  | { op: 'checklist.get'; videoId: string }
  | { op: 'checklist.set'; videoId: string; checklist: unknown }
  | { op: 'checklist.delete'; videoId: string }
  | { op: 'itemsPerPage.get'; videoId: string }
  | { op: 'itemsPerPage.set'; videoId: string; value: number }
  | { op: 'studied.list' }
  | { op: 'studied.put'; video: StudiedVideoRecord }
  | { op: 'studied.delete'; videoId: string }
  | { op: 'page.open'; page: ExtensionPage };

export type BridgeOp = BridgeCall['op'];

export type BridgeRequest = BridgeCall & { channel: typeof BRIDGE_REQUEST; requestId: string };

export interface BridgeResult {
  ok: boolean;
  result?: unknown;
  // 정해 둔 오류 종류만 넘긴다. 원래 오류 문구(문서 경로에 uid가 들 수 있다)는 넘기지 않는다(4.3-2).
  error?: StorageErrorCode;
}

export interface BridgeResponse extends BridgeResult {
  channel: typeof BRIDGE_RESPONSE;
  requestId: string;
}

export type BridgeEventScope = 'memos' | 'checklist' | 'itemsPerPage' | 'studied' | 'nfSettings' | 'all';

export type BridgeEvent =
  | { channel: typeof BRIDGE_EVENT; event: 'auth'; signedIn: boolean }
  | { channel: typeof BRIDGE_EVENT; event: 'changed'; scope: BridgeEventScope; videoId?: string };

// 한 영상에서 위치를 찾지 못했다고 남길 수 있는 메모 수의 상한.
const MAX_UNPLACED_IDS = 5000;
// 영상 id·메모 id의 길이 상한(문서 이름이 커지지 않게).
export const MAX_ID_LENGTH = 200;
// 메모 하나의 크기 상한(JSON 글자 수).
export const MAX_MEMO_CHARS = 50_000;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';
export const isShortId = (v: unknown): v is string => isNonEmptyString(v) && v.length <= MAX_ID_LENGTH;
const isNetflixMemo = (v: unknown): v is Memo =>
  isValidMemo(v) && v.kind === 'netflix' && isShortId(v.id) && isShortId(v.sourceId) && jsonLength(v) <= MAX_MEMO_CHARS;

function valid(d: Record<string, unknown>): boolean {
  switch (d.op) {
    case 'auth.status':
    case 'nfSettings.get':
    case 'studied.list':
      return true;
    case 'memos.list':
    case 'checklist.get':
    case 'checklist.delete':
    case 'itemsPerPage.get':
    case 'studied.delete':
      return isShortId(d.videoId);
    case 'memos.put':
      return isNetflixMemo(d.memo);
    case 'memos.delete':
      return isShortId(d.id);
    case 'memos.reportUnplaced':
      return (
        isShortId(d.videoId) && Array.isArray(d.ids) && d.ids.length <= MAX_UNPLACED_IDS && d.ids.every(isShortId)
      );
    case 'nfSettings.set':
      return isValidNetflixSettings(d.settings);
    case 'checklist.set':
      return isShortId(d.videoId) && isValidChecklist(d.checklist);
    case 'itemsPerPage.set':
      return isShortId(d.videoId) && isValidItemsPerPage(d.value);
    case 'studied.put':
      return isValidStudiedVideo(d.video);
    case 'page.open':
      return isExtensionPage(d.page);
    default:
      return false;
  }
}

// 형식이 맞는 요청만 돌려주고, 아니면 null.
export function parseBridgeRequest(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.channel !== BRIDGE_REQUEST || !isShortId(d.requestId)) return null;
  return valid(d) ? (d as unknown as BridgeRequest) : null;
}

// 서비스 워커에서: 포트로 받은 호출(channel·requestId 없이)을 같은 기준으로 검사한다.
export function parseBridgeCall(data: unknown): BridgeCall | null {
  if (!data || typeof data !== 'object') return null;
  return valid(data as Record<string, unknown>) ? (data as BridgeCall) : null;
}

export function isBridgeEvent(data: unknown): data is BridgeEvent {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.channel !== BRIDGE_EVENT) return false;
  if (d.event === 'auth') return typeof d.signedIn === 'boolean' && Object.keys(d).length === 3;
  if (d.event === 'changed') {
    const scopes: BridgeEventScope[] = ['memos', 'checklist', 'itemsPerPage', 'studied', 'nfSettings', 'all'];
    return (
      scopes.includes(d.scope as BridgeEventScope) &&
      (d.videoId === undefined || isShortId(d.videoId)) &&
      Object.keys(d).every((k) => ['channel', 'event', 'scope', 'videoId'].includes(k))
    );
  }
  return false;
}
