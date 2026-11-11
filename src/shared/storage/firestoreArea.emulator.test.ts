// Firestore 저장소를 에뮬레이터로 확인한다(4.2-1, 4.2-2, 4.2-3, 4.2-4, 4.2-7, 4.4-1).
// book-edit 명세의 4.3-9, 4.3-10, 4.2-5도 여기서 본다.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentReference, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { TestClient, clearFirestore, countDocs, signedInClient } from '../../test/emulator';
import { FirestoreArea, FirestoreAreaOptions, createFirestoreArea } from './firestoreArea';
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
import { CHUNK_CHARS, USAGE_LIMIT_BYTES, docSize, encodeId } from './firestoreLayout';

// 서버에서 문서 하나를 읽기 직전에 끼어드는 자리. 읽는 사이에 다른 쓰기가 끝난 상황을 만들 때만 쓴다.
const serverRead = vi.hoisted(() => ({ before: null as null | ((path: string) => Promise<void>) }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  const getDocFromServer = async (ref: DocumentReference) => {
    await serverRead.before?.(ref.path);
    return actual.getDocFromServer(ref);
  };
  return { ...actual, getDocFromServer };
});

const clients: TestClient[] = [];
const areas: FirestoreArea[] = [];
let n = 0;

async function open(sub = `user${n++}`, options: FirestoreAreaOptions = {}) {
  const client = await signedInClient(sub);
  clients.push(client);
  const area = createFirestoreArea(client.db, client.uid, options);
  areas.push(area);
  await area.ready();
  return { client, area };
}

beforeAll(async () => {
  await clearFirestore();
});

afterEach(() => {
  serverRead.before = null;
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

describe('4.2-7 unplaced memo lists', () => {
  // 영상마다 문서를 만들면 화면을 열 때 읽는 문서 수가 영상 수만큼 는다. 한 문서에 모은다.
  it('keeps the lists of many videos in one kv document', async () => {
    const { client, area } = await open('unplaced-user');
    await area.set({ [KEY.netflixUnplaced('v1')]: ['a'], [KEY.netflixUnplaced('v2')]: ['b', 'c'] });
    await area.set({ [KEY.netflixUnplaced('v/3')]: [] });
    const kvDocs = await getDocs(collection(client.db, 'users', client.uid, 'kv'));
    expect(kvDocs.docs.map((d) => d.id)).toEqual(['nf-unplaced']);
    const other = await open('unplaced-user');
    expect(await other.area.get([KEY.netflixUnplaced('v1'), KEY.netflixUnplaced('v2'), KEY.netflixUnplaced('v/3')])).toEqual({
      [KEY.netflixUnplaced('v1')]: ['a'],
      [KEY.netflixUnplaced('v2')]: ['b', 'c'],
      [KEY.netflixUnplaced('v/3')]: [],
    });
  });
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
    // 조각 문서 id는 "장~판~번호"다.
    expect(chunkReads).toHaveLength(1);
    expect(chunkReads[0]).toMatch(/^perf%3Ac3~[0-9a-z]+~0$/);
    console.info(`[4.2-7] kv documents read on open: ${serverDocs}, chapter chunks read to open one chapter: 1`);
  });
});

// 그 사용자의 본문 조각 문서 id 목록.
const chunkIds = async (client: TestClient) =>
  (await getDocs(collection(client.db, 'users', client.uid, 'ch'))).docs.map((d) => d.id).sort();

// 장 목록 문서(chsizes)에서 그 장의 항목.
const indexEntry = async (client: TestClient, bookId: string, chapterId: string) =>
  (await getDoc(doc(client.db, 'users', client.uid, 'kv', 'chsizes'))).data()?.e?.[encodeId(`${bookId}:${chapterId}`)];

