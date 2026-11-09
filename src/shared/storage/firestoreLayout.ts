// 공통 저장소의 키를 Firestore 문서에 대응시킨다. 순수 함수만 둔다(테스트하기 쉽게).
//
// users/{uid}/kv/{docId}   작은 데이터를 묶어 둔 문서. 필드 e(키 → 값 맵) 하나만 있다.
// users/{uid}/ch/{docId}   장 본문 조각. 필드 t(본문 JSON의 일부), i(조각 번호), n(조각 수), v(판).
//
// 화면을 열 때 kv 전체를 한 번 구독하므로(4.2-7), 메모처럼 많은 것은 문서 몇 개에 묶는다.
// 본문은 크고 장을 열 때만 필요해서 따로 둔다.
import { KEY, NETFLIX_KEY, NETFLIX_PREFIX, PREFIX, UNPLACED_PREFIX } from './keys';

export const KV = 'kv';
export const CH = 'ch';

export const MEMO_SHARDS = 32;
export const COMPLETION_SHARDS = 8;
// 영상별 체크리스트도 쌓이면 문서 하나의 한도(1MiB)를 넘으므로 나눠 둔다.
export const CHECKLIST_SHARDS = 16;
// 조각 하나의 글자 수(UTF-16). 한 글자가 UTF-8로 3바이트를 넘지 않으므로 조각 문서는 1MiB 아래다.
export const CHUNK_CHARS = 300_000;
export const MAX_CHUNKS = 100;

const READER_SETTINGS = KEY.readerSettings;

export type Location =
  | { kind: 'kv'; docId: string; field: string }
  | { kind: 'chapter'; id: string };

// 문서 id에 쓸 수 없는 '/'와 구분자 '~'가 들어가지 않게 한다.
export const encodeId = (s: string) => encodeURIComponent(s).replace(/~/g, '%7E').replace(/\./g, '%2E');
export const decodeId = (s: string) => decodeURIComponent(s);

// FNV-1a 32비트. 같은 id는 늘 같은 묶음 문서에 들어간다.
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const rest = (key: string, prefix: string) => (key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null);

// 알 수 없는 키면 null(쓰지 않는다).
export function locate(key: string): Location | null {
  let r: string | null;
  if ((r = rest(key, PREFIX.memo))) return { kind: 'kv', docId: `memos-${hash(r) % MEMO_SHARDS}`, field: r };
  if ((r = rest(key, PREFIX.book))) return { kind: 'kv', docId: `book-${encodeId(r)}`, field: 'm' };
  if ((r = rest(key, PREFIX.chapter))) return { kind: 'chapter', id: encodeId(r) };
  if ((r = rest(key, PREFIX.position))) return { kind: 'kv', docId: 'positions', field: r };
  if ((r = rest(key, PREFIX.completion))) return { kind: 'kv', docId: `done-${hash(r) % COMPLETION_SHARDS}`, field: r };
  if (key === READER_SETTINGS) return { kind: 'kv', docId: 'settings', field: 'reader' };
  if (key === NETFLIX_KEY.settings) return { kind: 'kv', docId: 'settings', field: 'netflix' };
  if ((r = rest(key, NETFLIX_PREFIX.checklist))) return { kind: 'kv', docId: `nf-checklists-${hash(r) % CHECKLIST_SHARDS}`, field: r };
  if ((r = rest(key, NETFLIX_PREFIX.itemsPerPage))) return { kind: 'kv', docId: 'nf-pages', field: r };
  if ((r = rest(key, NETFLIX_PREFIX.studied))) return { kind: 'kv', docId: 'nf-studied', field: r };
  if ((r = rest(key, UNPLACED_PREFIX))) return { kind: 'kv', docId: 'nf-unplaced', field: r };
  return null;
}

// locate의 거꾸로. kv 문서의 항목에서 키를 되찾는다. 모르는 문서면 null.
export function keyOf(docId: string, field: string): string | null {
  const after = (p: string) => (docId.startsWith(p) ? docId.slice(p.length) : null);
  let r: string | null;
  if (/^memos-\d+$/.test(docId)) return `${PREFIX.memo}${field}`;
  if ((r = after('book-')) && field === 'm') return `${PREFIX.book}${decodeId(r)}`;
  if (docId === 'positions') return `${PREFIX.position}${field}`;
  if (/^done-\d+$/.test(docId)) return `${PREFIX.completion}${field}`;
  if (docId === 'settings') return field === 'reader' ? READER_SETTINGS : field === 'netflix' ? NETFLIX_KEY.settings : null;
  if (/^nf-checklists-\d+$/.test(docId)) return `${NETFLIX_PREFIX.checklist}${field}`;
  if (docId === 'nf-pages') return `${NETFLIX_PREFIX.itemsPerPage}${field}`;
  if (docId === 'nf-studied') return `${NETFLIX_PREFIX.studied}${field}`;
  if (docId === 'nf-unplaced') return `${UNPLACED_PREFIX}${field}`;
  return null;
}

// 장 본문의 크기 목록 문서. 항목 이름은 locate의 chapter id(인코딩한 "책:장")다.
export const CHAPTER_INDEX_DOC = 'chsizes';
export const chapterKeyOf = (id: string) => `${PREFIX.chapter}${decodeId(id)}`;
export const chunkDocId = (id: string, i: number) => `${id}~${i}`;

export interface ChapterIndexEntry {
  n: number; // 조각 수
  v: string; // 판. 캐시의 조각이 지금 판인지 볼 때 쓴다.
  bytes: number; // 조각 문서들의 저장 크기 합
}

export const splitChunks = (text: string) => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) chunks.push(text.slice(i, i + CHUNK_CHARS));
  return chunks.length > 0 ? chunks : [''];
};

// ---- 저장 크기(https://firebase.google.com/docs/firestore/storage-size) ----

const utf8 = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
};

export function valueSize(v: unknown): number {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 8;
  if (typeof v === 'string') return utf8(v) + 1;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + valueSize(x), 0);
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>).reduce((n, [k, x]) => n + utf8(k) + 1 + valueSize(x), 0);
  return 8;
}

// 문서 이름 크기: users/{uid}/{collection}/{docId}의 각 부분(UTF-8 + 1) + 16.
export const docNameSize = (uid: string, collection: string, docId: string) =>
  ['users', uid, collection, docId].reduce((n, s) => n + utf8(s) + 1, 0) + 16;

// 문서 하나의 저장 크기. 필드 색인은 꺼 두지만(firestore.indexes.json), 문서 id 색인 몫으로
// 문서 이름 크기의 두 배를 더해 실제보다 작게 세지 않게 한다(4.4-1).
export const docSize = (uid: string, collection: string, docId: string, data: Record<string, unknown>) => {
  const name = docNameSize(uid, collection, docId);
  return name + valueSize(data) + 32 + 2 * (name + 32);
};

export const USAGE_LIMIT_BYTES = 20 * 1024 * 1024;
