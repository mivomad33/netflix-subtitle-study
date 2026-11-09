import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudyPanel from './StudyPanel';
import StudyDashboardModal from './StudyDashboardModal';
import { setStoreClient, StoreClient } from './utils/storeClient';
import { createDirectClient } from '../../shared/bridge/directClient';
import { BridgeCall } from '../../shared/bridge/protocol';
import { createMemoryArea } from '../../shared/storage/storageArea';
import { StorageError, isStorageErrorCode } from '../../shared/storage/errors';
import { NETFLIX_KEY } from '../../shared/storage/keys';
import { putMemo } from '../../shared/storage/repo';
import './content.styles.css';

// 개발 서버 전용 화면(netflix-dev.html). 넷플릭스 밖에서 학습 패널과 대시보드를 띄운다(4.11-3).
// 서비스 워커 대신 메모리 저장소를 브리지 처리기에 바로 붙인다. 빌드 결과물에는 들어가지 않는다.
// 주소 옵션: ?auth=out(로그아웃) | ?auth=wait(로그인 확인 중), ?error=<오류 종류>(쓰기가 그 오류로 실패),
// ?dashboard=1(대시보드를 연 채로 시작).
export const DEV_SHIM_MARKER = 'NF_STUDY_DEV_STORAGE_SHIM';
const DEV_VIDEO_ID = '80000001';

const params = new URLSearchParams(window.location.search);
const authMode = params.get('auth');
const errorParam = params.get('error');
const errorCode = isStorageErrorCode(errorParam) ? errorParam : null;

// 직접 쓴 가짜 대사. 페이지가 여러 개 생기도록 늘린다.
const LINES: [string, string][] = [
  ['Did you leave the kettle on again?', '또 주전자를 켜 두고 나왔어?'],
  ['I only stepped out for a minute.', '잠깐 나갔다 온 것뿐이야.'],
  ['The whole kitchen smells like burnt toast.', '부엌 전체에서 탄 토스트 냄새가 나.'],
  ['Open the window before the alarm goes off.', '경보가 울리기 전에 창문 좀 열어.'],
  ['We should talk about the trip next week.', '다음 주 여행 얘기를 해야 해.'],
  ['I booked the train, but not the hotel.', '기차는 예약했는데 호텔은 아직이야.'],
  ['Then let us pick one tonight.', '그럼 오늘 밤에 하나 고르자.'],
  ['Somewhere near the old harbor would be nice.', '옛 항구 근처면 좋겠어.'],
  ['You always say that and then change your mind.', '넌 늘 그렇게 말하고 마음을 바꾸잖아.'],
  ['This time I mean it, I promise.', '이번엔 진짜야, 약속해.'],
];
const sentences = Array.from({ length: 64 }, (_, i) => {
  const [text, hTranslation] = LINES[i % LINES.length];
  const start = 2000 + i * 3500;
  return { startTime_ms: start, endTime_ms: start + 2800, text, hTranslation };
});

// 넷플릭스 플레이어 흉내. 재생 중이면 시간이 흐른다.
function installFakePlayer() {
  let time = 0;
  let playing = false;
  let last = performance.now();
  const now = () => {
    const t = performance.now();
    if (playing) time += t - last;
    last = t;
    return time;
  };
  const player = {
    isPlaying: () => playing,
    getCurrentTime: () => now(),
    seek: (ms: number) => {
      now();
      time = ms;
    },
    play: () => {
      now();
      playing = true;
    },
    pause: () => {
      now();
      playing = false;
    },
    getMovieId: () => DEV_VIDEO_ID,
  };
  (window as unknown as { netflix: unknown }).netflix = {
    appContext: {
      state: {
        playerApp: {
          getAPI: () => ({
            videoPlayer: {
              getAllPlayerSessionIds: () => ['watch-dev'],
              getVideoPlayerBySessionId: () => player,
            },
            getVideoMetadataByVideoId: () => ({
              _metadataObject: {
                video: {
                  title: 'Harbor Days (개발용)',
                  artwork: [],
                  seasons: [{ seq: 1, episodes: [{ id: Number(DEV_VIDEO_ID), seq: 2, title: 'The Kettle' }] }],
                },
              },
            }),
          }),
        },
      },
    },
  };
}

const donePage = { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true };

async function createClient(): Promise<StoreClient> {
  const openPage = (page: string) => console.info('[NF-STUDY dev] open extension page:', page);
  if (authMode === 'out') return createDirectClient(null, openPage);
  const area = createMemoryArea({
    [NETFLIX_KEY.checklist(DEV_VIDEO_ID)]: { currentActiveRound: 1, rounds: { 1: { 0: donePage, 1: { ...donePage, speaking: false } } } },
    [NETFLIX_KEY.studied(DEV_VIDEO_ID)]: {
      videoId: DEV_VIDEO_ID,
      title: 'Harbor Days (개발용)',
      cover: '',
      epTitle: 'The Kettle',
      epSeq: 2,
      seasonSeq: 1,
      totalPages: 2,
      updatedAt: Date.now(),
    },
  });
  await putMemo(area, {
    id: 'dev-memo-1',
    kind: 'netflix',
    sourceId: DEV_VIDEO_ID,
    contextText: LINES[2][0],
    start: 4,
    end: 9,
    quote: 'whole',
    note: '전부, 온통',
    createdAt: 1,
    updatedAt: 1,
    sentenceStartMs: sentences[2].startTime_ms,
  });
  const direct = createDirectClient(area, openPage);
  return {
    call<T>(call: BridgeCall): Promise<T> {
      if (authMode === 'wait') return new Promise<T>(() => {});
      const isWrite = /\.(set|put|delete)$/.test(call.op);
      if (errorCode && isWrite) return Promise.reject(new StorageError(errorCode));
      return direct.call<T>(call);
    },
    subscribe: direct.subscribe,
  };
}

const DevShell: React.FC = () => {
  const [dashboard, setDashboard] = useState(params.get('dashboard') === '1');
  return (
    <>
      <div className="watch-video" style={{ position: 'absolute', inset: 0, background: '#111' }}>
        <button
          type="button"
          onClick={() => setDashboard(true)}
          style={{ position: 'absolute', top: 16, left: 16, padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}
        >
          대시보드 열기
        </button>
      </div>
      {dashboard && <StudyDashboardModal onClose={() => setDashboard(false)} />}
    </>
  );
};

async function start() {
  installFakePlayer();
  setStoreClient(await createClient());
  document.documentElement.dataset.devShim = DEV_SHIM_MARKER;
  document.body.style.margin = '0';
  document.body.style.display = 'flex';
  document.body.style.height = '100vh';
  const video = document.getElementById('appMountPoint')!;
  Object.assign(video.style, { width: '40%', position: 'relative' });
  const panel = document.getElementById('studyPanel')!;
  Object.assign(panel.style, { width: '60%', height: '100%' });

  createRoot(video).render(<DevShell />);
  createRoot(panel).render(
    <StudyPanel
      sentences={sentences}
      videoId={DEV_VIDEO_ID}
      isPanelVisible={true}
      isOverlayVisible={false}
      onTogglePanel={() => {}}
      onToggleOverlay={() => {}}
    />
  );
}

start();