describe('4.3-9 book-edit: a chapter save is never left half done', () => {
  it('a failure between the chunk write and the kv write leaves the old body, memos and book; saving again stores all of it', async () => {
    const sub = 'half-save';
    const oldBody = ['The kettle sang on the old stove.', 'Nobody heard it.'];
    const newBody = ['The kettle sang on the old stove.', 'Nobody heard it at all.', 'The cat slept on.'];
    const oldMemos = [
      bookMemo({ id: 'hs1', sourceId: 'hs', chapterId: 'c1', paragraphIndex: 0 }),
      bookMemo({ id: 'hs2', sourceId: 'hs', chapterId: 'c1', paragraphIndex: 1, contextText: oldBody[1], quote: 'heard', start: 7, end: 12 }),
    ];
    const newMemos = [
      { ...oldMemos[0], updatedAt: 9 },
      { ...oldMemos[1], contextText: newBody[1], updatedAt: 9 },
    ];
    const first = await open(sub);
    const oldBook = await saveBook(first.area, { id: 'hs', title: 'Half', author: 'A', createdAt: 1, updatedAt: 1 }, [
      { id: 'c1', title: 'One', paragraphs: oldBody },
    ]);
    for (const m of oldMemos) await putMemo(first.area, m);
    const newBook = { ...oldBook, updatedAt: 9, chapters: [{ ...oldBook.chapters[0], paragraphCount: 3, charCount: 999 }] };
    const edit = {
      [KEY.chapter('hs', 'c1')]: newBody,
      [KEY.book('hs')]: newBook,
      [KEY.memo('hs1')]: newMemos[0],
      [KEY.memo('hs2')]: newMemos[1],
    };
    expect(await chunkIds(first.client)).toHaveLength(1);
    const usedBefore = await first.area.usage();

    let fail = true;
    const writer = await open(sub, {
      beforeKvCommit: () => {
        if (fail) throw new Error('injected failure');
      },
    });
    await expect(writer.area.set(edit)).rejects.toThrow();

    // 실패 뒤 새 클라이언트: 고치기 전 본문·메모·책 정보가 오류 없이 읽힌다.
    const afterFailure = await open(sub);
    expect(await getChapterParagraphs(afterFailure.area, 'hs', 'c1')).toEqual(oldBody);
    expect(await getMemo(afterFailure.area, 'hs1')).toEqual(oldMemos[0]);
    expect(await getMemo(afterFailure.area, 'hs2')).toEqual(oldMemos[1]);
    expect((await listBooks(afterFailure.area))[0]).toEqual(oldBook);
    // 남은 새 조각도 저장량에 들어간다.
    expect(await afterFailure.area.usage()).toBeGreaterThan(usedBefore + JSON.stringify(newBody).length);

    // 같은 저장을 다시 하면 끝까지 저장된다.
    fail = false;
    await writer.area.set(edit);
    const afterRetry = await open(sub);
    expect(await getChapterParagraphs(afterRetry.area, 'hs', 'c1')).toEqual(newBody);
    expect(await getMemo(afterRetry.area, 'hs1')).toEqual(newMemos[0]);
    expect(await getMemo(afterRetry.area, 'hs2')).toEqual(newMemos[1]);
    expect((await listBooks(afterRetry.area))[0]).toEqual(newBook);
    // 실패한 저장이 남긴 조각과 옛 조각이 모두 지워졌다.
    expect(await chunkIds(afterRetry.client)).toHaveLength(1);
    expect(await countDocs(`users/${afterRetry.client.uid}/ch`)).toBe(1);
    expect(Object.keys(await indexEntry(afterRetry.client, 'hs', 'c1')).sort()).toEqual(['bytes', 'l', 'n', 'v']);
    expect(await afterRetry.area.usage()).toBeLessThan(usedBefore + 2 * JSON.stringify(newBody).length);
  });
});

describe('4.3-9 book-edit: chunks left by a failed save of another client', () => {
  it('are kept and counted while that save may still be running, and removed by a later save once they are old', async () => {
    const sub = 'left-chunks';
    const key = KEY.chapter('lc', 'c1');
    const first = await open(sub);
    await first.area.set({ [key]: ['A gull circled the pier.'] });
    const failing = await open(sub, {
      beforeKvCommit: () => {
        throw new Error('injected failure');
      },
    });
    await expect(failing.area.set({ [key]: ['A gull circled the pier twice.'] })).rejects.toThrow();

    // 다른 클라이언트는 그 조각을 쓰는 쪽이 아직 살아 있는지 모른다. 지우지 않고 저장량에 넣어 둔다.
    const second = await open(sub);
    await second.area.set({ [key]: ['Two gulls circled the pier.'] });
    expect(await chunkIds(second.client)).toHaveLength(2);
    expect((await indexEntry(second.client, 'lc', 'c1')).p).toHaveLength(1);
    const withLeftover = await (await open(sub)).area.usage();

    // 오래된 것으로 보면(기다리는 시간을 없앤 저장소) 다음 저장이 지운다.
    const later = await open(sub, { pendingGraceMs: -1 });
    await later.area.set({ [key]: ['Three gulls circled the pier.'] });
    expect(await chunkIds(later.client)).toHaveLength(1);
    expect((await indexEntry(later.client, 'lc', 'c1')).p).toBeUndefined();
    const reader = await open(sub);
    expect(await getChapterParagraphs(reader.area, 'lc', 'c1')).toEqual(['Three gulls circled the pier.']);
    expect(await reader.area.usage()).toBeLessThan(withLeftover);
  });
});

