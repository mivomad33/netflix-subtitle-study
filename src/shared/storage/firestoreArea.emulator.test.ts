// Firestore 저장소를 에뮬레이터로 확인한다(4.2-1, 4.2-2, 4.2-3, 4.2-4, 4.2-7, 4.4-1).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { collection, getDocs } from 'firebase/firestore';
import { TestClient, clearFirestore, countDocs, signedInClient } from '../../test/emulator';
import { FirestoreArea, createFirestoreArea } from './firestoreArea';
import { defineRepoCases } from './repoCases';
import { defineStudyProgressCases } from './studyProgressCases';
import { StorageChanges } from './storageArea';
import {
  getChapterParagraphs,
  getMemo,
  getPosition,
  getReaderSettings,
  listBooks,
  listCompletions,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
  updateReaderSettings,
  deleteBook,
} from './repo';
import { bookMemo, netflixMemo } from './testFixtures';
import { KEY, NETFLIX_KEY } from './keys';
import { CHUNK_CHARS, USAGE_LIMIT_BYTES, docSize } from './firestoreLayout';

const clients: TestClient[] = [];
const areas: FirestoreArea[] = [];
let n = 0;

async function open(sub = `user${n++}`) {
  const client = await signedInClient(sub);
  clients.push(client);
  const area = createFirestoreArea(client.db, client.uid);
  areas.push(area);
  await area.ready();
  return { client, area };
}

beforeAll(async () => {
  await clearFirestore();
});

afterEach(() => {
  areas.splice(0).forEach((a) => a.close());
});

