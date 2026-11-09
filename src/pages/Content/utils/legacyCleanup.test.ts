import { describe, it, expect } from 'vitest';
import { removeLegacyStudyKeys } from './legacyCleanup';

// 키 목록을 그대로 흉내 내는 가짜 localStorage(jsdom의 것과 섞이지 않게).
function fakeStorage(initial: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

describe('4.7-2 removeLegacyStudyKeys', () => {
  const removed = {
    NF_isPanelVisible: 'true',
    NF_isOverlayVisible: 'false',
    NF_isEnglishVisible: 'true',
    NF_isKoreanVisible: 'false',
    NF_isAutoPause: 'true',
    NF_isPageEndPause: 'true',
    NF_isAutoSkip: 'false',
    NF_isSmartSkim: 'false',
    NF_isSentenceLoop: 'false',
    NF_fontSize: '16',
    NF_studied_videos: '{}',
    NF_studyPanelWidthRatio: '0.4',
    NF_checklist_12345: '{}',
    NF_itemsPerPage_12345: '50',
    NF_annotations_12345: '[]',
  };
  const kept = {
    NF_lingoActive: 'true',
    NF_preferredTextLocale: 'ko',
    NF_other: 'x',
    nf_x: 'netflix',
    NFX: 'netflix',
    nf_checklist_1: 'lowercase is not ours',
    'netflix-sans': 'font',
  };

  it('removes only the old study keys and prefixes listed in storageKeys.ts', () => {
    const storage = fakeStorage({ ...removed, ...kept });
    const result = removeLegacyStudyKeys(storage);

    expect(result.sort()).toEqual(Object.keys(removed).sort());
    Object.keys(removed).forEach((k) => expect(storage.getItem(k)).toBeNull());
    Object.entries(kept).forEach(([k, v]) => expect(storage.getItem(k)).toBe(v));
    expect(storage.length).toBe(Object.keys(kept).length);
  });

  it('leaves no marker, so running it again gives the same result', () => {
    const storage = fakeStorage({ ...kept });
    removeLegacyStudyKeys(storage);
    removeLegacyStudyKeys(storage);
    expect(storage.length).toBe(Object.keys(kept).length);
  });

  it('does not throw when localStorage cannot be used', () => {
    const broken = {
      get length(): number {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(removeLegacyStudyKeys(broken)).toEqual([]);
  });
});
