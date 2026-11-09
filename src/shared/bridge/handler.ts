import {
  getMemo,
  deleteMemo,
  listMemosBySource,
  putMemo,
  setUnplacedNetflixMemos,
  getUnplacedNetflixMemoIds,
} from '../storage/repo';
import { StorageArea } from '../storage/storageArea';
import { NETFLIX_KEY, NETFLIX_PREFIX } from '../storage/keys';
import { StorageError, toStorageErrorCode } from '../storage/errors';
import { BridgeCall, BridgeResult, ExtensionPage } from './protocol';
import {
  StudiedVideoRecord,
  isValidChecklist,
  isValidItemsPerPage,
  isValidStudiedVideo,
  normalizeNetflixSettings,
} from './netflixRecords';

// 서비스 워커에서 넷플릭스 페이지의 요청을 처리한다. 넷플릭스 메모와 넷플릭스 학습 기록만 다룬다(4.3-1).
// 로그인했는지는 "됨/안 됨" 하나만 돌려주고, 오류는 종류 코드만 돌려준다(4.3-2).
export async function handleBridgeCall(
  area: StorageArea | null,
  call: BridgeCall,
  openPage: (page: ExtensionPage) => void
): Promise<BridgeResult> {
  try {
    if (call.op === 'auth.status') return { ok: true, result: { signedIn: area !== null } };
    if (call.op === 'page.open') {
      openPage(call.page);
      return { ok: true };
    }
    if (!area) throw new StorageError('signed-out');
    const one = async (key: string) => (await area.get([key]))[key];
    switch (call.op) {
      case 'memos.list':
        return { ok: true, result: await listMemosBySource(area, 'netflix', call.videoId) };
      case 'memos.put': {
        const existing = await getMemo(area, call.memo.id);
        if (existing && existing.kind !== 'netflix') return { ok: false, error: 'invalid' };
        await putMemo(area, call.memo);
        return { ok: true };
      }
      case 'memos.delete': {
        const existing = await getMemo(area, call.id);
        if (!existing) return { ok: true };
        if (existing.kind !== 'netflix') return { ok: false, error: 'invalid' };
        await deleteMemo(area, call.id);
        return { ok: true };
      }
      case 'memos.reportUnplaced': {
        // 패널을 열 때마다 오므로 바뀐 때만 쓴다(4.2-1, 4.2-7).
        const current = (await getUnplacedNetflixMemoIds(area, [call.videoId])).get(call.videoId);
        const next = new Set(call.ids);
        const unchanged = current
          ? current.size === next.size && Array.from(next).every((id) => current.has(id))
          : next.size === 0;
        if (!unchanged) await setUnplacedNetflixMemos(area, call.videoId, Array.from(next));
        return { ok: true };
      }
      case 'nfSettings.get': {
        const value = await one(NETFLIX_KEY.settings);
        return { ok: true, result: value === undefined ? null : normalizeNetflixSettings(value) };
      }
      case 'nfSettings.set':
        await area.set({ [NETFLIX_KEY.settings]: call.settings });
        return { ok: true };
      case 'checklist.get': {
        const value = await one(NETFLIX_KEY.checklist(call.videoId));
        return { ok: true, result: isValidChecklist(value) ? value : null };
      }
      case 'checklist.set':
        await area.set({ [NETFLIX_KEY.checklist(call.videoId)]: call.checklist });
        return { ok: true };
      case 'checklist.delete':
        await area.remove([NETFLIX_KEY.checklist(call.videoId)]);
        return { ok: true };
      case 'itemsPerPage.get': {
        const value = await one(NETFLIX_KEY.itemsPerPage(call.videoId));
        return { ok: true, result: isValidItemsPerPage(value) ? value : null };
      }
      case 'itemsPerPage.set':
        await area.set({ [NETFLIX_KEY.itemsPerPage(call.videoId)]: call.value });
        return { ok: true };
      case 'studied.list': {
        const keys = (await area.getKeys()).filter((k) => k.startsWith(NETFLIX_PREFIX.studied));
        const values = keys.length > 0 ? await area.get(keys) : {};
        return { ok: true, result: Object.values(values).filter(isValidStudiedVideo) };
      }
      case 'studied.put': {
        // 체크할 때마다 오므로, 시각만 조금 바뀐 같은 기록은 다시 쓰지 않는다(Firestore 하루 쓰기 한도).
        const key = NETFLIX_KEY.studied(call.video.videoId);
        const stored = await one(key);
        if (isValidStudiedVideo(stored) && sameStudiedVideo(stored, call.video)) return { ok: true };
        await area.set({ [key]: call.video });
        return { ok: true };
      }
      case 'studied.delete':
        await area.remove([NETFLIX_KEY.studied(call.videoId)]);
        return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: toStorageErrorCode(e) };
  }
  return { ok: false, error: 'invalid' };
}

// 공부한 시각을 다시 쓰지 않아도 되는 차이. 대시보드의 최근순은 이만큼 늦게 바뀔 수 있다.
export const STUDIED_REWRITE_AFTER_MS = 10 * 60_000;

const sameStudiedVideo = (a: StudiedVideoRecord, b: StudiedVideoRecord) => {
  const { updatedAt: at, ...restA } = a;
  const { updatedAt: bt, ...restB } = b;
  const keys = new Set([...Object.keys(restA), ...Object.keys(restB)]) as Set<keyof typeof restA>;
  return Array.from(keys).every((k) => restA[k] === restB[k]) && Math.abs(bt - at) < STUDIED_REWRITE_AFTER_MS;
};
