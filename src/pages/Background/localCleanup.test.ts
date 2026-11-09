import { describe, expect, it } from 'vitest';
import { CLEANUP_MARKER, cleanupOldLocalData } from './localCleanup';

function fakeLocal(initial: Record<string, unknown>) {
  const data = { ...initial };
  return {
    data,
    async get(keys: string[] | null) {
      if (keys === null) return { ...data };
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async remove(keys: string[]) {
      keys.forEach((k) => delete data[k]);
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

describe('4.7-1 removing old chrome.storage.local data', () => {
  it('removes the old study keys once, keeps other keys, and leaves a marker', async () => {
    const local = fakeLocal({
      'memo:m1': {},
      'book:bk1': {},
      'bookch:bk1:c1': ['x'],
      'pos:bk1': {},
      'done:bk1:c1': {},
      'reader:settings': {},
      'meta:legacyMigration': {},
      'meta:netflixUnplaced:v1': [],
      'firebase:authUser:x': { kept: true },
      other: 1,
    });
    expect(await cleanupOldLocalData(local, 42)).toBe(8);
    expect(local.data).toEqual({ 'firebase:authUser:x': { kept: true }, other: 1, [CLEANUP_MARKER]: 42 });

    // 표시가 있으면 다시 지우지 않는다.
    local.data['memo:new'] = {};
    expect(await cleanupOldLocalData(local, 43)).toBe(0);
    expect(local.data['memo:new']).toEqual({});
    expect(local.data[CLEANUP_MARKER]).toBe(42);
  });
});
