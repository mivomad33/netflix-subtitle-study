import { Memo, isValidMemo } from '../../../shared/memo/types';
import { PREFIX } from '../../../shared/storage/keys';
import { StorageChanges } from '../../../shared/storage/storageArea';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 다른 탭·기기에서 바뀐 메모를 지금 목록에 반영한다(4.2-3). belongs가 거짓인 메모는 목록에서 뺀다.
// 고치는 중인 메모(keep)는 쓰던 글이 되돌아가지 않게 그대로 둔다.
export function applyMemoChanges(
  prev: Memo[],
  changes: StorageChanges,
  belongs: (memo: Memo) => boolean,
  keep: string | null
): Memo[] {
  let next = prev;
  Object.entries(changes).forEach(([key, change]) => {
    if (!key.startsWith(PREFIX.memo)) return;
    const id = key.slice(PREFIX.memo.length);
    if (id === keep) return;
    const value = change.newValue;
    const at = next.findIndex((m) => m.id === id);
    if (isValidMemo(value) && belongs(value)) {
      if (at >= 0 && same(next[at], value)) return;
      next = at >= 0 ? next.map((m, i) => (i === at ? value : m)) : [...next, value];
    } else if (at >= 0) {
      next = next.filter((_, i) => i !== at);
    }
  });
  return next;
}

// 바뀐 키 가운데 하나라도 이 접두어로 시작하는지.
export const touches = (changes: StorageChanges, prefixes: readonly string[]) =>
  Object.keys(changes).some((k) => prefixes.some((p) => k.startsWith(p)));
