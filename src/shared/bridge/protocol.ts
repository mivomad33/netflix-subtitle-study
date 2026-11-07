import { Memo, isValidMemo } from '../memo/types';
import { LegacyPayload } from '../storage/legacyMigration';

// 넷플릭스 페이지에 넣은 코드(chrome.* 없음)와 content script 사이의 메시지 형식.
// 넷플릭스 페이지의 다른 스크립트도 같은 창으로 메시지를 보낼 수 있으므로, 받는 쪽은 이 형식만 처리한다.
export const BRIDGE_REQUEST = 'NF_STUDY_STORE_REQUEST';
export const BRIDGE_RESPONSE = 'NF_STUDY_STORE_RESPONSE';

export type ExtensionPage = 'reader' | 'memos';

export const isExtensionPage = (value: unknown): value is ExtensionPage =>
  value === 'reader' || value === 'memos';

// 확장 프로그램 페이지 주소(chrome.runtime.getURL에 넘긴다).
export const extensionPagePath = (page: ExtensionPage) =>
  page === 'memos' ? 'reader.html#/memos' : 'reader.html#/';

// content script가 background에 탭을 열어 달라고 보내는 메시지 종류.
export const OPEN_PAGE_MESSAGE = 'NF_STUDY_OPEN_PAGE';

export type BridgeCall =
  | { op: 'memos.list'; videoId: string }
  | { op: 'memos.put'; memo: Memo }
  | { op: 'memos.delete'; id: string }
  | { op: 'memos.reportUnplaced'; videoId: string; ids: string[] }
  | { op: 'legacy.migrate'; payload: LegacyPayload }
  | { op: 'page.open'; page: ExtensionPage };

export type BridgeRequest = BridgeCall & { channel: typeof BRIDGE_REQUEST; requestId: string };

export interface BridgeResponse {
  channel: typeof BRIDGE_RESPONSE;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// 한 영상에서 위치를 찾지 못했다고 남길 수 있는 메모 수의 상한.
const MAX_UNPLACED_IDS = 5000;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';

const isLegacyPayload = (v: unknown): v is LegacyPayload => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (!p.annotations || typeof p.annotations !== 'object') return false;
  if (!Object.values(p.annotations as object).every((s) => typeof s === 'string')) return false;
  return p.studiedVideos === null || typeof p.studiedVideos === 'string';
};

// 형식이 맞는 요청만 돌려주고, 아니면 null.
export function parseBridgeRequest(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.channel !== BRIDGE_REQUEST || !isNonEmptyString(d.requestId)) return null;
  switch (d.op) {
    case 'memos.list':
      return isNonEmptyString(d.videoId) ? (d as unknown as BridgeRequest) : null;
    case 'memos.put':
      return isValidMemo(d.memo) && d.memo.kind === 'netflix'
        ? (d as unknown as BridgeRequest)
        : null;
    case 'memos.delete':
      return isNonEmptyString(d.id) ? (d as unknown as BridgeRequest) : null;
    case 'memos.reportUnplaced':
      return isNonEmptyString(d.videoId) &&
        Array.isArray(d.ids) &&
        d.ids.length <= MAX_UNPLACED_IDS &&
        d.ids.every(isNonEmptyString)
        ? (d as unknown as BridgeRequest)
        : null;
    case 'legacy.migrate':
      return isLegacyPayload(d.payload) ? (d as unknown as BridgeRequest) : null;
    case 'page.open':
      return isExtensionPage(d.page) ? (d as unknown as BridgeRequest) : null;
    default:
      return null;
  }
}
