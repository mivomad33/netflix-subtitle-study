import React from 'react';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyPanel from './StudyPanel';
import StudyDashboardModal from './StudyDashboardModal';
import { installFakeStore } from './testing/fakeStore';
import { setStoreClient } from './utils/storeClient';
import { cleanupUI, resetRenderedVideoId, setupUI, toggleOverlayVisibility, togglePanelVisibility } from './utils/layoutManager';
import { STORAGE_KEYS } from './constants/storageKeys';
import { createMemoryArea } from '../../shared/storage/storageArea';

// 4.2-1: 학습 기록과 설정을 저장하는 코드는 넷플릭스 localStorage에 쓰지 않는다.
// 쓸 수 있는 것은 자막 처리 값 둘(NF_lingoActive, NF_preferredTextLocale)뿐이다.
const ALLOWED = new Set<string>([STORAGE_KEYS.LINGO_ACTIVE, STORAGE_KEYS.PREFERRED_TEXT_LOCALE]);

const sentences = [
  { startTime_ms: 1000, endTime_ms: 2000, text: 'Sentence One', hTranslation: '번역 하나' },
  { startTime_ms: 3000, endTime_ms: 4000, text: 'Sentence Two', hTranslation: '번역 둘' },
];

const props = { isPanelVisible: true, isOverlayVisible: false, onTogglePanel: vi.fn(), onToggleOverlay: vi.fn() };

const exercisePanel = async (signedIn: boolean) => {
  const { container } = render(<StudyPanel sentences={sentences} videoId="12345" {...props} />);
  if (signedIn) await screen.findByText('1회차');
  else await screen.findByText(/로그인하면/);
  [
    '💬 영어 자막',
    '💬 한국어 자막',
    '⏱️ 자동 멈춤',
    '🔁 문장 반복',
    '🛑 페이지 멈춤',
    '⏭️ 자동 건너뛰기',
    '🎬 스마트 탐색',
  ].forEach((label) => fireEvent.click(screen.getByText(label)));
  fireEvent.click(screen.getByTitle('글자 크기 늘리기'));
  fireEvent.keyDown(window, { code: 'KeyQ' });
  fireEvent.keyDown(window, { code: 'KeyR' });
  if (signedIn) {
    fireEvent.click(screen.getByText('사전 학습'));
    const textElement = container.querySelectorAll('.sentence-text')[0];
    const range = document.createRange();
    range.setStart(textElement.firstChild!, 0);
    range.setEnd(textElement.firstChild!, 8);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(textElement);
    fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
    fireEvent.click(screen.getByTitle('학습 환경 설정'));
    fireEvent.click(screen.getByText('현재 영상 학습 초기화'));
  } else {
    fireEvent.click(screen.getByTitle('학습 환경 설정'));
  }
  fireEvent.click(screen.getByRole('button', { name: '20' }));
  await act(() => new Promise<void>((r) => setTimeout(r, 400)));
};

describe('4.2-1 saving never writes study data to the Netflix localStorage', () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setItem = vi.spyOn(Storage.prototype, 'setItem');
    (window as any).netflix = {
      appContext: {
        state: {
          playerApp: {
            getAPI: () => ({
              videoPlayer: {
                getAllPlayerSessionIds: () => ['watch-session-1'],
                getVideoPlayerBySessionId: () => ({
                  isPlaying: () => false,
                  getCurrentTime: () => 0,
                  seek: vi.fn(),
                  pause: vi.fn(),
                  play: vi.fn(),
                  getMovieId: () => '12345',
                }),
              },
              getVideoMetadataByVideoId: () => ({
                _metadataObject: { video: { title: 'Test Show', artwork: [], seasons: [] } },
              }),
            }),
          },
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
    cleanupUI();
    resetRenderedVideoId();
    setStoreClient(null);
    delete (window as any).netflix;
    vi.restoreAllMocks();
  });

  const writtenKeys = () => setItem.mock.calls.map((c: unknown[]) => String(c[0])).filter((k: string) => !ALLOWED.has(k));

  it('signed in: settings, checklist, rounds, lines per page, memos, layout and dashboard go to the store', async () => {
    const store = installFakeStore(
      createMemoryArea({ 'nf:studied:777': { videoId: '777', title: 'Show', cover: '', epTitle: '', epSeq: 1, seasonSeq: 1, totalPages: 1, updatedAt: 1 } })
    );
    await exercisePanel(true);

    document.body.innerHTML = '<div id="appMountPoint"></div>';
    setupUI(sentences, '12345');
    togglePanelVisibility();
    toggleOverlayVisibility();
    const divider = document.getElementById('divider')!;
    fireEvent.mouseDown(divider, { clientX: 400 });
    fireEvent.mouseMove(document, { clientX: 420 });
    fireEvent.mouseUp(document);

    cleanup();
    render(<StudyDashboardModal onClose={vi.fn()} />);
    fireEvent.click((await screen.findAllByTitle('학습 기록 삭제'))[0]);
    await act(() => new Promise<void>((r) => setTimeout(r, 400)));

    // 정말 저장했는지(이 테스트가 저장 코드를 지나갔는지) 확인한다.
    await waitFor(() =>
      expect(new Set(store.ops())).toEqual(
        new Set([
          'auth.status',
          'nfSettings.get',
          'nfSettings.set',
          'checklist.get',
          'checklist.set',
          'checklist.delete',
          'itemsPerPage.get',
          'itemsPerPage.set',
          'memos.list',
          'memos.put',
          'memos.reportUnplaced',
          'studied.list',
          'studied.put',
          'studied.delete',
        ])
      )
    );
    expect(writtenKeys()).toEqual([]);
  });

  it('signed out: changing settings stays in memory', async () => {
    installFakeStore(null);
    await exercisePanel(false);
    expect(writtenKeys()).toEqual([]);
  });
});
