import React from 'react';
import { createRoot } from 'react-dom/client';
import { StorageArea, createMemoryArea } from '../../shared/storage/storageArea';
import { ReaderEnvProvider } from './env';
import App from './App';
import { seedDemo, seedPerf, syntheticRawBook } from './dev/seed';
import { FAKE_VOICE_SETS, asBackend, createFakeSpeech } from './dev/fakeSpeech';
import { createBrowserBackend } from './tts/speaker';

// 개발 서버 전용 화면(reader-dev.html). chrome.storage.local 대신 메모리 저장소를 쓰고,
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

const dev = {
  area,
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
      <App />
    </ReaderEnvProvider>
  );
}

start();
