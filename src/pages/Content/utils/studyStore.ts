import { useEffect, useRef, useSyncExternalStore } from 'react';
import { BridgeCall, BridgeEvent } from '../../../shared/bridge/protocol';
import {
  DEFAULT_NETFLIX_SETTINGS,
  NetflixSettings,
  isValidNetflixSettings,
  normalizeNetflixSettings,
} from '../../../shared/bridge/netflixRecords';
import { StorageError, StorageErrorCode } from '../../../shared/storage/errors';
import { StoreClient, getStoreClient } from './storeClient';

// 넷플릭스 화면의 로그인 상태, 설정, 저장 오류 안내를 한곳에서 들고 있는 작은 저장소.
// 설정은 한 번 읽어 메모리에 두고, 바뀌면 묶어서 객체 전체를 저장한다(4.2-1).
// 로그아웃 상태에서는 기본 설정으로 시작하고, 바꾼 값은 메모리에서만 바뀌며 저장소를 부르지 않는다(2장).

export type AuthState = 'unknown' | 'in' | 'out';

export interface StorageNotice {
  code: StorageErrorCode;
  retry?: () => void;
  // 실패한 작업. 같은 작업이 나중에 성공하면 안내를 거둔다.
  op?: BridgeCall['op'];
}

interface State {
  client: StoreClient | null;
  auth: AuthState;
  settings: NetflixSettings;
  // 설정을 저장소에서 다 읽었는지. 읽기 전에는 저장하지 않는다(덮어쓰지 않게).
  settingsLoaded: boolean;
  notice: StorageNotice | null;
}

// 아직 시작하지 않았거나 저장소 길이 바뀐 직후의 모습. 화면은 이것을 보고 기본 설정으로 그린다.
const UNSTARTED: State = {
  client: null,
  auth: 'unknown',
  settings: DEFAULT_NETFLIX_SETTINGS,
  settingsLoaded: false,
  notice: null,
};

// 설정을 바꾸고 이만큼 조용하면 저장한다(글자 크기를 여러 번 누를 때 한 번만 쓰게).
const SETTINGS_SAVE_DELAY_MS = 300;

let state: State = UNSTARTED;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: BridgeEvent) => void>();
let unsubscribeBridge: (() => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// 설정을 다 읽기 전에(로그인 확인 중 포함) 바꾼 항목. 읽은 값보다 이것을 남긴다.
const dirtyKeys = new Set<keyof NetflixSettings>();

const emit = () => listeners.forEach((l) => l());

const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

const isCurrent = (client: StoreClient | null) => client !== null && client === state.client;

const clearSaveTimer = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
};

// 저장소 길(getStoreClient)이 바뀌면 처음부터 다시 시작한다. 넷플릭스에서는 한 번만 시작하고,
// 개발 화면이나 테스트가 가짜 저장소를 붙이면 그 저장소로 다시 시작한다.
function ensureStarted() {
  const client = getStoreClient();
  if (state.client === client) return;
  unsubscribeBridge?.();
  clearSaveTimer();
  dirtyKeys.clear();
  state = { ...UNSTARTED, client };
  unsubscribeBridge = client.subscribe?.(handleBridgeEvent) ?? null;
  checkAuth();
  emit();
}

function checkAuth() {
  const client = state.client;
  if (!client) return;
  client
    .call<{ signedIn?: boolean } | null>({ op: 'auth.status' })
    .then((result) => {
      if (isCurrent(client)) setAuth(result?.signedIn ? 'in' : 'out');
    })
    .catch((e) => {
      if (!isCurrent(client)) return;
      // 로그인 상태를 모르면 저장하는 기능은 쓰지 않고, 다시 확인할 수 있게 안내한다.
      setAuth('out');
      reportStorageError(e, checkAuth);
    });
}

function setAuth(next: AuthState) {
  if (state.auth === next) return;
  clearSaveTimer();
  // 로그인 상태를 알기 전에 바꾼 것은 로그인했으면 저장하고, 로그아웃이면 버린다(메모리에만 남는다).
  if (next !== 'in') dirtyKeys.clear();
  // 로그아웃해도 지금 화면의 설정은 그대로 두고(갑자기 패널이 바뀌지 않게) 저장만 멈춘다.
  setState({ auth: next, settingsLoaded: false, notice: null });
  if (next === 'in') loadSettings();
}

function loadSettings() {
  const client = state.client;
  if (!client || state.auth !== 'in') return;
  client
    .call<NetflixSettings | null>({ op: 'nfSettings.get' })
    .then((stored) => {
      if (!isCurrent(client) || state.auth !== 'in') return;
      const loaded: NetflixSettings = stored ? normalizeNetflixSettings(stored) : { ...DEFAULT_NETFLIX_SETTINGS };
      const changed = Array.from(dirtyKeys);
      changed.forEach((key) => {
        (loaded as unknown as Record<string, unknown>)[key] = state.settings[key];
      });
      dirtyKeys.clear();
      setState({ settings: loaded, settingsLoaded: true });
      if (changed.length > 0) scheduleSettingsSave();
    })
    .catch((e) => {
      if (isCurrent(client)) reportStorageError(e, loadSettings);
    });
}

function scheduleSettingsSave() {
  clearSaveTimer();
  saveTimer = setTimeout(saveSettingsNow, SETTINGS_SAVE_DELAY_MS);
}

