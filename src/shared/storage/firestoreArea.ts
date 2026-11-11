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
import { StorageArea, StorageChanges, clone, sameJson as same } from './storageArea';
import { StorageError, toStorageError } from './errors';
import {
  CH,
  CHAPTER_INDEX_DOC,
  ChapterIndexEntry,
  ChunkSet,
  KV,
  MAX_CHUNKS,
  USAGE_LIMIT_BYTES,
  chapterKeyOf,
  chunkDocId,
  chunkSets,
  currentSet,
  pendingSets,
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
  // 테스트에서 본문 조각을 쓴 뒤, kv 문서를 쓰기 전에 실패를 넣을 때 쓴다. 던지면 그 쓰기가 실패한다.
  beforeKvCommit?: () => void | Promise<void>;
  // 다른 클라이언트가 쓰다 만 조각을 얼마나 지난 뒤에 지울지(밀리초). 테스트에서 줄여 쓴다.
  pendingGraceMs?: number;
}

type Entries = Record<string, unknown>;
type KvWrites = Map<string, Map<string, unknown>>;

const MAX_BATCH_OPS = 400;
const MAX_BATCH_BYTES = 6 * 1024 * 1024;
// 읽는 사이에 판이 바뀌면 지금 판으로 다시 읽는 횟수.
const MAX_REREADS = 4;
const PENDING_GRACE_MS = 60 * 60 * 1000;

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
  const pendingGrace = options.pendingGraceMs ?? PENDING_GRACE_MS;
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

  const index = (): Record<string, ChapterIndexEntry | undefined> =>
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

  // 조각이 없거나 다른 판이면 null.
  const readChunk = async (id: string, i: number, set: ChunkSet) => {
    const ref = doc(chRef, chunkDocId(id, set, i));
    try {
      const cached = await getDocFromCache(ref);
      if (cached.exists() && cached.get('v') === set.v) {
        options.onChunkRead?.(ref.id, true);
        return cached.get('t') as string;
      }
    } catch {
      // 캐시에 없으면 서버에서 읽는다.
    }
    const fresh = await withTimeout(getDocFromServer(ref), writeTimeout);
    options.onChunkRead?.(ref.id, false);
    if (!fresh.exists() || fresh.get('v') !== set.v) return null;
    return fresh.get('t') as string;
  };

  const serverSet = async (id: string) => {
    const snapshot = await withTimeout(getDocFromServer(doc(kvRef, CHAPTER_INDEX_DOC)), writeTimeout);
    return currentSet(snapshot.get(new FieldPath('e', id)) as ChapterIndexEntry | undefined);
  };

  // 조각이 하나라도 없거나 다른 판이면 null.
  const readSet = async (id: string, set: ChunkSet) => {
    const parts = await Promise.all(Array.from({ length: set.n }, (_, i) => readChunk(id, i, set)));
    return parts.every((t) => t !== null) ? parts.join('') : null;
  };

  const readChapter = async (id: string) => {
    let set = currentSet(index()[id]);
    for (let rereads = 0; set; rereads++) {
      const text = await readSet(id, set);
      if (text !== null) {
        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      }
      // 읽는 사이에 다른 쓰기가 판을 바꾸고 옛 조각을 지웠다. 서버의 목록에서 지금 판을 다시 보고 그 판을 읽는다.
      if (rereads >= MAX_REREADS) break;
      const now = await serverSet(id);
      if (now && now.v === set.v) break;
      set = now;
    }
    if (!set) return undefined;
    throw new StorageError('unavailable');
  };

  // 쓰기를 문서 단위로 모은다. value가 undefined면 지운다.
  // chapters의 set은 새로 쓸 판이고, 장을 지울 때는 null이다.
  interface Plan {
    kv: KvWrites;
    chapters: Map<string, { chunks: string[]; set: ChunkSet | null }>;
  }

  const plan = (items: Record<string, unknown>): Plan => {
    const p: Plan = { kv: new Map(), chapters: new Map() };
    Object.entries(items).forEach(([key, value]) => {
      const loc = locate(key);
      if (!loc) throw new StorageError('invalid');
      if (loc.kind === 'chapter') {
        if (value === undefined) {
          p.chapters.set(loc.id, { chunks: [], set: null });
          return;
        }
        const chunks = splitChunks(JSON.stringify(value));
        if (chunks.length > MAX_CHUNKS) throw new StorageError('invalid');
        const set: ChunkSet = { n: chunks.length, v: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, bytes: 0, l: 2 };
        set.bytes = chunks.reduce((n, t, i) => n + docSize(uid, CH, chunkDocId(loc.id, set, i), { t, i, n: set.n, v: set.v }), 0);
        p.chapters.set(loc.id, { chunks, set });
        return;
      }
      if (!p.kv.has(loc.docId)) p.kv.set(loc.docId, new Map());
      p.kv.get(loc.docId)!.set(loc.field, value === undefined ? undefined : clone(value));
    });
    if (p.chapters.size > 0) {
      // 쓰기가 다 끝났을 때의 목록 항목. 쓰는 중간의 항목은 write가 따로 만든다.
      const idx = p.kv.get(CHAPTER_INDEX_DOC) ?? new Map<string, unknown>();
      p.chapters.forEach(({ set }, id) => idx.set(id, set ?? undefined));
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

  // 지워야 할 조각(p)도 아직 저장돼 있으므로 센다.
  const chapterBytes = (entry: ChapterIndexEntry | undefined) => chunkSets(entry).reduce((n, s) => n + (s.bytes ?? 0), 0);

  const currentUsage = () => {
    let total = 0;
    sizes.forEach((s) => (total += s));
    Object.values(index()).forEach((e) => (total += chapterBytes(e)));
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
    p.chapters.forEach(({ set }, id) => {
      total += (set?.bytes ?? 0) - chapterBytes(idxBefore[id]);
    });
    return total;
  };

  type Add = (op: (b: WriteBatch) => void, bytes: number) => void;

  const commitAll = async (fill: (add: Add) => void) => {
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

  const addKv = (add: Add, kv: KvWrites) => {
    kv.forEach((fields, docId) => {
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
  };

  // 이 저장소가 쓰고 있는 판과, 쓰기가 끝난(실패 포함) 판.
  const writing = new Set<string>();
  const written = new Set<string>();

  // 지워도 되는 묶음인가. 쓰는 중인 판은 곧 지금 판이 될 수 있으므로 지우지 않는다.
  // 다른 클라이언트가 적어 둔 새 판(t가 있다)은 아직 쓰는 중일 수 있어서 오래된 것만 지운다.
  const collectable = (s: ChunkSet) =>
    !writing.has(s.v) && (written.has(s.v) || s.t === undefined || Date.now() - s.t > pendingGrace);

  // 목록 문서(chsizes)에서 장 항목의 p만 바꾼다. 지금 판은 건드리지 않는다.
  const addPending = (add: Add, pending: Map<string, ChunkSet[]>) => {
    if (pending.size === 0) return;
    const data: Entries = {};
    const paths: FieldPath[] = [];
    pending.forEach((sets, id) => {
      data[id] = { p: sets.length > 0 ? sets : deleteField() };
      paths.push(new FieldPath('e', id, 'p'));
    });
    add((b) => b.set(doc(kvRef, CHAPTER_INDEX_DOC), { e: data }, { mergeFields: paths }), JSON.stringify(data).length * 3 + 200);
  };

  // 본문은 판마다 다른 조각 문서에 쓰고, 목록 문서(chsizes)의 항목이 어느 판을 읽을지 정한다.
  // 목록 항목은 같은 set()의 다른 kv 문서와 한 묶음으로 바뀌므로, 어디서 실패해도 본문과 kv 값이 함께 옛것이거나 함께 새것이다(4.3-9).
  // 옛 판의 조각은 목록 항목을 바꾼 뒤에 지워서, 읽는 쪽이 옛 판 전체나 새 판 전체를 본다(4.3-10).
  const write = async (items: Record<string, unknown>) => {
    await ready();
    const p = plan(items);
    if (p.kv.size === 0) return;
    const projected = projectedUsage(p);
    if (projected > limit && projected > currentUsage()) throw new StorageError('quota-exceeded');
    const versions = Array.from(p.chapters.values()).flatMap(({ set }) => (set ? [set.v] : []));
    versions.forEach((v) => writing.add(v));
    try {
      // 1. 새 판을 "지워야 할 조각"으로 먼저 적어 둔다. 이 뒤에 실패해 조각이 남아도 다음 쓰기나 삭제가 그 문서를 찾아 지운다.
      const started = new Map<string, ChunkSet[]>();
      p.chapters.forEach(({ set }, id) => {
        if (set) started.set(id, [...pendingSets(index()[id]), { ...set, t: Date.now() }]);
      });
      await commitAll((add) => addPending(add, started));
      // 2. 새 판의 조각을 쓴다. 지금 읽히는 판의 조각은 건드리지 않는다.
      await commitAll((add) => {
        p.chapters.forEach(({ chunks, set }, id) => {
          chunks.forEach((t, i) => {
            const data = { t, i, n: set!.n, v: set!.v };
            add((b) => b.set(doc(chRef, chunkDocId(id, set!, i)), data), t.length * 3 + 200);
          });
        });
      });
      await options.beforeKvCommit?.();
      // 3. 목록 항목을 새 판으로 바꾸면서 나머지 kv 문서를 함께 쓴다. 옛 판과 쓰다 만 판은 지워야 할 조각으로 적는다.
      const drop = new Map<string, ChunkSet[]>();
      const keep = new Map<string, ChunkSet[]>();
      const flip = new Map<string, unknown>();
      p.chapters.forEach(({ set }, id) => {
        const entry = index()[id];
        const old = currentSet(entry);
        const pending = pendingSets(entry).filter((s) => s.v !== set?.v);
        const dropped = [...(old ? [old] : []), ...pending.filter(collectable)];
        const kept = pending.filter((s) => !collectable(s));
        if (dropped.length > 0) drop.set(id, dropped);
        keep.set(id, kept);
        const rest = [...dropped, ...kept];
        if (set) flip.set(id, rest.length > 0 ? { ...set, p: rest } : set);
        else flip.set(id, rest.length > 0 ? { p: rest } : undefined);
      });
      await commitAll((add) => addKv(add, flip.size > 0 ? new Map([...p.kv, [CHAPTER_INDEX_DOC, flip]]) : p.kv));
      // 4. 지워야 할 조각을 지우고, 다 지운 뒤에 그 기록을 목록에서 뺀다.
      // 저장은 3에서 끝났으므로 여기서 실패해도 쓰기는 성공이다. 남은 조각은 목록에 적혀 있어 다음 쓰기나 삭제가 지운다.
      try {
        await commitAll((add) => {
          const pending = new Map<string, ChunkSet[]>();
          const gone = new Map<string, unknown>();
          drop.forEach((sets, id) => {
            sets.forEach((s) => {
              for (let i = 0; i < Math.min(s.n, MAX_CHUNKS); i++) add((b) => b.delete(doc(chRef, chunkDocId(id, s, i))), 100);
            });
            if (p.chapters.get(id)!.set || keep.get(id)!.length > 0) pending.set(id, keep.get(id)!);
            else gone.set(id, undefined);
          });
          addPending(add, pending);
          if (gone.size > 0) addKv(add, new Map([[CHAPTER_INDEX_DOC, gone]]));
        });
      } catch {
        // 다음에 이 장을 쓰거나 지울 때 정리한다.
      }
    } catch (e) {
      throw toStorageError(e);
    } finally {
      versions.forEach((v) => {
        writing.delete(v);
        written.add(v);
      });
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
      const chapters = Object.entries(index())
        .filter(([, entry]) => currentSet(entry))
        .map(([id]) => chapterKeyOf(id));
      return [...Array.from(values.keys()), ...chapters];
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