afterAll(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe('4.2-2 repository cases on Firestore', () => {
  const makeArea = async (initial: Record<string, unknown> = {}) => {
    const { area } = await open();
    if (Object.keys(initial).length > 0) await area.set(initial);
    return area;
  };
  defineRepoCases(makeArea);
  defineStudyProgressCases(makeArea);
});

describe('4.2-1 every kind is stored in Firestore and read back by a new client', () => {
  it('memos, books, chapters, positions, completions, reader and netflix records', async () => {
    const { area } = await open('same-user');
    await putMemo(area, netflixMemo({ id: 'n1' }));
    await putMemo(area, bookMemo({ id: 'b1' }));
    await saveBook(area, { id: 'bk1', title: 'One', author: 'A', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'Chapter 1', paragraphs: ['First.', 'Second.'] },
    ]);
    await setPosition(area, { bookId: 'bk1', chapterId: 'c1', paragraphIndex: 1, updatedAt: 2 });
    await setChapterDone(area, 'bk1', 'c1', true, 3);
    await updateReaderSettings(area, { fontSize: 20, rate: 1.5 });
    const netflix = {
      'nf:settings': { isAutoPause: true, fontSize: 18 },
      'nf:checklist:v1': [{ round: 1, items: [true, false] }],
      'nf:itemsPerPage:v1': 30,
      'nf:studied:v1': { videoId: 'v1', title: 'Show', totalPages: 3, updatedAt: 1 },
      [KEY.netflixUnplaced('v1')]: ['n9'],
    };
    await area.set(netflix);

    const other = await open('same-user');
    const b = other.area;
    expect(await getMemo(b, 'n1')).toEqual(netflixMemo({ id: 'n1' }));
    expect(await getMemo(b, 'b1')).toEqual(bookMemo({ id: 'b1' }));
    expect((await listBooks(b)).map((x) => x.id)).toEqual(['bk1']);
    expect(await getChapterParagraphs(b, 'bk1', 'c1')).toEqual(['First.', 'Second.']);
    expect(await getPosition(b, 'bk1')).toEqual({ bookId: 'bk1', chapterId: 'c1', paragraphIndex: 1, updatedAt: 2 });
    expect((await listCompletions(b, 'bk1')).map((c) => c.done)).toEqual([true]);
    expect(await getReaderSettings(b)).toEqual({ fontSize: 20, rate: 1.5 });
    expect(await b.get(Object.keys(netflix))).toEqual(netflix);
  });

  it('refuses keys that have no place in Firestore', async () => {
    const { area } = await open();
    await expect(area.set({ 'meta:legacyMigration': 1 })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('4.2-1 many Netflix checklists', () => {
  // 영상마다 체크리스트가 쌓여도 한 문서(1MiB 한도)에 몰려 쓰기가 막히지 않는다.
  it('stores checklists whose total is over 1MiB and reads them back', async () => {
    const { client, area } = await open();
    const checklist = (i: number) => ({
      currentActiveRound: 1,
      rounds: { '1': Object.fromEntries(Array.from({ length: 1000 }, (_, p) => [String(p), { '0': true, '1': true, '2': true, '3': true, '4': i % 2 === 0 }])) },
    });
    const ids = Array.from({ length: 80 }, (_, i) => `video${i}`);
    for (const [i, id] of ids.entries()) await area.set({ [NETFLIX_KEY.checklist(id)]: checklist(i) });
    const total = JSON.stringify(ids.map((_, i) => checklist(i))).length;
    expect(total).toBeGreaterThan(1024 * 1024);
    const back = await area.get(ids.map((id) => NETFLIX_KEY.checklist(id)));
    expect(Object.keys(back)).toHaveLength(ids.length);
    expect(back[NETFLIX_KEY.checklist('video79')]).toEqual(checklist(79));
    // 운영 Firestore는 1MiB 넘는 문서를 거부한다(에뮬레이터는 막지 않아 크기를 직접 잰다).
    const kvDocs = await getDocs(collection(client.db, 'users', client.uid, 'kv'));
    kvDocs.docs.forEach((d) => expect(docSize(client.uid, 'kv', d.id, d.data())).toBeLessThan(1024 * 1024));
  }, 60000);
});

describe('4.2-3 changes reach another open client within 10 seconds', () => {
  it('notifies the other client and the later write wins', async () => {
    const a = await open('shared');
    const b = await open('shared');
    const seen: StorageChanges[] = [];
    b.area.onChanged((c) => seen.push(c));
    const started = Date.now();
    await putMemo(a.area, bookMemo({ id: 'live', note: 'first' }));
    while (!seen.some((c) => KEY.memo('live') in c) && Date.now() - started < 10000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(Date.now() - started).toBeLessThan(10000);
    expect((await getMemo(b.area, 'live'))!.note).toBe('first');

    await putMemo(b.area, bookMemo({ id: 'live', note: 'from b', updatedAt: 5 }));
    await putMemo(a.area, bookMemo({ id: 'live', note: 'from a', updatedAt: 6 }));
    const deadline = Date.now() + 10000;
    while ((await getMemo(b.area, 'live'))!.note !== 'from a' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((await getMemo(b.area, 'live'))!.note).toBe('from a');
  });
});

describe('4.2-4 large chapters', () => {
  it('stores a chapter over 1.5MiB and reads it back; deleting the book removes every chunk', async () => {
    const { client, area } = await open();
    // 한글 문단(UTF-8 3바이트)으로 1.5MiB를 넘긴다.
    const paragraph = '가나다라마바사아자차카타파하 '.repeat(200);
    const paragraphs = Array.from({ length: 200 }, (_, i) => `${i} ${paragraph}`);
    expect(new TextEncoder().encode(JSON.stringify(paragraphs)).length).toBeGreaterThan(1.5 * 1024 * 1024);
    await saveBook(area, { id: 'big', title: 'Big', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'Long', paragraphs },
      { id: 'c2', title: 'Short', paragraphs: ['Tiny.'] },
    ]);
    const chunks = Math.ceil(JSON.stringify(paragraphs).length / CHUNK_CHARS);
    expect(chunks).toBeGreaterThan(1);
    expect(await countDocs(`users/${client.uid}/ch`)).toBe(chunks + 1);

    expect(await getChapterParagraphs(area, 'big', 'c1')).toEqual(paragraphs);

    await deleteBook(area, 'big');
    expect(await countDocs(`users/${client.uid}/ch`)).toBe(0);
    expect(await getChapterParagraphs(area, 'big', 'c1')).toEqual([]);
  });

  it('a new client of the same user reads the large chapter', async () => {
    const a = await open('big-reader');
    const paragraphs = Array.from({ length: 50 }, (_, i) => `${i} ${'word '.repeat(2000)}`);
    await saveBook(a.area, { id: 'bk', title: 'B', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'L', paragraphs },
    ]);
    const b = await open('big-reader');
    expect(await getChapterParagraphs(b.area, 'bk', 'c1')).toEqual(paragraphs);
  });
});

describe('4.4-1 per-user limit', () => {
  it('passes a write that ends just under the limit, refuses one over it, and allows writing again after deleting', async () => {
    const { area } = await open();
    const used = await area.usage();
    // 한도를 지금 쓴 양 + 작은 여유로 잡은 저장소로 본다(20MB를 실제로 채우지 않는다).
    const limited = createFirestoreArea((clients[clients.length - 1]).db, clients[clients.length - 1].uid, {
      limitBytes: used + 4000,
    });
    areas.push(limited);
    await limited.ready();
    await putMemo(limited, bookMemo({ id: 'm1', note: 'a'.repeat(1000) }));
    const afterFirst = await limited.usage();
    expect(afterFirst).toBeLessThanOrEqual(used + 4000);
    await expect(putMemo(limited, bookMemo({ id: 'm2', note: 'b'.repeat(4000) }))).rejects.toMatchObject({
      code: 'quota-exceeded',
    });
    await limited.remove([KEY.memo('m1')]);
    await putMemo(limited, bookMemo({ id: 'm2', note: 'b'.repeat(1000) }));
    expect((await getMemo(limited, 'm2'))!.note).toHaveLength(1000);
  });

  it('counts at least the Firestore storage size', async () => {
    const { area } = await open();
    await putMemo(area, bookMemo({ id: 'm1' }));
    await saveBook(area, { id: 'bk1', title: 'One', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'C', paragraphs: ['x'.repeat(5000)] },
    ]);
    const usage = await area.usage();
    // 본문 5000자 + 메모·책 정보. 실제 문자열 바이트보다 작게 세지 않는다.
    expect(usage).toBeGreaterThan(5000 + JSON.stringify(bookMemo()).length);
    expect(USAGE_LIMIT_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('4.2-7 reads only what a screen needs', () => {
  it('a fresh client reads the bundled kv documents once and one chapter without the others', async () => {
    const { client, area } = await open('perf-user');
    // 성능 시드 규모: 책 1권 30장, 메모 2000개.
    const chapters = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      title: `Chapter ${i}`,
      paragraphs: Array.from({ length: 40 }, (_, p) => `Paragraph ${p} of chapter ${i}. ${'text '.repeat(60)}`),
    }));
    await saveBook(area, { id: 'perf', title: 'Perf', author: '', createdAt: 1, updatedAt: 1 }, chapters);
    const memos: Record<string, unknown> = {};
    for (let i = 0; i < 2000; i++) {
      const m = bookMemo({ id: `m${i}`, sourceId: 'perf', chapterId: `c${i % 30}` });
      memos[KEY.memo(m.id)] = m;
    }
    await area.set(memos);

    const kvDocs = (await getDocs(collection(client.db, 'users', client.uid, 'kv'))).size;
    let serverDocs = -1;
    const fresh = await signedInClient('perf-user');
    clients.push(fresh);
    const chunkReads: string[] = [];
    const freshArea = createFirestoreArea(fresh.db, fresh.uid, {
      onChunkRead: (docId) => chunkReads.push(docId),
      onServerSnapshot: (s) => {
        serverDocs = s.docs.filter((d) => !d.metadata.fromCache).length;
      },
    });
    areas.push(freshArea);
    await freshArea.ready();
    expect(serverDocs).toBe(kvDocs);
    // 메모 2000개가 묶음 문서 32개 안에 있다.
    expect(kvDocs).toBeLessThanOrEqual(32 + 1 + 1 + 1);

    const before = await countDocs(`users/${fresh.uid}/ch`);
    expect(before).toBe(30);
    expect(await getChapterParagraphs(freshArea, 'perf', 'c3')).toEqual(chapters[3].paragraphs);
    expect(chunkReads).toEqual(['perf%3Ac3~0']);
    console.info(`[4.2-7] kv documents read on open: ${serverDocs}, chapter chunks read to open one chapter: 1`);
  });
});