function saveSettingsNow() {
  saveTimer = null;
  const settings = state.settings;
  if (!isValidNetflixSettings(settings)) return;
  storeWrite({ op: 'nfSettings.set', settings }, saveSettingsNow);
}

function handleBridgeEvent(event: BridgeEvent) {
  if (event.event === 'auth') setAuth(event.signedIn ? 'in' : 'out');
  // 설정은 다른 기기에서 바뀌어도 이 화면에 바로 반영하지 않고, 다음에 열 때 읽는다
  // (방금 바꾼 값이 늦게 온 앞 저장 알림으로 되돌아가지 않게).
  eventListeners.forEach((l) => l(event));
}

const snapshot = (): State => (state.client !== null && state.client === getStoreClient() ? state : UNSTARTED);

// ---- 밖에서 쓰는 것 ----

export const startStudyStore = () => ensureStarted();

export const getAuthState = (): AuthState => snapshot().auth;

export const getNetflixSettings = (): NetflixSettings => snapshot().settings;

export function subscribeStudyStore(listener: () => void): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

export function onStoreEvent(listener: (event: BridgeEvent) => void): () => void {
  eventListeners.add(listener);
  ensureStarted();
  return () => {
    eventListeners.delete(listener);
  };
}

type SettingsPatch = Partial<NetflixSettings> | ((current: NetflixSettings) => Partial<NetflixSettings>);

export function updateNetflixSettings(patch: SettingsPatch) {
  ensureStarted();
  // 함수 안에서 다른 설정을 또 바꿀 수 있으므로(자동 건너뛰기 ↔ 스마트 탐색) 계산한 뒤의 상태에 합친다.
  const values = typeof patch === 'function' ? patch(state.settings) : patch;
  state = { ...state, settings: { ...state.settings, ...values } };
  if (state.auth !== 'out') {
    if (state.auth === 'in' && state.settingsLoaded) scheduleSettingsSave();
    else (Object.keys(values) as (keyof NetflixSettings)[]).forEach((k) => dirtyKeys.add(k));
  }
  emit();
}

type Setter<T> = (action: T | ((prev: T) => T)) => void;
const setters = new Map<keyof NetflixSettings, Setter<unknown>>();

// useState의 setter처럼 쓰는 설정 하나의 setter. 같은 항목이면 같은 함수를 돌려준다(훅 의존성이 흔들리지 않게).
export function settingSetter<K extends keyof NetflixSettings>(key: K): Setter<NetflixSettings[K]> {
  let setter = setters.get(key);
  if (!setter) {
    setter = (action) =>
      updateNetflixSettings((current) => ({
        [key]: typeof action === 'function' ? (action as (prev: unknown) => unknown)(current[key]) : action,
      }));
    setters.set(key, setter);
  }
  return setter as Setter<NetflixSettings[K]>;
}

// 저장 실패를 안내로 남긴다. 로그아웃(signed-out)은 오류가 아니라 로그인 안내로 바꾼다.
export function reportStorageError(error: unknown, retry?: () => void, op?: BridgeCall['op']) {
  const code: StorageErrorCode = error instanceof StorageError ? error.code : 'unknown';
  console.error('[NF-STUDY] storage error:', code);
  if (code === 'signed-out') {
    setAuth('out');
    return;
  }
  setState({ notice: { code, retry, op } });
}

export const dismissStorageNotice = () => setState({ notice: null });

export function retryStorageNotice() {
  const retry = state.notice?.retry;
  setState({ notice: null });
  retry?.();
}

// 로그인했을 때만 쓴다. 실패하면 안내를 남기고 false. 넷플릭스 자막 기능은 실패해도 그대로 둔다.
export async function storeWrite(call: BridgeCall, retry?: () => void): Promise<boolean> {
  ensureStarted();
  const client = state.client;
  if (!client || state.auth !== 'in') return false;
  try {
    await client.call(call);
    if (isCurrent(client) && state.notice?.op === call.op) setState({ notice: null });
    return true;
  } catch (e) {
    if (isCurrent(client)) reportStorageError(e, retry ?? (() => void storeWrite(call)), call.op);
    return false;
  }
}

// 로그인했을 때만 읽는다. 로그인하지 않았으면 signed-out 오류.
export async function storeRead<T>(call: BridgeCall): Promise<T> {
  ensureStarted();
  const client = state.client;
  if (!client || state.auth !== 'in') throw new StorageError('signed-out');
  return client.call<T>(call);
}

// 넷플릭스 화면에서는 로그인하지 않는다. 확장 프로그램 화면을 열어 그곳에서 로그인한다(4.1-2).
export function openLoginPage() {
  getStoreClient()
    .call({ op: 'page.open', page: 'reader' })
    .catch((e) => console.error('[NF-STUDY] Failed to open the extension page:', e));
}

// ---- 훅 ----

const getSnapshot = () => snapshot();

export function useStudyStore() {
  return useSyncExternalStore(subscribeStudyStore, getSnapshot, getSnapshot);
}

export const useStudyAuth = (): AuthState => useStudyStore().auth;

export const useNetflixSettings = (): NetflixSettings => useStudyStore().settings;

// 서비스 워커가 알리는 변경을 받는다. listener는 매번 바뀌어도 구독은 한 번만 한다.
export function useStoreEvent(listener: (event: BridgeEvent) => void) {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onStoreEvent((event) => ref.current(event)), []);
}
