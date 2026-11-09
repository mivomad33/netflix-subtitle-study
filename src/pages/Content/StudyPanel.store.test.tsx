import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyPanel from './StudyPanel';
import { installFakeStore } from './testing/fakeStore';
import { setStoreClient } from './utils/storeClient';
import { createMemoryArea } from '../../shared/storage/storageArea';
import { putMemo } from '../../shared/storage/repo';
import { netflixMemo } from '../../shared/storage/testFixtures';
import { StorageErrorCode } from '../../shared/storage/errors';
import { storageErrorMessage } from '../../shared/ui/storageErrors';

// 넷플릭스 학습 패널과 저장소(브리지)의 관계: 로그인 안내(4.1-2), 다시 읽기(4.2-3), 오류 안내(4.2-6, 4.4-2, 4.4-3).

const sentences = [
  { startTime_ms: 1000, endTime_ms: 2000, text: 'Sentence One', hTranslation: '번역 하나' },
  { startTime_ms: 3000, endTime_ms: 4000, text: 'Sentence Two', hTranslation: '번역 둘' },
];

const donePage = { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true };
const LOGIN_TEXT = /로그인하면 메모·체크리스트·학습 기록이 저장됩니다/;

const renderPanel = (videoId = '12345') =>
  render(
    <StudyPanel
      sentences={sentences}
      videoId={videoId}
      isPanelVisible={true}
      isOverlayVisible={false}
      onTogglePanel={vi.fn()}
      onToggleOverlay={vi.fn()}
    />
  );

const selectFirstWord = (container: HTMLElement) => {
  const textElement = container.querySelectorAll('.sentence-text')[0];
  const range = document.createRange();
  range.setStart(textElement.firstChild!, 0);
  range.setEnd(textElement.firstChild!, 8);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.mouseUp(textElement);
};

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

beforeEach(() => {
  localStorage.clear();
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
  delete (window as any).netflix;
  setStoreClient(null);
  vi.restoreAllMocks();
});

describe('4.1-2 signed out', () => {
  it('shows the subtitle list with default settings and a login notice, and never reads or writes the store', async () => {
    const store = installFakeStore(null);
    const { container } = renderPanel();

    expect(screen.getByText('Sentence One')).toBeInTheDocument();
    expect(await screen.findByText(LOGIN_TEXT)).toBeInTheDocument();
    // 기본 설정: 영어 자막은 가려져 있다.
    expect(container.querySelectorAll('.hide-english').length).toBeGreaterThan(0);
    expect(screen.queryByText('1회차')).toBeNull();

    // 설정을 바꾸면 이 화면에서만 바뀐다.
    fireEvent.click(screen.getByText('💬 영어 자막'));
    expect(screen.getByText('💬 영어 자막').className).toContain('active');
    // 하이라이트를 만들 수 없다(저장되지 않으므로).
    selectFirstWord(container);
    expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
    await sleep(400);

    fireEvent.click(screen.getByRole('button', { name: '로그인 화면 열기' }));
    expect(store.calls).toContainEqual({ op: 'page.open', page: 'reader' });
    expect(store.ops().every((op) => op === 'auth.status' || op === 'page.open')).toBe(true);
  });

  it('4.4-4 shows a waiting indicator while the login state is not known yet', async () => {
    const calls: string[] = [];
    setStoreClient({
      call: (call) => {
        calls.push(call.op);
        return new Promise(() => {});
      },
    });
    renderPanel();
    expect(await screen.findByText('로그인 상태를 확인하는 중…')).toBeInTheDocument();
    expect(screen.getByText('Sentence One')).toBeInTheDocument();
    expect(calls).toEqual(['auth.status']);
  });

  it('switches to the login notice when the service worker says the user signed out', async () => {
    const area = createMemoryArea();
    await putMemo(area, netflixMemo({ id: 'm1', sourceId: '12345', contextText: 'Sentence Two', start: 9, end: 12, quote: 'Two', sentenceStartMs: 3000 }));
    const store = installFakeStore(area);
    const { container } = renderPanel();
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());

    act(() => store.emit({ event: 'auth', signedIn: false }));
    expect(await screen.findByText(LOGIN_TEXT)).toBeInTheDocument();
    expect(container.querySelector('mark')).toBeNull();
  });
});

