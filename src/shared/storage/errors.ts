// 저장소 오류의 종류. 화면은 이 코드로 안내를 고르고, 원래 오류 문구(문서 경로에 uid가 들 수 있다)는 보이지 않는다.
export type StorageErrorCode =
  | 'quota-exceeded' // 20MB 상한
  | 'resource-exhausted' // Firebase 무료 하루 한도
  | 'permission-denied'
  | 'unauthenticated' // 로그인 만료
  | 'unavailable' // 네트워크
  | 'signed-out'
  | 'not-configured'
  | 'invalid'
  | 'cancelled' // 로그인 창을 닫음
  | 'unknown';

export const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = [
  'quota-exceeded',
  'resource-exhausted',
  'permission-denied',
  'unauthenticated',
  'unavailable',
  'signed-out',
  'not-configured',
  'invalid',
  'cancelled',
  'unknown',
];

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode) {
    super(`storage error: ${code}`);
    this.name = 'StorageError';
    this.code = code;
  }
}

export const isStorageErrorCode = (v: unknown): v is StorageErrorCode =>
  typeof v === 'string' && (STORAGE_ERROR_CODES as readonly string[]).includes(v);

// Firebase 오류(code가 'resource-exhausted'나 'auth/network-request-failed' 등)를 종류로 바꾼다.
export function toStorageErrorCode(e: unknown): StorageErrorCode {
  if (e instanceof StorageError) return e.code;
  const raw = (e as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^(firestore|auth)\//, '') : '';
  switch (code) {
    case 'quota-exceeded':
      return 'quota-exceeded';
    case 'resource-exhausted':
      return 'resource-exhausted';
    case 'permission-denied':
      return 'permission-denied';
    case 'unauthenticated':
    case 'user-token-expired':
    case 'user-disabled':
    case 'user-not-found':
    case 'invalid-user-token':
    case 'requires-recent-login':
      return 'unauthenticated';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'unavailable';
    case 'signed-out':
      return 'signed-out';
    case 'not-configured':
      return 'not-configured';
    case 'cancelled':
    case 'popup-closed-by-user':
      return 'cancelled';
    case 'invalid-argument':
    case 'invalid':
      return 'invalid';
    default:
      return 'unknown';
  }
}

export const toStorageError = (e: unknown) => (e instanceof StorageError ? e : new StorageError(toStorageErrorCode(e)));
