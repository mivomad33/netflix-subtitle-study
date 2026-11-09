// 백업 내보내기·가져오기를 Firestore 저장소로 확인한다(4.8-1, 4.8-2).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, clearFirestore, signedInClient } from '../../../test/emulator';
import { FirestoreArea, createFirestoreArea } from '../../../shared/storage/firestoreArea';
import { getChapterParagraphs, getMemo, putMemo, saveBook } from '../../../shared/storage/repo';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { KEY, NETFLIX_KEY } from '../../../shared/storage/keys';
import { DEFAULT_NETFLIX_SETTINGS } from '../../../shared/bridge/netflixRecords';
import { BACKUP_FORMAT, exportBackup, mergeBackup, parseBackup } from './backup';

const clients: TestClient[] = [];
const areas: FirestoreArea[] = [];
let n = 0;

async function open(limitBytes?: number) {
  const client = await signedInClient(`backup${n++}`);
  clients.push(client);
  const area = createFirestoreArea(client.db, client.uid, limitBytes ? { limitBytes } : {});
  areas.push(area);
  await area.ready();
  return area;
}

const studied = {
  videoId: 'v1',
  title: 'Garden Show',
  cover: '',
  epTitle: 'Pilot',
  epSeq: 1,
  seasonSeq: 1,
  totalPages: 3,
  updatedAt: 10,
};
const netflixRecords = {
  [NETFLIX_KEY.settings]: { ...DEFAULT_NETFLIX_SETTINGS, fontSize: 18 },
  [NETFLIX_KEY.checklist('v1')]: { currentActiveRound: 1, rounds: { '1': { '0': { '3': true } } } },
  [NETFLIX_KEY.itemsPerPage('v1')]: 30,
  [NETFLIX_KEY.studied('v1')]: studied,
};

beforeAll(async () => {
  await clearFirestore();
});

afterEach(() => {
  areas.splice(0).forEach((a) => a.close());
});

afterAll(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe('4.8-1 exporting from Firestore', () => {
  it('puts every kind of data written to Firestore into the file', async () => {
    const area = await open();
    await putMemo(area, bookMemo({ id: 'b1' }));
    await putMemo(area, netflixMemo({ id: 'n1' }));
    await saveBook(area, { id: 'bk1', title: 'One', author: 'A', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'Chapter 1', paragraphs: ['Rain tapped the glass.', 'The kettle sang.'] },
    ]);
    await area.set({
      [KEY.position('bk1')]: { bookId: 'bk1', chapterId: 'c1', paragraphIndex: 1, updatedAt: 2 },
      [KEY.completion('bk1', 'c1')]: { bookId: 'bk1', chapterId: 'c1', done: true, updatedAt: 3 },
      [KEY.readerSettings]: { fontSize: 20 },
      ...netflixRecords,
    });

    const file = JSON.parse((await exportBackup(area)).json);
    expect(Object.keys(file.data).sort()).toEqual(
      [
        KEY.memo('b1'),
        KEY.memo('n1'),
        KEY.book('bk1'),
        KEY.chapter('bk1', 'c1'),
        KEY.position('bk1'),
        KEY.completion('bk1', 'c1'),
        KEY.readerSettings,
        ...Object.keys(netflixRecords),
      ].sort()
    );
    expect(file.data[KEY.chapter('bk1', 'c1')]).toEqual(['Rain tapped the glass.', 'The kettle sang.']);
    expect(file.data).toMatchObject(netflixRecords);
  });
});

describe('4.8-2 importing into Firestore', () => {
  it('merges a version 1 file, keeping the newer memo on each side', async () => {
    const area = await open();
    await putMemo(area, bookMemo({ id: 'mine-newer', note: 'kept', updatedAt: 50 }));
    await putMemo(area, bookMemo({ id: 'file-newer', note: 'old', updatedAt: 5 }));
    const v1 = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-11-07T00:00:00.000Z',
      data: {
        [KEY.memo('mine-newer')]: bookMemo({ id: 'mine-newer', note: 'from file', updatedAt: 10 }),
        [KEY.memo('file-newer')]: bookMemo({ id: 'file-newer', note: 'from file', updatedAt: 60 }),
        [KEY.memo('only-file')]: netflixMemo({ id: 'only-file' }),
        [KEY.book('bk2')]: {
          id: 'bk2',
          title: 'Two',
          author: '',
          chapters: [{ id: 'c1', title: 'One', paragraphCount: 1 }],
          createdAt: 1,
          updatedAt: 1,
        },
        [KEY.chapter('bk2', 'c1')]: ['A robin hopped along the fence.'],
      },
    });
    const parsed = parseBackup(v1);
    if (!parsed.ok) throw new Error(parsed.error);
    await mergeBackup(area, parsed.backup);

    expect((await getMemo(area, 'mine-newer'))?.note).toBe('kept');
    expect((await getMemo(area, 'file-newer'))?.note).toBe('from file');
    expect(await getMemo(area, 'only-file')).not.toBeNull();
    expect(await getChapterParagraphs(area, 'bk2', 'c1')).toEqual(['A robin hopped along the fence.']);
  });

  it('refuses the whole file when the merge would pass the storage limit', async () => {
    const area = await open(64 * 1024);
    await putMemo(area, bookMemo({ id: 'existing' }));
    const big = 'x'.repeat(200 * 1024);
    const file = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: '',
      data: {
        [KEY.memo('small')]: bookMemo({ id: 'small' }),
        [KEY.book('bk3')]: {
          id: 'bk3',
          title: 'Big',
          author: '',
          chapters: [{ id: 'c1', title: 'One', paragraphCount: 1 }],
          createdAt: 1,
          updatedAt: 1,
        },
        [KEY.chapter('bk3', 'c1')]: [big],
      },
    });
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    await expect(mergeBackup(area, parsed.backup)).rejects.toMatchObject({ code: 'quota-exceeded' });
    expect(await getMemo(area, 'small')).toBeNull();
    expect(await area.getKeys()).toEqual([KEY.memo('existing')]);
  });
});