describe('4.3-10 book-edit: reading a chapter while it is rewritten', () => {
  it('another client always reads the whole old body or the whole new body, without an error', async () => {
    const sub = 'rewrite-read';
    const key = KEY.chapter('rw', 'c1');
    const body = (round: number) =>
      Array.from({ length: 30 }, (_, i) => `Round ${round}, paragraph ${i}. ${'The lamp flickered twice. '.repeat(1000)}`);
    const bodies = Array.from({ length: 6 }, (_, round) => body(round));
    const texts = bodies.map((b) => JSON.stringify(b));
    expect(Math.ceil(texts[0].length / CHUNK_CHARS)).toBeGreaterThan(2);

    const a = await open(sub);
    await a.area.set({ [key]: bodies[0] });
    const b = await open(sub);

    // 회차마다 쓰기가 끝날 때까지 읽기를 되풀이한다(쓰는 동안 적어도 한 번 읽는다).
    // 읽은 값은 그때까지 쓴 본문 가운데 하나의 전체여야 한다. 읽는 쪽의 목록이 조금 늦게 따라오므로 바로 앞 회차보다 더 옛 본문일 수는 있다.
    const reads: { round: number; got: number }[] = [];
    for (let round = 1; round < bodies.length; round++) {
      let writing = true;
      const write = a.area.set({ [key]: bodies[round] }).finally(() => {
        writing = false;
      });
      do {
        const got = await b.area.get([key]);
        reads.push({ round, got: texts.indexOf(JSON.stringify(got[key])) });
        // 캐시에서만 읽으면 이 반복이 네트워크 응답을 처리할 틈을 주지 않으므로 한 번 양보한다.
        await new Promise((r) => setTimeout(r, 0));
      } while (writing);
      await write;
    }
    reads.forEach((r) => {
      expect(r.got).toBeGreaterThanOrEqual(0);
      expect(r.got).toBeLessThanOrEqual(r.round);
    });
    const fresh = await open(sub);
    expect(await fresh.area.get([key])).toEqual({ [key]: bodies[bodies.length - 1] });
    expect(await countDocs(`users/${fresh.client.uid}/ch`)).toBe(Math.ceil(texts[texts.length - 1].length / CHUNK_CHARS));
  }, 120000);
});

describe('4.3-10 book-edit: a rewrite that finishes between reading the chapter list and reading the chunks', () => {
  const key = KEY.chapter('rr', 'c1');
  const body = (word: string) => [`${word} `.repeat(Math.ceil((CHUNK_CHARS + 1000) / (word.length + 1))), `${word} ends here.`];

  // 읽는 쪽이 목록을 본 뒤 첫 조각을 서버에서 읽기 직전에 change를 끝까지 실행한다.
  const readDuring = async (sub: string, change: (writer: FirestoreArea) => Promise<void>) => {
    const writer = await open(sub);
    await writer.area.set({ [key]: body('Willow') });
    const reader = await open(sub);
    let changed = false;
    serverRead.before = async (path) => {
      if (changed || !path.includes('/ch/')) return;
      changed = true;
      await change(writer.area);
    };
    const got = await reader.area.get([key]);
    expect(changed).toBe(true);
    return got;
  };

  it('reads the new body after the old chunks were deleted', async () => {
    const got = await readDuring('reread-new', (writer) => writer.set({ [key]: body('Poplar') }));
    expect(got).toEqual({ [key]: body('Poplar') });
  });

  it('reads nothing, without an error, when the chapter was deleted', async () => {
    const got = await readDuring('reread-gone', (writer) => writer.remove([key]));
    expect(got).toEqual({});
  });
});

