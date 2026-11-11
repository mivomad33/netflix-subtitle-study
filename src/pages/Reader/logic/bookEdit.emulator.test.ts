// 원서 고치기를 Firestore 저장소(에뮬레이터)로 확인한다(book-edit 4.3-9, 4.3-13, 4.6-3).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, clearFirestore, signedInClient } from '../../../test/emulator';
import { FirestoreArea, FirestoreAreaOptions, createFirestoreArea } from '../../../shared/storage/firestoreArea';
import { KEY } from '../../../shared/storage/keys';
import { getBook, getChapterParagraphs, listMemos, putMemo, saveBook } from '../../../shared/storage/repo';
import { StorageChanges } from '../../../shared/storage/storageArea';
import { bookMemo } from '../../../shared/storage/testFixtures';
import { saveChapterBody } from './bookEdit';
import { isBookMemoAnchored } from './bookMemos';

const clients: TestClient[] = [];
const areas: FirestoreArea[] = [];
let n = 0;

async function open(sub: string, options: FirestoreAreaOptions = {}) {
  const client = await signedInClient(sub);
  clients.push(client);
  const area = createFirestoreArea(client.db, client.uid, options);
  areas.push(area);
  await area.ready();
  return area;
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

// 직접 쓴 예시 글.
const CH1 = ['The lamp glowed over a quiet desk.', 'A cat slept beside teh warm window.', 'Rain tapped softly on the roof.'];
const FIXED = ['A new first line.', CH1[0], 'A cat slept beside the warm window.', CH1[2]];

const memoAt = (paragraphIndex: number, quote: string) => {
  const start = CH1[paragraphIndex].indexOf(quote);
  return bookMemo({
    id: `m-${paragraphIndex}`,
    sourceId: 'bk1',
    chapterId: 'ch1',
    paragraphIndex,
    contextText: CH1[paragraphIndex],
    start,
    end: start + quote.length,
    quote,
  });
};

async function seed(area: FirestoreArea) {
  await saveBook(area, { id: 'bk1', title: 'Lamp', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'ch1', title: 'One', paragraphs: CH1 },
    { id: 'ch2', title: 'Two', paragraphs: ['Two begins with a walk by the river.'] },
  ]);
  await putMemo(area, memoAt(1, 'teh warm'));
  await putMemo(area, memoAt(2, 'Rain'));
}

const attached = async (area: FirestoreArea) => {
  const body = await getChapterParagraphs(area, 'bk1', 'ch1');
  return (await listMemos(area)).map((m) => isBookMemoAnchored(m, body));
};

describe('book-edit 4.3-9 a chapter save is all or nothing on Firestore', () => {
  it('leaves the old body with attached memos after a failure, then saves on retry', async () => {
    const user = `edit${n++}`;
    let fail = false;
    const area = await open(user, {
      beforeKvCommit: () => {
        if (fail) throw new Error('injected failure');
      },
    });
    await seed(area);
    const before = await getBook(area, 'bk1');
    const input = { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: FIXED };

    fail = true;
    await expect(saveChapterBody(area, input)).rejects.toThrow();
    const afterFailure = await open(user);
    expect(await getChapterParagraphs(afterFailure, 'bk1', 'ch1')).toEqual(CH1);
    expect(await attached(afterFailure)).toEqual([true, true]);
    expect(await getBook(afterFailure, 'bk1')).toEqual(before);

    fail = false;
    await saveChapterBody(area, input);
    const afterRetry = await open(user);
    expect(await getChapterParagraphs(afterRetry, 'bk1', 'ch1')).toEqual(FIXED);
    expect(await attached(afterRetry)).toEqual([true, true]);
    expect((await getBook(afterRetry, 'bk1'))!.chapters[0]).toMatchObject({ paragraphCount: 4 });
  });
});

describe('book-edit 4.3-13 another client hears about a chapter edit', () => {
  it('gets the change within 10 seconds and then reads the new body', async () => {
    const user = `edit${n++}`;
    const writer = await open(user);
    await seed(writer);
    const reader = await open(user);
    expect(await getChapterParagraphs(reader, 'bk1', 'ch1')).toEqual(CH1);
    const heard = new Promise<StorageChanges>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no change within 10 seconds')), 10000);
      reader.onChanged((changes) => {
        if (!(KEY.book('bk1') in changes)) return;
        clearTimeout(timer);
        resolve(changes);
      });
    });
    await saveChapterBody(writer, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: FIXED });
    const changes = await heard;
    // 책 정보와 옮긴 메모가 같은 알림에 온다.
    expect(Object.keys(changes)).toEqual(expect.arrayContaining([KEY.book('bk1'), KEY.memo('m-1'), KEY.memo('m-2')]));
    expect(await getChapterParagraphs(reader, 'bk1', 'ch1')).toEqual(FIXED);
    expect(await attached(reader)).toEqual([true, true]);
  });
});

describe('book-edit 4.6-3 a save reads only the chapters it needs', () => {
  it('reads the edited chapter and the chapter of a re-attach candidate, not all twenty', async () => {
    const user = `edit${n++}`;
    const setup = await open(user);
    const chapters = Array.from({ length: 20 }, (_, i) => ({
      id: `ch${i + 1}`,
      title: `Chapter ${i + 1}`,
      paragraphs: [`Chapter ${i + 1} opens on a calm morning.`, `Chapter ${i + 1} ends at dusk.`],
    }));
    await saveBook(setup, { id: 'bk1', title: 'Twenty', author: '', createdAt: 1, updatedAt: 1 }, chapters);
    // 5장에 붙어 있는 메모. 같은 글의 문단을 2장에 붙여 넣으면 후보가 되지만, 5장에 붙어 있으므로 옮기지 않는다.
    const text = chapters[4].paragraphs[0];
    await putMemo(
      setup,
      bookMemo({ id: 'on-ch5', sourceId: 'bk1', chapterId: 'ch5', paragraphIndex: 0, contextText: text, start: 0, end: 7, quote: 'Chapter' })
    );

    // 캐시가 빈 새 클라이언트로 저장한다.
    const read: string[] = [];
    const area = await open(user, { onChunkRead: (docId, fromCache) => !fromCache && read.push(docId) });
    const original = chapters[1].paragraphs;
    await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch2', original, after: [...original, text] });

    const chaptersRead = new Set(read.map((id) => decodeURIComponent(id.split('~')[0])));
    expect(Array.from(chaptersRead).sort()).toEqual(['bk1:ch2', 'bk1:ch5']);
    expect(read.length).toBe(2);
    expect((await listMemos(area)).find((m) => m.id === 'on-ch5')).toMatchObject({ chapterId: 'ch5', paragraphIndex: 0 });
  });
});
