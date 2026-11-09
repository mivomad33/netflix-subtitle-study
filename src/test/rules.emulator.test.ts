// 4.5-1, 4.5-2 보안 규칙. 에뮬레이터에 저장소의 firestore.rules를 올려 허용과 거부를 모두 본다.
// 저장소의 규칙 파일 그대로(Vite의 ?raw 가져오기).
import FIRESTORE_RULES from '../../firestore.rules?raw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { FIRESTORE_HOST, FIRESTORE_PORT, PROJECT_ID } from './emulator';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: FIRESTORE_RULES,
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = async (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

const book = (over: Record<string, unknown> = {}) => ({
  e: { m: { id: 'bk1', title: 'T', author: '', chapters: [], createdAt: 1, updatedAt: 1, ...over } },
});

describe('4.5-1 users read and write only their own area', () => {
  it('test project id is a demo project', () => {
    expect(PROJECT_ID.startsWith('demo-')).toBe(true);
  });

  it('allows the owner to read, write and delete kv and chapter documents', async () => {
    const db = as('abc');
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/memos-3'), { e: { m1: { note: 'x' } } }));
    await assertSucceeds(getDoc(doc(db, 'users/abc/kv/memos-3')));
    await assertSucceeds(getDocs(collection(db, 'users/abc/kv')));
    await assertSucceeds(setDoc(doc(db, 'users/abc/ch/x~0'), { t: '[]', i: 0, n: 1, v: 'v1' }));
    await assertSucceeds(getDocs(collection(db, 'users/abc/ch')));
    await assertSucceeds(deleteDoc(doc(db, 'users/abc/ch/x~0')));
    await assertSucceeds(deleteDoc(doc(db, 'users/abc/kv/memos-3')));
  });

  it('denies requests without login', async () => {
    await seed('users/abc/kv/positions', { e: {} });
    const db = anon();
    await assertFails(getDoc(doc(db, 'users/abc/kv/positions')));
    await assertFails(setDoc(doc(db, 'users/abc/kv/positions'), { e: {} }));
    await assertFails(getDocs(collection(db, 'users/abc/kv')));
  });

  it('denies another uid, including one that starts with the same letters', async () => {
    await seed('users/abcd/kv/positions', { e: { bk: 1 } });
    await seed('users/ab/kv/positions', { e: { bk: 1 } });
    const db = as('abc');
    for (const other of ['abcd', 'ab', 'xyz']) {
      await assertFails(getDoc(doc(db, `users/${other}/kv/positions`)));
      await assertFails(setDoc(doc(db, `users/${other}/kv/positions`), { e: {} }));
      await assertFails(deleteDoc(doc(db, `users/${other}/kv/positions`)));
      await assertFails(getDocs(collection(db, `users/${other}/kv`)));
      await assertFails(setDoc(doc(db, `users/${other}/ch/x~0`), { t: '', i: 0, n: 1, v: 'v' }));
    }
  });

  it('denies paths outside the user area', async () => {
    const db = as('abc');
    await assertFails(setDoc(doc(db, 'users/abc'), { e: {} }));
    await assertFails(getDoc(doc(db, 'users/abc')));
    await assertFails(setDoc(doc(db, 'users/abc/other/x'), { e: {} }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/x/deeper/y'), { e: {} }));
    await assertFails(setDoc(doc(db, 'public/x'), { e: {} }));
    await assertFails(getDocs(collection(db, 'users')));
  });

  it('denies unknown kv documents', async () => {
    const db = as('abc');
    await assertFails(setDoc(doc(db, 'users/abc/kv/whatever'), { e: {} }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/memos-32'), { e: {} }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/done-8'), { e: {} }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/nf-checklists'), { e: {} }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/nf-checklists-16'), { e: {} }));
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/nf-checklists-15'), { e: {} }));
  });
});

describe('4.5-2 size limits', () => {
  const entries = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 1]));

  it('limits the number of top-level fields', async () => {
    const db = as('abc');
    await assertFails(setDoc(doc(db, 'users/abc/kv/positions'), { e: {}, extra: 1 }));
    await assertFails(setDoc(doc(db, 'users/abc/ch/x~0'), { t: '', i: 0, n: 1, v: 'v', extra: 1 }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/settings'), { e: { reader: {}, other: {} } }));
  });

  it('limits map entries: just under passes, over fails', async () => {
    const db = as('abc');
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/memos-0'), { e: entries(5000) }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/memos-1'), { e: entries(5001) }));
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/nf-studied'), { e: entries(5000) }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/nf-studied'), { e: entries(5001) }));
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/settings'), { e: { reader: entries(20) } }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/settings'), { e: { reader: entries(21) } }));
  });

  it('limits list length: just under passes, over fails', async () => {
    const db = as('abc');
    const list = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/nf-unplaced'), { e: entries(5000) }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/nf-unplaced'), { e: entries(5001) }));
    await assertFails(setDoc(doc(db, 'users/abc/kv/nfu-v1'), { e: { ids: list(1) } }));
    const chapters = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, title: '', paragraphCount: 1 }));
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/book-bk1'), book({ chapters: chapters(3000) })));
    await assertFails(setDoc(doc(db, 'users/abc/kv/book-bk1'), book({ chapters: chapters(3001) })));
  });

  it('limits string length: just under passes, over fails', async () => {
    const db = as('abc');
    await assertSucceeds(setDoc(doc(db, 'users/abc/ch/x~0'), { t: 'a'.repeat(300000), i: 0, n: 1, v: 'v' }));
    await assertFails(setDoc(doc(db, 'users/abc/ch/x~0'), { t: 'a'.repeat(300001), i: 0, n: 1, v: 'v' }));
    await assertSucceeds(setDoc(doc(db, 'users/abc/kv/book-bk1'), book({ title: 'a'.repeat(2000) })));
    await assertFails(setDoc(doc(db, 'users/abc/kv/book-bk1'), book({ title: 'a'.repeat(2001) })));
  });

  it('checks chunk numbering', async () => {
    const db = as('abc');
    await assertFails(setDoc(doc(db, 'users/abc/ch/x~1'), { t: '', i: 1, n: 1, v: 'v' }));
    await assertFails(setDoc(doc(db, 'users/abc/ch/x~0'), { t: '', i: 0, n: 101, v: 'v' }));
    await assertFails(setDoc(doc(db, 'users/abc/ch/x~0'), { t: 1, i: 0, n: 1, v: 'v' }));
  });
});