describe('4.3-9 book-edit: chapters stored in the earlier chunk layout', () => {
  it('reads a chapter whose chunks are named "chapter~number", and rewriting it removes those documents', async () => {
    const client = await signedInClient('legacy-layout');
    clients.push(client);
    const id = encodeId('lg:c1');
    const oldBody = ['A heron stood in the shallow water.', 'It did not move for an hour.'];
    const text = JSON.stringify(oldBody);
    const parts = [text.slice(0, 20), text.slice(20)];
    for (const [i, t] of parts.entries()) {
      await setDoc(doc(client.db, 'users', client.uid, 'ch', `${id}~${i}`), { t, i, n: parts.length, v: 'legacy1' });
    }
    await setDoc(doc(client.db, 'users', client.uid, 'kv', 'chsizes'), {
      e: { [id]: { n: parts.length, v: 'legacy1', bytes: 600 } },
    });
    const area = createFirestoreArea(client.db, client.uid);
    areas.push(area);
    await area.ready();
    expect(await getChapterParagraphs(area, 'lg', 'c1')).toEqual(oldBody);

    const newBody = ['A heron stood in the shallow water.', 'It did not move for two hours.'];
    await area.set({ [KEY.chapter('lg', 'c1')]: newBody });
    const ids = await chunkIds(client);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(new RegExp(`^${id}~[0-9a-z]+~0$`));
    const other = await open('legacy-layout');
    expect(await getChapterParagraphs(other.area, 'lg', 'c1')).toEqual(newBody);
  });
});

describe('4.2-5 book-edit: deleting one chapter', () => {
  it('removes every chunk of that chapter, also those a failed save left, and keeps other chapters and the same chapter id of another book', async () => {
    const sub = 'delete-chapter';
    let fail = false;
    const { client, area } = await open(sub, {
      beforeKvCommit: () => {
        if (fail) throw new Error('injected failure');
      },
    });
    const long = (word: string) => [`${word} `.repeat(Math.ceil((CHUNK_CHARS + 1000) / (word.length + 1)))];
    const chapters = (word: string) => [
      { id: 'ch1', title: 'One', paragraphs: [`${word} opens the first chapter.`] },
      { id: 'ch2', title: 'Two', paragraphs: long(word) },
    ];
    await saveBook(area, { id: 'bkA', title: 'A', author: '', createdAt: 1, updatedAt: 1 }, chapters('Maple'));
    await saveBook(area, { id: 'bkB', title: 'B', author: '', createdAt: 1, updatedAt: 1 }, chapters('Cedar'));
    // 실패한 저장이 bkA의 ch2에 조각을 남긴다.
    fail = true;
    await expect(area.set({ [KEY.chapter('bkA', 'ch2')]: long('Birch') })).rejects.toThrow();
    fail = false;
    const of = (ids: string[], bookId: string, chapterId: string) =>
      ids.filter((x) => x.startsWith(`${encodeId(`${bookId}:${chapterId}`)}~`));
    const before = await chunkIds(client);
    expect(of(before, 'bkA', 'ch2')).toHaveLength(4);
    expect(before).toHaveLength(8);

    await area.remove([KEY.chapter('bkA', 'ch2')]);

    const after = await chunkIds(client);
    expect(of(after, 'bkA', 'ch2')).toHaveLength(0);
    expect(of(after, 'bkA', 'ch1')).toHaveLength(1);
    expect(of(after, 'bkB', 'ch1')).toHaveLength(1);
    expect(of(after, 'bkB', 'ch2')).toHaveLength(2);
    expect(await indexEntry(client, 'bkA', 'ch2')).toBeUndefined();
    const other = await open(sub);
    expect(await other.area.get([KEY.chapter('bkA', 'ch2')])).toEqual({});
    expect(await getChapterParagraphs(other.area, 'bkA', 'ch1')).toEqual(chapters('Maple')[0].paragraphs);
    expect(await getChapterParagraphs(other.area, 'bkB', 'ch1')).toEqual(chapters('Cedar')[0].paragraphs);
    expect(await getChapterParagraphs(other.area, 'bkB', 'ch2')).toEqual(long('Cedar'));
  });
});
