import { LEGACY_STUDY_KEYS, LEGACY_STUDY_PREFIXES } from '../constants/storageKeys';

const isLegacyStudyKey = (key: string) =>
  (LEGACY_STUDY_KEYS as readonly string[]).includes(key) || LEGACY_STUDY_PREFIXES.some((p) => key.startsWith(p));

// 넷플릭스 localStorage에서 이 확장 프로그램의 옛 학습 기록 키만 지운다(4.7-2).
// 자막 처리 값(NF_lingoActive, NF_preferredTextLocale), 목록에 없는 NF_ 키, 넷플릭스 자체 키는 남긴다.
export function removeLegacyStudyKeys(storage: Storage = window.localStorage): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && isLegacyStudyKey(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return keys;
  } catch (e) {
    // localStorage를 쓸 수 없어도 자막 기능은 그대로 돈다.
    console.error('[NF-STUDY] Failed to remove old study keys:', e);
    return [];
  }
}
