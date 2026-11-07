import { describe, it, expect } from 'vitest';
import {
  createMemoryArea,
  StorageArea,
} from '../../../shared/storage/storageArea';
import { KEY } from '../../../shared/storage/keys';
import { BookMeta } from '../../../shared/memo/types';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  exportBackup,
  mergeBackup,
  parseBackup,
} from './backup';

// 테스트용 가짜 책. 글은 직접 쓴 문장이다.
const book = (overrides: Partial<BookMeta> = {}): BookMeta => ({
  id: 'bk1',
  title: 'A Quiet Kitchen',
  author: 'Test Writer',
  chapters: [{ id: 'c1', title: 'One', paragraphCount: 2 }],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const seed = () => ({
  [KEY.book('bk1')]: book(),
  [KEY.chapter('bk1', 'c1')]: [
    'The kettle sang on the old stove.',
    'Rain tapped the glass.',
  ],
  [KEY.memo('b1')]: bookMemo(),
  [KEY.memo('n1')]: netflixMemo(),
  [KEY.position('bk1')]: {
    bookId: 'bk1',
    chapterId: 'c1',
    paragraphIndex: 1,
    updatedAt: 5,
  },
  [KEY.readerSettings]: { fontSize: 18 },
  [KEY.legacyMigration]: { done: true },
});

async function snapshot(area: StorageArea) {
  const keys = (await area.getKeys()).sort();
  const values = await area.get(keys);
  return JSON.stringify(keys.map((k) => [k, values[k]]));
}

const fileWith = (
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-11-07T00:00:00.000Z',
    data,
    ...extra,
  });

describe('exportBackup', () => {
  it('contains books, chapters, memos, positions, settings and version', async () => {
    const area = createMemoryArea(seed());
    const { json, counts } = await exportBackup(area);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.data[KEY.book('bk1')]).toEqual(book());
    expect(parsed.data[KEY.chapter('bk1', 'c1')]).toEqual([
      'The kettle sang on the old stove.',
      'Rain tapped the glass.',
    ]);
    expect(parsed.data[KEY.memo('b1')]).toEqual(bookMemo());
    expect(parsed.data[KEY.memo('n1')]).toEqual(netflixMemo());
    expect(parsed.data[KEY.position('bk1')].paragraphIndex).toBe(1);
    expect(parsed.data[KEY.readerSettings]).toEqual({ fontSize: 18 });
    expect(parsed.data[KEY.legacyMigration]).toBeUndefined();
    expect(counts).toEqual({ books: 1, memos: 2 });
  });

  it('names the file with the local date', async () => {
    const area = createMemoryArea(seed());
    // 지역 시각으로 3월 4일 23시 30분 — UTC로 바꾸면 날짜가 달라질 수 있는 시각
    const now = new Date(2026, 2, 4, 23, 30);
    const { filename } = await exportBackup(area, now);
    expect(filename).toMatch(/^nf-study-backup-\d{8}\.json$/);
    expect(filename).toBe('nf-study-backup-20260304.json');
  });

  it('exported file parses back as valid', async () => {
    const { json } = await exportBackup(createMemoryArea(seed()));
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.counts).toEqual({ books: 1, memos: 2 });
  });
});

