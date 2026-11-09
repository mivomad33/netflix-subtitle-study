import React from 'react';
import { createRoot } from 'react-dom/client';
import { StorageArea, createMemoryArea } from '../../shared/storage/storageArea';
import { USAGE_LIMIT_BYTES } from '../../shared/storage/firestoreLayout';
import { ReaderEnvProvider } from './env';
import App from './App';
import { seedDemo, seedPerf, syntheticRawBook } from './dev/seed';
import { FAKE_VOICE_SETS, asBackend, createFakeSpeech } from './dev/fakeSpeech';
import { createBrowserBackend } from './tts/speaker';
import { AuthGate } from './account/AuthGate';
import { createFakeAuth } from './dev/fakeAuth';
import { AuthState } from '../../shared/auth/types';

// 개발 서버 전용 화면(reader-dev.html). 서비스 워커·Firestore 대신 메모리 저장소와 로그인된 가짜 사용자를 쓰고,
// 새로 고쳐도 남도록 이 개발 페이지의 localStorage에 옮겨 적는다. 빌드 결과물에는 들어가지 않는다.
export const DEV_SHIM_MARKER = 'NF_STUDY_DEV_STORAGE_SHIM';
const SAVED_KEY = `${DEV_SHIM_MARKER}:data`;

function loadSaved(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
  } catch {
    return {};
  }
}

function persistentArea(): StorageArea {
  const area = createMemoryArea(loadSaved());
  const persist = async () => {
    const all = await area.get(await area.getKeys());
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(all));
    } catch {
      // 성능 측정 데이터처럼 크면 새로 고칠 때까지만 남긴다.
    }
  };
  area.onChanged(() => {
    persist();
  });
  return area;
}

const area = persistentArea();
const params = new URLSearchParams(window.location.search);

// 소리 내어 읽기: ?voices=device(기본, 좋은 기기 음성 있음) | basic(기본 기기 음성뿐) | none(음성 없음)
// | unsupported(speechSynthesis 없음) | real(이 브라우저의 실제 음성). 고른 값은 새로 고쳐도 남긴다.
const VOICES_KEY = 'NF_STUDY_DEV_VOICES';
const voicesParam = params.get('voices');
if (voicesParam) localStorage.setItem(VOICES_KEY, voicesParam);
const voicesMode = voicesParam ?? localStorage.getItem(VOICES_KEY) ?? 'device';
const fakeSpeech =
  voicesMode in FAKE_VOICE_SETS
    ? createFakeSpeech({ voices: FAKE_VOICE_SETS[voicesMode], autoPlay: { msPerChar: 60 } })
    : null;
const speech =
  voicesMode === 'real' ? createBrowserBackend() : voicesMode === 'unsupported' ? null : fakeSpeech && asBackend(fakeSpeech);

// 로그인: 기본은 로그인된 가짜 사용자. ?auth=signedOut | loading | unconfigured | expired 로 로그인 전 화면을 본다.
// ?signin=cancelled 이면 로그인 창을 닫은 것처럼 실패한다. ?usage=full 이면 사용량이 상한에 닿은 것처럼 보인다.
const AUTH_STATES: Record<string, AuthState> = {
  signedOut: { status: 'signedOut' },
  loading: { status: 'loading' },
  unconfigured: { status: 'unconfigured' },
  expired: { status: 'signedOut', notice: 'expired' },
};
const auth = createFakeAuth({
  initial: AUTH_STATES[params.get('auth') ?? ''],
  area,
  delayMs: 800,
  usage: params.get('usage') === 'full' ? async () => USAGE_LIMIT_BYTES : undefined,
});
if (params.get('signin') === 'cancelled') auth.nextSignIn = 'cancelled';

const dev = {
  area,
  auth,
  async reset() {
    await area.remove(await area.getKeys());
    localStorage.removeItem(SAVED_KEY);
  },
  seedDemo: () => seedDemo(area),
  seedPerf: () => seedPerf(area),
  syntheticRawBook,
  // 가짜 음성이 읽은 글과 시각(성능 측정 4.6-4 b)
  speech: fakeSpeech,
};
(window as unknown as { nfStudyDev: typeof dev }).nfStudyDev = dev;

async function start() {
  const seed = params.get('seed');
  if (seed) {
    await dev.reset();
    if (seed === 'demo') await dev.seedDemo();
    if (seed === 'perf') await dev.seedPerf();
    // 새로 고칠 때 다시 채우지 않게 주소에서 뺀다.
    params.delete('seed');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  }
  document.documentElement.dataset.devShim = DEV_SHIM_MARKER;
  createRoot(document.getElementById('app-container')!).render(
    <ReaderEnvProvider
      env={{
        area,
        openTab: (url) => {
          console.info('[NF-STUDY dev] open tab:', url);
          window.open(url, '_blank', 'noopener');
        },
        speech,
      }}
    >
      <AuthGate auth={auth}>
        <App />
      </AuthGate>
    </ReaderEnvProvider>
  );
}

start();
