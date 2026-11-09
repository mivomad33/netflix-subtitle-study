// 탈퇴를 에뮬레이터로 확인한다(4.6-1, 4.6-2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteUser } from 'firebase/auth';
import { TestClient, clearAuth, clearFirestore, countDocs, listAuthUids, signedInClient } from '../../test/emulator';
import { FirestoreArea, createFirestoreArea } from '../../shared/storage/firestoreArea';
import { putMemo, saveBook } from '../../shared/storage/repo';
import { bookMemo, netflixMemo } from '../../shared/storage/testFixtures';
import { deleteAccount } from './account';

const clients: TestClient[] = [];
const areas: FirestoreArea[] = [];

async function userWithData(sub: string) {
  const client = await signedInClient(sub);
  clients.push(client);
  const area = createFirestoreArea(client.db, client.uid);
  areas.push(area);
  await area.ready();
  await putMemo(area, bookMemo({ id: `${sub}-b` }));
  await putMemo(area, netflixMemo({ id: `${sub}-n` }));
  await saveBook(area, { id: 'bk1', title: 'One', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'c1', title: 'Chapter 1', paragraphs: ['Rain tapped the glass.'] },
  ]);
  await area.set({ 'nf:itemsPerPage:v1': 20 });
  return { client, area };
}

const docCount = async (uid: string) => (await countDocs(`users/${uid}/kv`)) + (await countDocs(`users/${uid}/ch`));

const steps = (client: TestClient, area: FirestoreArea) => ({
  removeData: () => area.deleteAll(),
  removeUser: () => deleteUser(client.auth.currentUser!),
  reauthenticate: async () => {},
});

beforeAll(async () => {
  await clearFirestore();
  await clearAuth();
});

afterAll(async () => {
  areas.splice(0).forEach((a) => a.close());
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe('4.6-1 deleting an account', () => {
  it("removes all of that user's documents and the Auth user, and leaves other users alone", async () => {
    const a = await userWithData('leaver');
    const b = await userWithData('stayer');
    const bBefore = await docCount(b.client.uid);
    expect(await docCount(a.client.uid)).toBeGreaterThan(0);

    await deleteAccount(steps(a.client, a.area));

    expect(await docCount(a.client.uid)).toBe(0);
    const uids = await listAuthUids();
    expect(uids).not.toContain(a.client.uid);
    expect(uids).toContain(b.client.uid);
    expect(await docCount(b.client.uid)).toBe(bBefore);
  });
});

describe('4.6-2 finishing an interrupted deletion', () => {
  it('deletes the rest and the user when run again after a failure part way', async () => {
    const a = await userWithData('interrupted');
    const uid = a.client.uid;
    const before = await docCount(uid);
    // 메모 하나만 지운 뒤 연결이 끊긴 것처럼 실패시킨다.
    await expect(
      deleteAccount({
        ...steps(a.client, a.area),
        removeData: async () => {
          await a.area.remove(['memo:interrupted-b']);
          throw Object.assign(new Error('offline'), { code: 'unavailable' });
        },
      })
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(await docCount(uid)).toBeGreaterThan(0);
    expect(await docCount(uid)).toBeLessThanOrEqual(before);
    expect(await listAuthUids()).toContain(uid);

    await deleteAccount(steps(a.client, a.area));
    expect(await docCount(uid)).toBe(0);
    expect(await listAuthUids()).not.toContain(uid);
  });

  it('signs in again when a recent login is needed and removes what was written meanwhile', async () => {
    const a = await userWithData('stale-login');
    const uid = a.client.uid;
    let removeUserCalls = 0;
    let reauthenticated = false;
    await deleteAccount({
      removeData: () => a.area.deleteAll(),
      removeUser: async () => {
        removeUserCalls += 1;
        if (removeUserCalls === 1) throw Object.assign(new Error('recent'), { code: 'auth/requires-recent-login' });
        await deleteUser(a.client.auth.currentUser!);
      },
      reauthenticate: async () => {
        reauthenticated = true;
        // 다시 인증하는 사이 다른 기기에서 쓴 메모
        await putMemo(a.area, bookMemo({ id: 'written-meanwhile' }));
      },
    });
    expect(reauthenticated).toBe(true);
    expect(await docCount(uid)).toBe(0);
    expect(await listAuthUids()).not.toContain(uid);
  });
});
