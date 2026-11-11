import { describe, it, expect } from 'vitest';
import {
  createMemoryArea,
  StorageArea,
} from '../../../shared/storage/storageArea';
import { KEY, NETFLIX_KEY } from '../../../shared/storage/keys';
import { DEFAULT_NETFLIX_SETTINGS } from '../../../shared/bridge/netflixRecords';
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
  [KEY.netflixUnplaced('v1')]: ['n1'],
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
    expect(parsed.data[KEY.netflixUnplaced('v1')]).toBeUndefined();
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
  delete data[KEY.netflixUnplaced('v1')];
  return data;
}

// 넷플릭스 학습 기록(백업 형식 2). 값은 직접 만든 가짜다.
const studiedV1 = {
  videoId: 'v1',
  title: 'Garden Show',
  cover: '',
  epTitle: 'Pilot',
  epSeq: 1,
  seasonSeq: 1,
  totalPages: 3,
  updatedAt: 10,
};
const netflixRecords = () => ({
  [NETFLIX_KEY.settings]: { ...DEFAULT_NETFLIX_SETTINGS, fontSize: 18 },
  [NETFLIX_KEY.checklist('v1')]: { currentActiveRound: 1, rounds: { '1': { '0': { '3': true, '4': false } } } },
  [NETFLIX_KEY.itemsPerPage('v1')]: 30,
  [NETFLIX_KEY.studied('v1')]: studiedV1,
});

describe('4.8-1 4.8-2 backup format 2 with Netflix records', () => {
  it('exports Netflix records but not the unplaced memo lists', async () => {
    const area = createMemoryArea({ ...seed(), ...netflixRecords() });
    const { json } = await exportBackup(area);
    const file = JSON.parse(json);
    expect(file.version).toBe(2);
    expect(file.data).toMatchObject(netflixRecords());
    expect(file.data[KEY.netflixUnplaced('v1')]).toBeUndefined();
    expect(parseBackup(json).ok).toBe(true);
  });

  it('still reads a version 1 file', () => {
    const v1 = JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '', data: seedWithoutLegacy() });
    expect(parseBackup(v1)).toMatchObject({ ok: true, counts: { books: 1, memos: 2 } });
  });

  it('rejects broken Netflix records', () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ [NETFLIX_KEY.settings]: { fontSize: 18 } }, /넷플릭스 설정/],
      [{ [NETFLIX_KEY.checklist('v1')]: [true] }, /체크리스트/],
      [{ [NETFLIX_KEY.itemsPerPage('v1')]: 0 }, /페이지당/],
      [{ [NETFLIX_KEY.studied('v2')]: studiedV1 }, /공부한 영상/],
    ];
    cases.forEach(([data, pattern]) => {
      const result = parseBackup(fileWith(data));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
    });
  });

  it('keeps current values without updatedAt and takes the newer studied video', async () => {
    const current = {
      [NETFLIX_KEY.settings]: { ...DEFAULT_NETFLIX_SETTINGS, fontSize: 22 },
      [NETFLIX_KEY.studied('v1')]: { ...studiedV1, totalPages: 1, updatedAt: 5 },
    };
    const area = createMemoryArea(current);
    const parsed = parseBackup(fileWith(netflixRecords()));
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);
    const after = await area.get(await area.getKeys());
    expect(after[NETFLIX_KEY.settings]).toEqual(current[NETFLIX_KEY.settings]);
    expect(after[NETFLIX_KEY.studied('v1')]).toEqual(studiedV1);
    expect(after[NETFLIX_KEY.checklist('v1')]).toEqual(netflixRecords()[NETFLIX_KEY.checklist('v1')]);
    expect(after[NETFLIX_KEY.itemsPerPage('v1')]).toBe(30);
  });
});

// 원서 고치기(명세서 book-edit 4.7-2)
describe('book-edit 4.7-2 backups around a chapter edit', () => {
  const CH1 = ['The lamp glowed over a quiet desk.', 'A cat slept beside teh warm window.'];
  const CH2 = ['Two begins with a walk by the river.'];
  const FIXED = ['A new first line.', CH1[0], 'A cat slept beside the warm window.'];

  const setup = async () => {
    const { saveBook, putMemo } = await import('../../../shared/storage/repo');
    const area = createMemoryArea();
    await saveBook(area, { id: 'bk1', title: 'Lamp', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'ch1', title: 'One', paragraphs: CH1 },
      { id: 'ch2', title: 'Two', paragraphs: CH2 },
    ]);
    const start = CH1[1].indexOf('teh warm');
    await putMemo(
      area,
      bookMemo({ id: 'm1', sourceId: 'bk1', chapterId: 'ch1', paragraphIndex: 1, contextText: CH1[1], start, end: start + 8, quote: 'teh warm' })
    );
    const river = CH2[0].indexOf('river');
    await putMemo(
      area,
      bookMemo({ id: 'm2', sourceId: 'bk1', chapterId: 'ch2', paragraphIndex: 0, contextText: CH2[0], start: river, end: river + 5, quote: 'river' })
    );
    return area;
  };
  const backupOf = async (area: StorageArea) => {
    const parsed = parseBackup((await exportBackup(area)).json);
    if (!parsed.ok) throw new Error('backup did not parse');
    return parsed.backup;
  };
  const attachedMemos = async (area: StorageArea) => {
    const { listMemos, getChapterParagraphs } = await import('../../../shared/storage/repo');
    const { isBookMemoAnchored } = await import('./bookMemos');
    const result: Record<string, boolean> = {};
    for (const m of await listMemos(area)) {
      result[m.id] = isBookMemoAnchored(m, await getChapterParagraphs(area, 'bk1', m.chapterId!));
    }
    return result;
  };

  it('a backup taken after the edit brings the edited body and attached memos into the earlier state', async () => {
    const { saveChapterBody } = await import('./bookEdit');
    const { getChapterParagraphs } = await import('../../../shared/storage/repo');
    const old = await setup();
    const edited = await setup();
    await saveChapterBody(edited, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: FIXED });
    const file = await backupOf(edited);
    expect(file.data[KEY.chapter('bk1', 'ch1')]).toEqual(FIXED);

    await mergeBackup(old, file);
    expect(await getChapterParagraphs(old, 'bk1', 'ch1')).toEqual(FIXED);
    expect(await attachedMemos(old)).toEqual({ m1: true, m2: true });
  });

  it('a backup taken before the edit leaves the edited body and memos as they are', async () => {
    const { saveChapterBody } = await import('./bookEdit');
    const { getChapterParagraphs } = await import('../../../shared/storage/repo');
    const area = await setup();
    const file = await backupOf(area);
    await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: FIXED });
    const before = JSON.stringify(await area.get(await area.getKeys()));

    await mergeBackup(area, file);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(FIXED);
    expect(await attachedMemos(area)).toEqual({ m1: true, m2: true });
    expect(JSON.stringify(await area.get(await area.getKeys()))).toBe(before);
  });

  it('an older backup does not bring a deleted chapter back into the chapter list', async () => {
    const { deleteChapter } = await import('./bookEdit');
    const { getBook, listMemos } = await import('../../../shared/storage/repo');
    const area = await setup();
    const file = await backupOf(area);
    await deleteChapter(area, (await getBook(area, 'bk1'))!, 'ch2', { deleteMemos: true });

    await mergeBackup(area, file);
    expect((await getBook(area, 'bk1'))!.chapters.map((c) => c.id)).toEqual(['ch1']);
    // 지운 장의 메모가 옛 백업에 있으면 떨어진 메모로 들어온다(받아들이는 동작).
    expect((await listMemos(area)).map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });
});
