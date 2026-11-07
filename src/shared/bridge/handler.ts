import {
  getMemo,
  deleteMemo,
  listMemosBySource,
  putMemo,
  setUnplacedNetflixMemos,
} from '../storage/repo';
import { migrateLegacyAnnotations } from '../storage/legacyMigration';
import { StorageArea } from '../storage/storageArea';
import { BridgeRequest, ExtensionPage } from './protocol';

// content script에서 넷플릭스 페이지의 요청을 처리한다. 넷플릭스 메모만 다룬다.
export async function handleBridgeRequest(
  area: StorageArea,
  request: BridgeRequest,
  openPage: (page: ExtensionPage) => void
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (request.op) {
      case 'memos.list':
        return { ok: true, result: await listMemosBySource(area, 'netflix', request.videoId) };
      case 'memos.put': {
        const existing = await getMemo(area, request.memo.id);
        if (existing && existing.kind !== 'netflix') {
          return { ok: false, error: 'not a netflix memo' };
        }
        await putMemo(area, request.memo);
        return { ok: true };
      }
      case 'memos.delete': {
        const existing = await getMemo(area, request.id);
        if (!existing) return { ok: true };
        if (existing.kind !== 'netflix') return { ok: false, error: 'not a netflix memo' };
        await deleteMemo(area, request.id);
        return { ok: true };
      }
      case 'memos.reportUnplaced':
        await setUnplacedNetflixMemos(area, request.videoId, request.ids);
        return { ok: true };
      case 'legacy.migrate':
        return { ok: true, result: await migrateLegacyAnnotations(area, request.payload) };
      case 'page.open':
        openPage(request.page);
        return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
