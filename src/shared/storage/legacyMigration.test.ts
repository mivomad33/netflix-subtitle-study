import { describe, it, expect } from 'vitest';
import { createMemoryArea, StorageArea } from './storageArea';
import { listMemos } from './repo';
import { migrateLegacyAnnotations, LegacyPayload } from './legacyMigration';

const legacy = (id: string, start = 5, end = 12, text = 'Good morning.') => ({
  id,
  sentenceStartMs: 1500,
  sentenceText: text,
  start,
  end,
  quote: text.slice(start, end),
  note: `note ${id}`,
  createdAt: 10,
  updatedAt: 20,
});

const studied = JSON.stringify({
  v1: { videoId: 'v1', title: 'Test Show', epTitle: 'Pilot', epSeq: 2, seasonSeq: 1 },
  v2: { videoId: 'v2', title: 'Test Movie', epTitle: '', epSeq: 1, seasonSeq: 1 },
});

const payload = (): LegacyPayload => ({
  annotations: {
    v1: JSON.stringify([legacy('a'), legacy('b', 0, 4)]),
    v2: JSON.stringify([legacy('c')]),
  },
  studiedVideos: studied,
});

describe('migrateLegacyAnnotations', () => {
  it('copies all legacy memos with video titles and marks completion', async () => {
    const area = createMemoryArea();
    const result = await migrateLegacyAnnotations(area, payload());
    expect(result).toEqual({ copied: 3, failedVideoIds: [], completed: true });

    const memos = await listMemos(area);
    expect(memos).toHaveLength(3);
    const a = memos.find((m) => m.id === 'a')!;
    expect(a).toMatchObject({
      kind: 'netflix',
      sourceId: 'v1',
      contextText: 'Good morning.',
      sentenceStartMs: 1500,
      quote: 'morning',
      note: 'note a',
      videoTitle: 'Test Show',
      seasonSeq: 1,
      episodeSeq: 2,
      episodeTitle: 'Pilot',
      createdAt: 10,
      updatedAt: 20,
    });
    const c = memos.find((m) => m.id === 'c')!;
    expect(c.videoTitle).toBe('Test Movie');
    expect(c.episodeTitle).toBeUndefined();
    expect(c.episodeSeq).toBeUndefined();
  });

  it('does not duplicate or overwrite memos when run again', async () => {
    const area = createMemoryArea();
    await migrateLegacyAnnotations(area, payload());
    const again = await migrateLegacyAnnotations(area, payload());
    expect(again.copied).toBe(0);
    expect(await listMemos(area)).toHaveLength(3);
  });

  it('keeps a memo edited after copying even if migration is retried', async () => {
    const area = createMemoryArea();
    const broken = { ...payload(), annotations: { ...payload().annotations, v3: '{oops' } };
    await migrateLegacyAnnotations(area, broken);
    await area.set({ 'memo:a': { ...(await area.get(['memo:a']))['memo:a'] as object, note: 'edited' } });
    await area.remove(['memo:c']); // 사용자가 지운 메모
    await migrateLegacyAnnotations(area, broken);
    const memos = await listMemos(area);
    expect(memos.find((m) => m.id === 'a')!.note).toBe('edited');
    expect(memos.find((m) => m.id === 'c')).toBeUndefined();
  });

  it('copies valid keys but does not mark completion when one key is broken', async () => {
    const area = createMemoryArea();
    const result = await migrateLegacyAnnotations(area, {
      annotations: { v1: '{not json', v2: JSON.stringify([legacy('c')]) },
      studiedVideos: null,
    });
    expect(result).toEqual({ copied: 1, failedVideoIds: ['v1'], completed: false });
    expect((await listMemos(area)).map((m) => m.id)).toEqual(['c']);
    const state = (await area.get(['meta:legacyMigration']))['meta:legacyMigration'] as any;
    expect(state.completedAt).toBeUndefined();
  });

  it('skips invalid items inside a valid key', async () => {
    const area = createMemoryArea();
    const result = await migrateLegacyAnnotations(area, {
      annotations: { v1: JSON.stringify([legacy('a'), { id: 'bad' }, legacy('x', 3, 99)]) },
      studiedVideos: null,
    });
    expect(result.copied).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('does not mark completion on a storage write error and retries next time', async () => {
    const real = createMemoryArea();
    let fail = true;
    const flaky: StorageArea = {
      ...real,
      async set(items) {
        if (fail && Object.keys(items).some((k) => k.startsWith('memo:'))) {
          throw new Error('quota');
        }
        return real.set(items);
      },
    };
    const first = await migrateLegacyAnnotations(flaky, payload());
    expect(first.completed).toBe(false);
    expect(await listMemos(real)).toHaveLength(0);

    fail = false;
    const second = await migrateLegacyAnnotations(flaky, payload());
    expect(second).toEqual({ copied: 3, failedVideoIds: [], completed: true });
  });

  it('does nothing after completion', async () => {
    const area = createMemoryArea();
    await migrateLegacyAnnotations(area, payload());
    const later = await migrateLegacyAnnotations(area, {
      annotations: { v9: JSON.stringify([legacy('z')]) },
      studiedVideos: null,
    });
    expect(later).toEqual({ copied: 0, failedVideoIds: [], completed: true });
    expect(await listMemos(area)).toHaveLength(3);
  });
});
