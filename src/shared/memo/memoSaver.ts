import { Memo } from './types';

// 메모 글을 고칠 때마다 저장하지 않고, 입력이 잠깐 멈추면 마지막 내용만 한 번 저장한다.
// Firestore의 하루 쓰기 한도(모든 사용자 합계)를 글자마다 쓰지 않게 하려는 것이다.
export const MEMO_SAVE_DELAY_MS = 400;

export interface MemoSaver {
  // 잠깐 기다렸다가 저장한다. 그 사이 같은 메모를 또 고치면 마지막 것만 저장한다.
  schedule(memo: Memo): void;
  // 바로 저장한다(새 메모 등). 같은 메모의 기다리던 저장은 버린다.
  now(memo: Memo): void;
  // 기다리던 저장을 모두 바로 한다(편집을 끝낼 때, 화면을 닫을 때).
  flush(): void;
  // 기다리던 저장을 버린다(메모를 지울 때).
  cancel(id: string): void;
  // 아직 저장하지 않은 메모. 다시 읽은 목록이 쓰던 글을 되돌리지 않게 쓴다.
  pending(): Map<string, Memo>;
}

export function createMemoSaver(write: (memo: Memo) => void, delayMs = MEMO_SAVE_DELAY_MS): MemoSaver {
  const waiting = new Map<string, { memo: Memo; timer: ReturnType<typeof setTimeout> }>();

  const drop = (id: string) => {
    const entry = waiting.get(id);
    if (!entry) return null;
    clearTimeout(entry.timer);
    waiting.delete(id);
    return entry.memo;
  };

  return {
    schedule(memo) {
      drop(memo.id);
      const timer = setTimeout(() => {
        waiting.delete(memo.id);
        write(memo);
      }, delayMs);
      waiting.set(memo.id, { memo, timer });
    },
    now(memo) {
      drop(memo.id);
      write(memo);
    },
    flush() {
      Array.from(waiting.keys()).forEach((id) => {
        const memo = drop(id);
        if (memo) write(memo);
      });
    },
    cancel(id) {
      drop(id);
    },
    pending: () => new Map(Array.from(waiting, ([id, { memo }]) => [id, memo])),
  };
}

// 다시 읽은 목록에 아직 저장하지 않은 메모를 덮어 둔다.
export function withPending(stored: Memo[], pending: Map<string, Memo>): Memo[] {
  if (pending.size === 0) return stored;
  const seen = new Set<string>();
  const merged = stored.map((m) => {
    seen.add(m.id);
    return pending.get(m.id) ?? m;
  });
  pending.forEach((m, id) => {
    if (!seen.has(id)) merged.push(m);
  });
  return merged;
}