describe('signed in', () => {
  it('shows the stored settings, checklist, lines per page and memos', async () => {
    const area = createMemoryArea({
      'nf:settings': { isEnglishVisible: true, fontSize: 18 },
      'nf:checklist:12345': { currentActiveRound: 1, rounds: { 1: { 0: donePage } } },
      'nf:itemsPerPage:12345': 20,
    });
    await putMemo(area, netflixMemo({ id: 'm1', sourceId: '12345', contextText: 'Sentence Two', start: 9, end: 12, quote: 'Two', sentenceStartMs: 3000 }));
    installFakeStore(area);
    const { container } = renderPanel();

    expect(await screen.findByText('1회차 🏆')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.queryByText(LOGIN_TEXT)).toBeNull();
    fireEvent.click(screen.getByTitle('학습 환경 설정'));
    expect(screen.getByRole('button', { name: '20' }).className).toContain('active');
  });

  it('saves the whole settings object when a setting changes', async () => {
    const store = installFakeStore();
    renderPanel();
    await screen.findByText('1회차');
    fireEvent.click(screen.getByText('⏱️ 자동 멈춤'));
    fireEvent.click(screen.getByTitle('글자 크기 늘리기'));
    await waitFor(async () =>
      expect((await store.area!.get(['nf:settings']))['nf:settings']).toMatchObject({ isAutoPause: true, fontSize: 15 })
    );
    // 연달아 바꾼 것은 한 번에 저장한다.
    expect(store.ops().filter((op) => op === 'nfSettings.set')).toHaveLength(1);
  });

  it('4.2-3 re-reads the checklist and memos of this video when another place changes them', async () => {
    const store = installFakeStore();
    const { container } = renderPanel();
    await screen.findByText('1회차');

    // 다른 기기에서 쓴 것처럼 저장소에 바로 쓴다.
    await act(async () => {
      await store.area!.set({ 'nf:checklist:12345': { currentActiveRound: 1, rounds: { 1: { 0: donePage } } } });
    });
    expect(await screen.findByText('1회차 🏆')).toBeInTheDocument();

    await act(async () => {
      await putMemo(store.area!, netflixMemo({ id: 'm2', sourceId: '12345', contextText: 'Sentence One', start: 0, end: 8, quote: 'Sentence', sentenceStartMs: 1000 }));
    });
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());

    // 다른 영상의 변경은 다시 읽지 않는다.
    const before = store.ops().length;
    await act(async () => {
      await store.area!.set({ 'nf:checklist:99999': { currentActiveRound: 1, rounds: { 1: {} } } });
    });
    await sleep(20);
    expect(store.ops().slice(before)).not.toContain('checklist.get');
  });

  it("4.2-3 re-reads everything shown on scope 'all' (after the service worker restarted)", async () => {
    const store = installFakeStore(createMemoryArea(), {}, false);
    const { container } = renderPanel();
    await screen.findByText('1회차');
    await store.area!.set({ 'nf:checklist:12345': { currentActiveRound: 1, rounds: { 1: { 0: donePage } } } });
    await putMemo(store.area!, netflixMemo({ id: 'm3', sourceId: '12345', contextText: 'Sentence One', start: 0, end: 8, quote: 'Sentence', sentenceStartMs: 1000 }));
    await sleep(20);
    expect(screen.queryByText('1회차 🏆')).toBeNull();

    act(() => store.emit({ event: 'changed', scope: 'all' }));
    expect(await screen.findByText('1회차 🏆')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
  });
});

describe('4.2-6 storage error notices', () => {
  const codes: StorageErrorCode[] = ['quota-exceeded', 'resource-exhausted', 'unavailable', 'permission-denied', 'unauthenticated'];

  it.each(codes)('shows the %s notice when saving the checklist fails, and keeps the subtitles working', async (code) => {
    installFakeStore(createMemoryArea(), { 'checklist.set': code });
    renderPanel();
    await screen.findByText('1회차');
    fireEvent.click(screen.getByText('사전 학습'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(storageErrorMessage(code));
    // 원래 오류 문구는 보이지 않는다.
    expect(alert.textContent).not.toContain('storage error');
    expect(alert.textContent).not.toContain(code);
    // 무료 한도 안내는 그 오류일 때만 보인다(4.4-2).
    expect(alert.textContent!.includes('오늘 무료 사용량을 다 썼습니다')).toBe(code === 'resource-exhausted');
    expect(!!screen.queryByRole('button', { name: '다시 시도' })).toBe(code === 'resource-exhausted' || code === 'unavailable');
    expect(!!screen.queryByRole('button', { name: '로그인 화면 열기' })).toBe(
      code === 'unauthenticated' || code === 'permission-denied'
    );
    expect(screen.getByText('Sentence One')).toBeInTheDocument();
  });

  it('gives each kind its own wording', () => {
    const messages = codes.map(storageErrorMessage);
    expect(new Set(messages).size).toBe(codes.length);
    expect(storageErrorMessage('quota-exceeded')).toContain('20MB');
    expect(storageErrorMessage('resource-exhausted')).toContain('태평양 시간 자정(한국 시간 오후 4시 또는 5시)');
  });

  it('4.4-2 retries the failed save when the daily free limit comes back', async () => {
    const store = installFakeStore(createMemoryArea(), { 'checklist.set': 'resource-exhausted' });
    renderPanel();
    await screen.findByText('1회차');
    fireEvent.click(screen.getByText('사전 학습'));
    await screen.findByRole('alert');

    delete store.failures['checklist.set'];
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(async () =>
      expect((await store.area!.get(['nf:checklist:12345']))['nf:checklist:12345']).toMatchObject({
        rounds: { 1: { 0: { preStudy: true } } },
      })
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows a notice when the memo save fails', async () => {
    installFakeStore(createMemoryArea(), { 'memos.put': 'quota-exceeded' });
    const { container } = renderPanel();
    await screen.findByText('1회차');
    fireEvent.click(screen.getByText('💬 영어 자막'));
    selectFirstWord(container);
    fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
    expect(await screen.findByText(storageErrorMessage('quota-exceeded'))).toBeInTheDocument();
  });
});
