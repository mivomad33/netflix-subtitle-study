import { Memo, isValidMemo } from '../memo/types';
import { KEY, isMemoKey } from './keys';
import { StorageArea } from './storageArea';

// 넷플릭스 localStorage에 있던 옛 메모(NF_annotations_{videoId})를 공통 저장소로 복사한다.
// 원본은 넷플릭스 쪽에 그대로 남는다. 이 함수는 원본을 지우지 않는다.

export interface LegacyPayload {
  // videoId → NF_annotations_{videoId}에 들어 있던 문자열 그대로
  annotations: Record<string, string>;
  // NF_studied_videos에 들어 있던 문자열 그대로(없으면 null)
  studiedVideos: string | null;
}

export interface MigrationResult {
  copied: number;
  failedVideoIds: string[];
  completed: boolean;
}

interface MigrationState {
  doneVideoIds: string[];
  completedAt?: number;
}

interface StudiedVideo {
  title?: unknown;
  epTitle?: unknown;
  epSeq?: unknown;
  seasonSeq?: unknown;
}

const parseStudiedVideos = (raw: string | null): Record<string, StudiedVideo> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const toMemo = (
  videoId: string,
  item: any,
  video: StudiedVideo | undefined
): Memo | null => {
  if (!item || typeof item !== 'object') return null;
  const memo: Memo = {
    id: item.id,
    kind: 'netflix',
    sourceId: videoId,
    contextText: item.sentenceText,
    start: item.start,
    end: item.end,
    quote: item.quote,
    note: typeof item.note === 'string' ? item.note : '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sentenceStartMs: item.sentenceStartMs,
  };
  if (video && typeof video.title === 'string' && video.title) {
    memo.videoTitle = video.title;
    if (typeof video.epTitle === 'string' && video.epTitle) {
      memo.episodeTitle = video.epTitle;
      if (typeof video.seasonSeq === 'number') memo.seasonSeq = video.seasonSeq;
      if (typeof video.epSeq === 'number') memo.episodeSeq = video.epSeq;
    }
  }
  return isValidMemo(memo) && memo.contextText.slice(memo.start, memo.end) === memo.quote
    ? memo
    : null;
};

export async function migrateLegacyAnnotations(
  area: StorageArea,
  payload: LegacyPayload
): Promise<MigrationResult> {
  const stored = (await area.get([KEY.legacyMigration]))[KEY.legacyMigration] as
    | MigrationState
    | undefined;
  const state: MigrationState = {
    doneVideoIds: Array.isArray(stored?.doneVideoIds) ? [...stored!.doneVideoIds] : [],
    completedAt: stored?.completedAt,
  };
  if (state.completedAt) return { copied: 0, failedVideoIds: [], completed: true };

  const studied = parseStudiedVideos(payload.studiedVideos);
  const existing = new Set((await area.getKeys()).filter(isMemoKey));
  const failedVideoIds: string[] = [];
  let copied = 0;

  for (const [videoId, raw] of Object.entries(payload.annotations)) {
    // 이미 옮긴 영상은 다시 옮기지 않는다. 사용자가 옮긴 뒤 지운 메모가 되살아나지 않게 하기 위해서다.
    if (state.doneVideoIds.includes(videoId)) continue;
    let items: unknown;
    try {
      items = JSON.parse(raw);
    } catch {
      failedVideoIds.push(videoId);
      continue;
    }
    if (!Array.isArray(items)) {
      failedVideoIds.push(videoId);
      continue;
    }
    const toWrite: Record<string, Memo> = {};
    items.forEach((item) => {
      const memo = toMemo(videoId, item, studied[videoId]);
      if (memo && !existing.has(KEY.memo(memo.id))) toWrite[KEY.memo(memo.id)] = memo;
    });
    try {
      if (Object.keys(toWrite).length > 0) await area.set(toWrite);
    } catch (e) {
      console.error('[NF-STUDY] Failed to copy legacy annotations for', videoId, e);
      failedVideoIds.push(videoId);
      continue;
    }
    copied += Object.keys(toWrite).length;
    Object.keys(toWrite).forEach((k) => existing.add(k));
    state.doneVideoIds.push(videoId);
  }

  const completed = failedVideoIds.length === 0;
  if (completed) state.completedAt = Date.now();
  await area.set({ [KEY.legacyMigration]: state });
  return { copied, failedVideoIds, completed };
}
