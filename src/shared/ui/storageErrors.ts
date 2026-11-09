import { StorageErrorCode } from '../storage/errors';

// 저장소 오류 종류별 안내 문구. 확장 프로그램 화면과 넷플릭스 화면이 같은 문구를 쓴다(4.4-2, 4.4-3).
// 원래 오류 문구(문서 경로에 uid가 들 수 있다)는 화면에 보이지 않고, 이 문구만 보인다.
const MESSAGES: Record<StorageErrorCode, string> = {
  'quota-exceeded': '저장 공간 20MB를 다 썼습니다. 필요 없는 메모나 책을 지운 뒤 다시 저장하세요.',
  'resource-exhausted':
    '오늘 무료 사용량을 다 썼습니다. 한도는 태평양 시간 자정(한국 시간 오후 4시 또는 5시)에 다시 채워집니다.',
  unavailable: '인터넷에 연결되지 않아 저장소에 닿지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.',
  'permission-denied': '이 데이터를 읽거나 쓸 권한이 없습니다. 로그아웃한 뒤 다시 로그인해 보세요.',
  unauthenticated: '로그인이 만료되었습니다. 다시 로그인하세요.',
  'signed-out': '로그인하지 않았습니다. 로그인하면 저장됩니다.',
  'not-configured': '이 빌드에는 로그인 설정이 없어 저장할 수 없습니다.',
  invalid: '저장할 수 없는 값이라 저장하지 못했습니다.',
  cancelled: '로그인을 취소했습니다.',
  unknown: '알 수 없는 문제로 저장소를 쓰지 못했습니다. 잠시 뒤 다시 시도하세요.',
};

export const storageErrorMessage = (code: StorageErrorCode): string => MESSAGES[code] ?? MESSAGES.unknown;

// 같은 요청을 다시 보내면 될 수 있는 오류(일시적인 것). 상한·권한·로그인 문제는 다시 보내도 같다.
export const isRetryable = (code: StorageErrorCode): boolean =>
  code === 'resource-exhausted' || code === 'unavailable' || code === 'unknown';
