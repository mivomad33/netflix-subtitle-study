import { StorageArea } from '../../../shared/storage/storageArea';
import { StorageErrorCode, toStorageError } from '../../../shared/storage/errors';

// 저장소 호출이 실패하면 화면 위쪽 안내에 알린다(4.2-6). 실패는 그대로 다시 던져 부른 쪽의 처리도 유지한다.
export function reportingArea(area: StorageArea, onError: (code: StorageErrorCode) => void): StorageArea {
  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (e) {
        const error = toStorageError(e);
        onError(error.code);
        throw error;
      }
    };
  return {
    get: wrap((keys: string[]) => area.get(keys)),
    getKeys: wrap(() => area.getKeys()),
    set: wrap((items: Record<string, unknown>) => area.set(items)),
    remove: wrap((keys: string[]) => area.remove(keys)),
    onChanged: (listener) => area.onChanged(listener),
  };
}
