// 메모·책·읽기 위치·설정을 파일 하나로 내보내고, 다시 합쳐 넣는다.
import { StorageArea } from '../../../shared/storage/storageArea';
import { KEY, PREFIX } from '../../../shared/storage/keys';
import {
  isValidBookMeta,
  isValidMemo,
  isValidPosition,
} from '../../../shared/memo/types';

export const BACKUP_FORMAT = 'nf-study-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export interface BackupCounts {
  books: number;
  memos: number;
}

export type ParseResult =
  | { ok: true; backup: Backup; counts: BackupCounts }
  | { ok: false; error: string };

const BACKUP_PREFIXES = [
  PREFIX.memo,
  PREFIX.book,
  PREFIX.chapter,
  PREFIX.position,
];

const isBackupKey = (key: string) =>
  key === KEY.readerSettings || BACKUP_PREFIXES.some((p) => key.startsWith(p));

const pad = (n: number) => String(n).padStart(2, '0');

const countOf = (data: Record<string, unknown>): BackupCounts => {
  const keys = Object.keys(data);
  return {
    books: keys.filter((k) => k.startsWith(PREFIX.book)).length,
    memos: keys.filter((k) => k.startsWith(PREFIX.memo)).length,
  };
};

export async function exportBackup(area: StorageArea, now = new Date()) {
  const keys = (await area.getKeys()).filter(isBackupKey).sort();
  const data = keys.length > 0 ? await area.get(keys) : {};
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
  // 파일 이름은 사용자가 보는 날짜(지역 시각)로 붙인다.
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}`;
  return {
    filename: `nf-study-backup-${date}.json`,
    json: JSON.stringify(backup, null, 2),
    counts: countOf(data),
  };
}

const isSettings = (v: unknown) => {
  if (!v || typeof v !== 'object') return false;
  const fontSize = (v as Record<string, unknown>).fontSize;
  return typeof fontSize === 'number' && fontSize >= 8 && fontSize <= 40;
};

// 키 하나의 값을 검사해, 틀리면 무엇이 틀렸는지 문장으로 돌려준다.
function checkEntry(key: string, value: unknown): string | null {
  if (key === KEY.readerSettings) {
    return isSettings(value) ? null : '리더 설정 값이 올바르지 않습니다.';
  }
  if (key.startsWith(PREFIX.memo)) {
    return isValidMemo(value) && KEY.memo(value.id) === key
      ? null
      : `메모 "${key.slice(PREFIX.memo.length)}"의 내용이 올바르지 않습니다.`;
  }
  if (key.startsWith(PREFIX.book)) {
    return isValidBookMeta(value) && KEY.book(value.id) === key
      ? null
      : `책 "${key.slice(PREFIX.book.length)}"의 정보가 올바르지 않습니다.`;
  }
  if (key.startsWith(PREFIX.chapter)) {
    return Array.isArray(value) && value.every((p) => typeof p === 'string')
      ? null
      : `책 본문 "${key.slice(PREFIX.chapter.length)}"이 글 목록이 아닙니다.`;
  }
  if (key.startsWith(PREFIX.position)) {
    return isValidPosition(value) && KEY.position(value.bookId) === key
      ? null
      : `읽기 위치 "${key.slice(
          PREFIX.position.length
        )}"의 값이 올바르지 않습니다.`;
  }
  return `알 수 없는 항목 "${key}"이 들어 있습니다.`;
}

// 저장하기 전에 파일 전체를 검사한다. 하나라도 틀리면 아무것도 쓰지 않도록 여기서 거른다.
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error:
        'JSON 파일이 아닙니다. 이 확장 프로그램에서 내보낸 백업 파일을 골라 주세요.',
    };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '백업 파일 형식이 아닙니다.' };
  }
  const file = raw as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error:
        '이 확장 프로그램의 백업 파일이 아닙니다(format 항목이 없거나 다릅니다).',
    };
  }
  const version = file.version;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return {
      ok: false,
      error: '백업 파일의 버전 정보가 없거나 올바르지 않습니다.',
    };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error:
        '더 새 버전에서 만든 파일입니다. 확장 프로그램을 업데이트한 뒤 다시 시도해 주세요.',
    };
  }
  const data = file.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '백업 파일에 data 항목이 없습니다.' };
  }
  for (const [key, value] of Object.entries(data)) {
    const error = checkEntry(key, value);
    if (error) return { ok: false, error };
  }
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    data: data as Record<string, unknown>,
  };
  return { ok: true, backup, counts: countOf(backup.data) };
}

const updatedAtOf = (v: unknown) => (v as { updatedAt: number }).updatedAt;

// 지금 있는 것과 파일을 합친다. 지우는 것은 없고, 겹치면 updatedAt이 더 새 쪽을 남긴다(같으면 지금 것).
// 돌려주는 개수는 메모와 책만 센다.
export async function mergeBackup(area: StorageArea, backup: Backup) {
  const fileKeys = Object.keys(backup.data);
  const current = fileKeys.length > 0 ? await area.get(fileKeys) : {};
  const items: Record<string, unknown> = {};
  const result = { added: 0, updated: 0, kept: 0 };
  const replacedBooks = new Set<string>();

  for (const key of fileKeys) {
    const incoming = backup.data[key];
    const isRecord = key.startsWith(PREFIX.memo) || key.startsWith(PREFIX.book);
    if (!isRecord && !key.startsWith(PREFIX.position)) continue;
    const existing = current[key];
    let take = false;
    if (existing === undefined) {
      take = true;
      if (isRecord) result.added += 1;
    } else if (updatedAtOf(incoming) > updatedAtOf(existing)) {
      take = true;
      if (isRecord) result.updated += 1;
    } else if (isRecord) {
      result.kept += 1;
    }
    if (take) {
      items[key] = incoming;
      if (key.startsWith(PREFIX.book))
        replacedBooks.add(key.slice(PREFIX.book.length));
    }
  }

  // 본문은 파일의 책을 쓰기로 한 경우에만 함께 쓴다.
  for (const key of fileKeys) {
    if (!key.startsWith(PREFIX.chapter)) continue;
    const bookId = key.slice(PREFIX.chapter.length).split(':')[0];
    if (replacedBooks.has(bookId)) items[key] = backup.data[key];
  }

  if (
    KEY.readerSettings in backup.data &&
    current[KEY.readerSettings] === undefined
  ) {
    items[KEY.readerSettings] = backup.data[KEY.readerSettings];
  }

  if (Object.keys(items).length > 0) await area.set(items);
  return result;
}