describe('mergeBackup', () => {
  it('keeps all memos and takes the newer file content on overlap', async () => {
    const area = createMemoryArea({
      [KEY.memo('both')]: bookMemo({
        id: 'both',
        note: 'old note',
        updatedAt: 10,
      }),
      [KEY.memo('mine')]: bookMemo({ id: 'mine', note: 'only here' }),
    });
    const parsed = parseBackup(
      fileWith({
        [KEY.memo('both')]: bookMemo({
          id: 'both',
          note: 'new note',
          updatedAt: 20,
        }),
        [KEY.memo('theirs')]: netflixMemo({ id: 'theirs' }),
      })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await mergeBackup(area, parsed.backup);
    const all = await area.get([
      KEY.memo('both'),
      KEY.memo('mine'),
      KEY.memo('theirs'),
    ]);
    expect(Object.keys(all).sort()).toEqual(
      [KEY.memo('both'), KEY.memo('mine'), KEY.memo('theirs')].sort()
    );
    expect((all[KEY.memo('both')] as { note: string }).note).toBe('new note');
    expect((all[KEY.memo('mine')] as { note: string }).note).toBe('only here');
    expect(result).toEqual({ added: 1, updated: 1, kept: 0 });
  });

  it('keeps the current memo when it is newer', async () => {
    const area = createMemoryArea({
      [KEY.memo('both')]: bookMemo({
        id: 'both',
        note: 'current',
        updatedAt: 30,
      }),
    });
    const parsed = parseBackup(
      fileWith({
        [KEY.memo('both')]: bookMemo({
          id: 'both',
          note: 'file',
          updatedAt: 20,
        }),
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const result = await mergeBackup(area, parsed.backup);
    const got = (await area.get([KEY.memo('both')]))[KEY.memo('both')] as {
      note: string;
    };
    expect(got.note).toBe('current');
    expect(result).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it('replaces chapters only when the file book is newer', async () => {
    const area = createMemoryArea({
      [KEY.book('bk1')]: book({ updatedAt: 10 }),
      [KEY.chapter('bk1', 'c1')]: ['current text'],
      [KEY.book('bk2')]: book({ id: 'bk2', updatedAt: 50 }),
      [KEY.chapter('bk2', 'c1')]: ['current second'],
    });
    const parsed = parseBackup(
      fileWith({
        [KEY.book('bk1')]: book({ title: 'Newer', updatedAt: 20 }),
        [KEY.chapter('bk1', 'c1')]: ['file text'],
        [KEY.book('bk2')]: book({ id: 'bk2', title: 'Older', updatedAt: 40 }),
        [KEY.chapter('bk2', 'c1')]: ['file second'],
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);
    const got = await area.get([
      KEY.book('bk1'),
      KEY.chapter('bk1', 'c1'),
      KEY.book('bk2'),
      KEY.chapter('bk2', 'c1'),
    ]);
    expect((got[KEY.book('bk1')] as BookMeta).title).toBe('Newer');
    expect(got[KEY.chapter('bk1', 'c1')]).toEqual(['file text']);
    expect((got[KEY.book('bk2')] as BookMeta).title).toBe('A Quiet Kitchen');
    expect(got[KEY.chapter('bk2', 'c1')]).toEqual(['current second']);
  });

  it('takes the newer position and sets settings only when absent', async () => {
    const area = createMemoryArea({
      [KEY.position('bk1')]: {
        bookId: 'bk1',
        chapterId: 'c1',
        paragraphIndex: 3,
        updatedAt: 10,
      },
      [KEY.position('bk2')]: {
        bookId: 'bk2',
        chapterId: 'c1',
        paragraphIndex: 7,
        updatedAt: 90,
      },
      [KEY.readerSettings]: { fontSize: 20 },
    });
    const parsed = parseBackup(
      fileWith({
        [KEY.position('bk1')]: {
          bookId: 'bk1',
          chapterId: 'c1',
          paragraphIndex: 9,
          updatedAt: 20,
        },
        [KEY.position('bk2')]: {
          bookId: 'bk2',
          chapterId: 'c1',
          paragraphIndex: 1,
          updatedAt: 30,
        },
        [KEY.readerSettings]: { fontSize: 12 },
      })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);
    const got = await area.get([
      KEY.position('bk1'),
      KEY.position('bk2'),
      KEY.readerSettings,
    ]);
    expect(
      (got[KEY.position('bk1')] as { paragraphIndex: number }).paragraphIndex
    ).toBe(9);
    expect(
      (got[KEY.position('bk2')] as { paragraphIndex: number }).paragraphIndex
    ).toBe(7);
    expect(got[KEY.readerSettings]).toEqual({ fontSize: 20 });

    const empty = createMemoryArea();
    await mergeBackup(empty, parsed.backup);
    expect((await empty.get([KEY.readerSettings]))[KEY.readerSettings]).toEqual(
      { fontSize: 12 }
    );
  });
});

describe('parseBackup', () => {
  const invalid: Array<[string, string, RegExp]> = [
    ['not JSON', 'this is { not json', /JSON/],
    [
      'no version',
      JSON.stringify({ format: BACKUP_FORMAT, exportedAt: 'x', data: {} }),
      /버전/,
    ],
    [
      'unknown higher version',
      fileWith({}, { version: BACKUP_VERSION + 1 }),
      /새 버전/,
    ],
    [
      'memo missing a field',
      (() => {
        const { note, ...rest } = bookMemo({ id: 'broken' });
        void note;
        return fileWith({
          [KEY.memo('ok')]: bookMemo({ id: 'ok', note: 'would be added' }),
          [KEY.memo('broken')]: rest,
        });
      })(),
      /메모/,
    ],
  ];

  it.each(invalid)(
    'rejects %s and leaves storage unchanged',
    async (_name, text, pattern) => {
      const area = createMemoryArea(seed());
      const before = await snapshot(area);
      const result = parseBackup(text);
      expect(result.ok).toBe(false);
      if (result.ok) {
        await mergeBackup(area, result.backup);
      } else {
        expect(result.error).toMatch(pattern);
        expect(result.error).toMatch(/(니다|세요)\.?$/);
      }
      expect(await snapshot(area)).toBe(before);
    }
  );

  it('rejects other broken parts with a message', () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ 'other:key': 1 }, /알 수 없는/],
      [{ [KEY.book('bk1')]: { id: 'bk1' } }, /책/],
      [{ [KEY.chapter('bk1', 'c1')]: ['ok', 3] }, /본문/],
      [{ [KEY.position('bk1')]: { bookId: 'bk1' } }, /위치/],
      [{ [KEY.readerSettings]: { fontSize: 'big' } }, /설정/],
    ];
    cases.forEach(([data, pattern]) => {
      const result = parseBackup(fileWith(data));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
    });
    const wrongFormat = parseBackup(
      JSON.stringify({ format: 'other', version: 1, data: {} })
    );
    expect(wrongFormat.ok).toBe(false);
  });

  it('accepts a valid file', () => {
    const result = parseBackup(fileWith(seedWithoutLegacy()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.counts).toEqual({ books: 1, memos: 2 });
  });
});

function seedWithoutLegacy() {
  const data: Record<string, unknown> = seed();
  delete data[KEY.legacyMigration];
  return data;
}
