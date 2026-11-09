// Firestore를 쓰는 공통 저장소(StorageArea) 구현. 서비스 워커와 에뮬레이터 통합 테스트에서 쓴다.
// kv 컬렉션 전체를 한 번 구독해 거울을 두고(작은 데이터), 장 본문은 열 때만 읽는다(4.2-7).
import {
  Firestore,
  FieldPath,
  QuerySnapshot,
  WriteBatch,
  collection,
  deleteField,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { StorageArea, StorageChanges } from './storageArea';
import { StorageError, toStorageError } from './errors';
import {
  CH,
  CHAPTER_INDEX_DOC,
  ChapterIndexEntry,
  KV,
  MAX_CHUNKS,
  USAGE_LIMIT_BYTES,
  chapterKeyOf,
  chunkDocId,
  docSize,
  keyOf,
  locate,
  splitChunks,
} from './firestoreLayout';

export interface FirestoreArea extends StorageArea {
  // 서버에서 첫 스냅샷을 받을 때까지 기다린다.
  ready(): Promise<void>;
  // 지금 저장량(바이트, 실제 Firestore 저장 크기보다 작게 세지 않는다).
  usage(): Promise<number>;
  // 그 사용자의 문서를 모두 지운다. 중간에 끊겨도 다시 부르면 남은 것을 지운다(4.6-2).
  deleteAll(): Promise<void>;
  close(): void;
}

export interface FirestoreAreaOptions {
  limitBytes?: number;
  readyTimeoutMs?: number;
  writeTimeoutMs?: number;
  // 테스트에서 첫 스냅샷의 서버 문서 수를 셀 때 쓴다.
  onServerSnapshot?: (snapshot: QuerySnapshot) => void;
  // 테스트에서 본문 조각을 어디서 읽었는지 볼 때 쓴다.
  onChunkRead?: (docId: string, fromCache: boolean) => void;
}

type Entries = Record<string, unknown>;

const MAX_BATCH_OPS = 400;
const MAX_BATCH_BYTES = 6 * 1024 * 1024;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorageError('unavailable')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export function createFirestoreArea(db: Firestore, uid: string, options: FirestoreAreaOptions = {}): FirestoreArea {
  const limit = options.limitBytes ?? USAGE_LIMIT_BYTES;
  const readyTimeout = options.readyTimeoutMs ?? 15000;
  const writeTimeout = options.writeTimeoutMs ?? 20000;
  const kvRef = collection(db, 'users', uid, KV);
  const chRef = collection(db, 'users', uid, CH);

  const docs = new Map<string, Entries>();
  const sizes = new Map<string, number>();
  const values = new Map<string, unknown>();
  const listeners = new Set<(changes: StorageChanges) => void>();
  let failure: StorageError | null = null;
  let resolveReady: () => void = () => {};
  let rejectReady: (e: unknown) => void = () => {};
  const readyPromise = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  readyPromise.catch(() => {});
  let isReady = false;

  const index = (): Record<string, ChapterIndexEntry> =>
    (docs.get(CHAPTER_INDEX_DOC) as Record<string, ChapterIndexEntry> | undefined) ?? {};

  const applyDoc = (docId: string, entries: Entries | null, changes: StorageChanges) => {
    const before = docs.get(docId) ?? {};
    const after = entries ?? {};
    if (entries) {
      docs.set(docId, after);
      sizes.set(docId, docSize(uid, KV, docId, { e: after }));
    } else {
      docs.delete(docId);
      sizes.delete(docId);
    }
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    fields.forEach((field) => {
      const key = keyOf(docId, field);
      if (!key) return;
      const oldValue = before[field];
      const newValue = after[field];
      if (same(oldValue, newValue)) return;
      if (newValue === undefined) values.delete(key);
      else values.set(key, newValue);
      changes[key] = { oldValue: clone(oldValue), newValue: clone(newValue) };
    });
  };

  const unsubscribe = onSnapshot(
    kvRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      const changes: StorageChanges = {};
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const entries = data && typeof data.e === 'object' && data.e ? (data.e as Entries) : {};
        applyDoc(change.doc.id, change.type === 'removed' ? null : entries, changes);
      });
      if (!snapshot.metadata.fromCache && !isReady) {
        isReady = true;
        options.onServerSnapshot?.(snapshot);
        resolveReady();
      }
      if (Object.keys(changes).length > 0) listeners.forEach((l) => l(changes));
    },
    (e) => {
      failure = toStorageError(e);
      rejectReady(failure);
    }
  );

  const ready = async () => {
    if (failure) throw failure;
    try {
      await withTimeout(readyPromise, readyTimeout);
    } catch (e) {
      throw toStorageError(e);
    }
  };

  const readChunk = async (id: string, i: number, version: string) => {
    const ref = doc(chRef, chunkDocId(id, i));
    try {
      const cached = await getDocFromCache(ref);
      if (cached.exists() && cached.get('v') === version) {
        options.onChunkRead?.(ref.id, true);
        return cached.get('t') as string;
      }
    } catch {
      // 캐시에 없으면 서버에서 읽는다.
    }
    const fresh = await withTimeout(getDocFromServer(ref), writeTimeout);
    options.onChunkRead?.(ref.id, false);
    if (!fresh.exists() || fresh.get('v') !== version) throw new StorageError('unavailable');
    return fresh.get('t') as string;
  };

  const readChapter = async (id: string) => {
    const entry = index()[id];
    if (!entry) return undefined;
    const parts = await Promise.all(Array.from({ length: entry.n }, (_, i) => readChunk(id, i, entry.v)));
    try {
      return JSON.parse(parts.join(''));
    } catch {
      return undefined;
    }
  };

  // 쓰기를 문서 단위로 모은다. value가 undefined면 지운다.
  interface Plan {
    kv: Map<string, Map<string, unknown>>;
    chapters: Map<string, { chunks: string[] | null; version: string }>;
  }

  const plan = (items: Record<string, unknown>): Plan => {
    const p: Plan = { kv: new Map(), chapters: new Map() };
    Object.entries(items).forEach(([key, value]) => {
      const loc = locate(key);
      if (!loc) throw new StorageError('invalid');
      if (loc.kind === 'chapter') {
        const version = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const chunks = value === undefined ? null : splitChunks(JSON.stringify(value));
        if (chunks && chunks.length > MAX_CHUNKS) throw new StorageError('invalid');
        p.chapters.set(loc.id, { chunks, version });
        return;
      }
      if (!p.kv.has(loc.docId)) p.kv.set(loc.docId, new Map());
      p.kv.get(loc.docId)!.set(loc.field, value === undefined ? undefined : clone(value));
    });
    if (p.chapters.size > 0) {
      const idx = p.kv.get(CHAPTER_INDEX_DOC) ?? new Map<string, unknown>();
      p.chapters.forEach(({ chunks, version }, id) => {
        idx.set(
          id,
          chunks
            ? ({
                n: chunks.length,
                v: version,
                bytes: chunks.reduce((n, t, i) => n + docSize(uid, CH, chunkDocId(id, i), { t, i, n: chunks.length, v: version }), 0),
              } as ChapterIndexEntry)
            : undefined
        );
      });
      p.kv.set(CHAPTER_INDEX_DOC, idx);
    }
    return p;
  };

  const nextEntries = (docId: string, fields: Map<string, unknown>) => {
    const next: Entries = { ...(docs.get(docId) ?? {}) };
    fields.forEach((v, f) => {
      if (v === undefined) delete next[f];
      else next[f] = v;
    });
    return next;
  };

  const currentUsage = () => {
    let total = 0;
    sizes.forEach((s) => (total += s));
    Object.values(index()).forEach((e) => (total += e?.bytes ?? 0));
    return total;
  };

  const projectedUsage = (p: Plan) => {
    let total = currentUsage();
    const idxBefore = index();
    p.kv.forEach((fields, docId) => {
      const next = nextEntries(docId, fields);
      total -= sizes.get(docId) ?? 0;
      if (Object.keys(next).length > 0) total += docSize(uid, KV, docId, { e: next });
    });
    p.chapters.forEach((_, id) => {
      total -= idxBefore[id]?.bytes ?? 0;
    });
    const idxAfter = p.kv.get(CHAPTER_INDEX_DOC);
    idxAfter?.forEach((entry) => {
      total += (entry as ChapterIndexEntry | undefined)?.bytes ?? 0;
    });
    return total;
  };

  const commitAll = async (fill: (add: (op: (b: WriteBatch) => void, bytes: number) => void) => void) => {
    const batches: { ops: ((b: WriteBatch) => void)[]; bytes: number }[] = [{ ops: [], bytes: 0 }];
    fill((op, bytes) => {
      let last = batches[batches.length - 1];
      if (last.ops.length >= MAX_BATCH_OPS || (last.ops.length > 0 && last.bytes + bytes > MAX_BATCH_BYTES)) {
        last = { ops: [], bytes: 0 };
        batches.push(last);
      }
      last.ops.push(op);
      last.bytes += bytes;
    });
    for (const b of batches) {
      if (b.ops.length === 0) continue;
      const batch = writeBatch(db);
      b.ops.forEach((op) => op(batch));
      await withTimeout(batch.commit(), writeTimeout);
    }
  };

  const write = async (items: Record<string, unknown>) => {
    await ready();
    const p = plan(items);
    if (p.kv.size === 0) return;
    if (projectedUsage(p) > limit && projectedUsage(p) > currentUsage()) throw new StorageError('quota-exceeded');
    const idxBefore = index();
    try {
      // 본문 조각을 먼저 쓰고 목록 문서(chsizes)를 나중에 써서, 읽는 쪽이 반쪽 본문을 보지 않게 한다.
      await commitAll((add) => {
        p.chapters.forEach(({ chunks, version }, id) => {
          const oldCount = idxBefore[id]?.n ?? 0;
          (chunks ?? []).forEach((t, i) => {
            const data = { t, i, n: chunks!.length, v: version };
            add((b) => b.set(doc(chRef, chunkDocId(id, i)), data), t.length * 3 + 200);
          });
          for (let i = chunks?.length ?? 0; i < oldCount; i++) {
            if (chunks) add((b) => b.delete(doc(chRef, chunkDocId(id, i))), 100);
          }
        });
      });
      await commitAll((add) => {
        p.kv.forEach((fields, docId) => {
          const next = nextEntries(docId, fields);
          const ref = doc(kvRef, docId);
          if (Object.keys(next).length === 0) {
            add((b) => b.delete(ref), 100);
            return;
          }
          const data: Entries = {};
          const paths: FieldPath[] = [];
          fields.forEach((v, f) => {
            data[f] = v === undefined ? deleteField() : v;
            paths.push(new FieldPath('e', f));
          });
          add((b) => b.set(ref, { e: data }, { mergeFields: paths }), JSON.stringify(data).length * 3 + 200);
        });
      });
      // 지운 장의 조각은 목록에서 뺀 뒤에 지운다.
      await commitAll((add) => {
        p.chapters.forEach(({ chunks }, id) => {
          if (chunks) return;
          for (let i = 0; i < (idxBefore[id]?.n ?? 0); i++) add((b) => b.delete(doc(chRef, chunkDocId(id, i))), 100);
        });
      });
    } catch (e) {
      throw toStorageError(e);
    }
  };

  return {
    async get(keys) {
      await ready();
      const result: Record<string, unknown> = {};
      await Promise.all(
        keys.map(async (key) => {
          const loc = locate(key);
          if (!loc) return;
          if (loc.kind === 'kv') {
            if (values.has(key)) result[key] = clone(values.get(key));
            return;
          }
          try {
            const value = await readChapter(loc.id);
            if (value !== undefined) result[key] = value;
          } catch (e) {
            throw toStorageError(e);
          }
        })
      );
      return result;
    },
    async getKeys() {
      await ready();
      return [...Array.from(values.keys()), ...Object.keys(index()).map(chapterKeyOf)];
    },
    set: (items) => write(items),
    async remove(keys) {
      const items: Record<string, unknown> = {};
      keys.forEach((k) => {
        if (locate(k)) items[k] = undefined;
      });
      await write(items);
    },
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    async usage() {
      await ready();
      return currentUsage();
    },
    async deleteAll() {
      try {
        const [kvDocs, chDocs] = await Promise.all([
          withTimeout(getDocs(kvRef), writeTimeout),
          withTimeout(getDocs(chRef), writeTimeout),
        ]);
        // 본문 조각을 먼저, 목록(kv)을 나중에 지운다.
        await commitAll((add) => chDocs.docs.forEach((d) => add((b) => b.delete(d.ref), 100)));
        await commitAll((add) => kvDocs.docs.forEach((d) => add((b) => b.delete(d.ref), 100)));
      } catch (e) {
        throw toStorageError(e);
      }
    },
    close() {
      unsubscribe();
      listeners.clear();
    },
  };
}
