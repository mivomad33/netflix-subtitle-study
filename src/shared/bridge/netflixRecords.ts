// 넷플릭스 학습 기록의 모양과 검사. 예전에는 넷플릭스 사이트 localStorage의 NF_ 키에 있었고,
// 지금은 로그인한 사용자의 Firestore에 브리지로 쓴다(4.2-1). 넷플릭스 쪽에서 오는 값이라 크기를 막는다(4.3-3).

export interface NetflixSettings {
  isPanelVisible: boolean;
  isOverlayVisible: boolean;
  isEnglishVisible: boolean;
  isKoreanVisible: boolean;
  isAutoPause: boolean;
  isPageEndPause: boolean;
  isAutoSkip: boolean;
  isSmartSkim: boolean;
  isSentenceLoop: boolean;
  fontSize: number; // pt
  studyPanelWidthRatio: number | null; // 영상 쪽 너비 비율. null이면 기본(40%)
}

export const DEFAULT_NETFLIX_SETTINGS: NetflixSettings = {
  isPanelVisible: true,
  isOverlayVisible: false,
  isEnglishVisible: false,
  isKoreanVisible: false,
  isAutoPause: false,
  isPageEndPause: true,
  isAutoSkip: false,
  isSmartSkim: false,
  isSentenceLoop: false,
  fontSize: 14,
  studyPanelWidthRatio: null,
};

const BOOLEAN_SETTINGS = Object.entries(DEFAULT_NETFLIX_SETTINGS)
  .filter(([, v]) => typeof v === 'boolean')
  .map(([k]) => k);

const isFontSize = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 8 && v <= 40;
const isRatio = (v: unknown) => v === null || (typeof v === 'number' && v >= 0.1 && v <= 0.9);

// 저장할 때: 모든 항목이 있고 모양이 맞아야 한다. 모르는 항목은 받지 않는다.
export function isValidNetflixSettings(v: unknown): v is NetflixSettings {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  const keys = Object.keys(s);
  if (keys.length !== Object.keys(DEFAULT_NETFLIX_SETTINGS).length) return false;
  if (!keys.every((k) => k in DEFAULT_NETFLIX_SETTINGS)) return false;
  return BOOLEAN_SETTINGS.every((k) => typeof s[k] === 'boolean') && isFontSize(s.fontSize) && isRatio(s.studyPanelWidthRatio);
}

// 읽을 때: 맞는 항목만 남기고 나머지는 기본값.
export function normalizeNetflixSettings(v: unknown): NetflixSettings {
  const out: NetflixSettings = { ...DEFAULT_NETFLIX_SETTINGS };
  if (!v || typeof v !== 'object') return out;
  const s = v as Record<string, unknown>;
  BOOLEAN_SETTINGS.forEach((k) => {
    if (typeof s[k] === 'boolean') (out as unknown as Record<string, unknown>)[k] = s[k];
  });
  if (isFontSize(s.fontSize)) out.fontSize = s.fontSize as number;
  if (isRatio(s.studyPanelWidthRatio) && s.studyPanelWidthRatio !== undefined)
    out.studyPanelWidthRatio = s.studyPanelWidthRatio as number | null;
  return out;
}

// 영상 하나의 회차별 체크리스트(MultiRoundChecklists). JSON 글자 수 상한.
export const MAX_CHECKLIST_CHARS = 100_000;
const MAX_ROUNDS = 100;
const MAX_PAGES = 1000;

// JSON 글자 수(직렬화할 수 없으면 무한대). 크기 상한 검사에 쓴다.
export const jsonLength = (v: unknown) => {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isIndex = (k: string, max: number) => /^\d+$/.test(k) && Number(k) <= max;

export function isValidChecklist(v: unknown): boolean {
  if (!isPlainObject(v) || jsonLength(v) > MAX_CHECKLIST_CHARS) return false;
  if (!Object.keys(v).every((k) => k === 'currentActiveRound' || k === 'rounds')) return false;
  const round = v.currentActiveRound;
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > MAX_ROUNDS) return false;
  if (!isPlainObject(v.rounds)) return false;
  return Object.entries(v.rounds).every(
    ([r, pages]) =>
      isIndex(r, MAX_ROUNDS) &&
      isPlainObject(pages) &&
      Object.entries(pages).every(
        ([p, page]) => isIndex(p, MAX_PAGES) && isPlainObject(page) && Object.values(page).every((b) => typeof b === 'boolean')
      )
  );
}

export const isValidItemsPerPage = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000;

// 공부한 영상 목록의 한 항목(대시보드).
export interface StudiedVideoRecord {
  videoId: string;
  title: string;
  cover: string;
  epTitle: string;
  epSeq: number;
  seasonSeq: number;
  totalPages: number;
  updatedAt: number;
}

export const MAX_STUDIED_CHARS = 4000;

// 공부한 영상 기록의 글자 수 상한. 화면은 이 값에 맞게 잘라 저장한다.
export const MAX_STUDIED_TITLE = 500;
export const MAX_STUDIED_COVER = 2000;

const STUDIED_FIELDS: Record<keyof StudiedVideoRecord, (v: unknown) => boolean> = {
  videoId: (v) => typeof v === 'string' && v !== '' && v.length <= 200,
  title: (v) => typeof v === 'string' && v.length <= MAX_STUDIED_TITLE,
  cover: (v) => typeof v === 'string' && v.length <= MAX_STUDIED_COVER,
  epTitle: (v) => typeof v === 'string' && v.length <= MAX_STUDIED_TITLE,
  epSeq: (v) => typeof v === 'number' && Number.isFinite(v),
  seasonSeq: (v) => typeof v === 'number' && Number.isFinite(v),
  totalPages: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100000,
  updatedAt: (v) => typeof v === 'number' && Number.isFinite(v),
};

export function isValidStudiedVideo(v: unknown): v is StudiedVideoRecord {
  if (!isPlainObject(v) || jsonLength(v) > MAX_STUDIED_CHARS) return false;
  const keys = Object.keys(v);
  return (
    keys.length === Object.keys(STUDIED_FIELDS).length &&
    keys.every((k) => k in STUDIED_FIELDS && STUDIED_FIELDS[k as keyof StudiedVideoRecord](v[k]))
  );
}
