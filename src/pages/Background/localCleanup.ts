// 4.7-1 업데이트한 확장 프로그램이 처음 돌 때, 예전에 chrome.storage.local에 두던 학습 데이터를 한 번 지운다.
// 지금은 모든 데이터를 Firestore에 둔다. 지운 표시를 남겨 다시 돌지 않게 한다.
export const OLD_LOCAL_PREFIXES = ['memo:', 'book:', 'bookch:', 'pos:', 'done:', 'meta:'];
export const OLD_LOCAL_KEYS = ['reader:settings'];
export const CLEANUP_MARKER = 'cleanup:localData:v1';

export interface LocalArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  remove(keys: string[]): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const isOldLocalKey = (key: string) =>
  OLD_LOCAL_KEYS.includes(key) || OLD_LOCAL_PREFIXES.some((p) => key.startsWith(p));

export async function cleanupOldLocalData(local: LocalArea, now = Date.now()): Promise<number> {
  const marker = await local.get([CLEANUP_MARKER]);
  if (marker[CLEANUP_MARKER]) return 0;
  const all = await local.get(null);
  const keys = Object.keys(all).filter(isOldLocalKey);
  if (keys.length > 0) await local.remove(keys);
  await local.set({ [CLEANUP_MARKER]: now });
  return keys.length;
}
