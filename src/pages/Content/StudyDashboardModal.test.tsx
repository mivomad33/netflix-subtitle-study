import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StudyDashboardModal from './StudyDashboardModal';
import { createMemoryArea } from '../../shared/storage/storageArea';
import { getMemo, putMemo } from '../../shared/storage/repo';
import { netflixMemo } from '../../shared/storage/testFixtures';
import { setStoreClient } from './utils/storeClient';
import { installFakeStore } from './testing/fakeStore';
import { storageErrorMessage } from '../../shared/ui/storageErrors';

const video = (videoId: string, overrides: Record<string, unknown> = {}) => ({
  videoId,
  title: 'Stranger Things',
  cover: 'http://example.com/cover.jpg',
  epTitle: 'Chapter One',
  epSeq: 1,
  seasonSeq: 1,
  totalPages: 10,
  updatedAt: 1000,
  ...overrides,
});

const donePage = { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true };

describe('StudyDashboardModal Component', () => {
  const mockClose = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => setStoreClient(null));

  it('renders empty message when no studied videos exist in the store', async () => {
    installFakeStore();
    render(<StudyDashboardModal onClose={mockClose} />);

    expect(await screen.findByText('아직 학습 중인 영상이 없습니다.')).toBeInTheDocument();
  });

  it('renders studied video card list correctly from the store', async () => {
    installFakeStore(
      createMemoryArea({
        'nf:studied:12345': video('12345'),
        // 페이지 체크리스트 일부 채워두기 (진척도 파싱 검증)
        'nf:checklist:12345': { currentActiveRound: 1, rounds: { 1: { 0: donePage, 1: donePage } } },
      })
    );

    render(<StudyDashboardModal onClose={mockClose} />);

    expect(await screen.findByText('Stranger Things')).toBeInTheDocument();
    expect(screen.getByText('시즌 1 - 1화: Chapter One')).toBeInTheDocument();
    expect(screen.getByText('2 / 10 페이지 완료')).toBeInTheDocument();
    expect(screen.getByText('20% 완료')).toBeInTheDocument(); // 2 / 10 = 20%
  });

  it('deletes studied video when delete button is clicked and confirmed', async () => {
    const store = installFakeStore(
      createMemoryArea({
        'nf:studied:12345': video('12345'),
        'nf:checklist:12345': { currentActiveRound: 1, rounds: { 1: {} } },
      })
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<StudyDashboardModal onClose={mockClose} />);
    fireEvent.click(await screen.findByTitle('학습 기록 삭제'));

    expect(confirmSpy).toHaveBeenCalled();

    // 화면에서 지워지고 저장소에서도 지워졌는지 검증
    await waitFor(() => {
      expect(screen.queryByText('Stranger Things')).toBeNull();
    });
    await waitFor(async () =>
      expect(await store.area!.get(['nf:studied:12345', 'nf:checklist:12345'])).toEqual({})
    );
  });

  it('renders studied video card with multi-round information correctly', async () => {
    installFakeStore(
      createMemoryArea({
        'nf:studied:67890': video('67890', { title: 'Breaking Bad', epTitle: 'Pilot', totalPages: 5 }),
        'nf:checklist:67890': {
          currentActiveRound: 2,
          rounds: { 1: { 0: donePage, 1: donePage, 2: donePage, 3: donePage, 4: donePage }, 2: { 0: donePage } },
        },
      })
    );

    render(<StudyDashboardModal onClose={mockClose} />);

    expect(await screen.findByText('Breaking Bad')).toBeInTheDocument();
    expect(screen.getByText('🏆 1회 완독')).toBeInTheDocument();
    expect(screen.getByText('🔥 2회차 진행 중')).toBeInTheDocument();
    expect(screen.getByText('1 / 5 페이지 완료')).toBeInTheDocument();
  });

  it('keeps the video memos in the shared store when deleting a studied video', async () => {
    const area = createMemoryArea({ 'nf:studied:12345': video('12345', { title: 'Show' }) });
    installFakeStore(area);
    await putMemo(area, netflixMemo({ id: 'm1', sourceId: '12345' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StudyDashboardModal onClose={mockClose} />);
    fireEvent.click(await screen.findByTitle('학습 기록 삭제'));
    await waitFor(() => expect(screen.queryByText('Show')).toBeNull());
    await waitFor(async () => expect(await area.get(['nf:studied:12345'])).toEqual({}));
    expect(await getMemo(area, 'm1')).not.toBeNull();
  });

  it('opens the memo collection and the book reader in a new tab through the content script', async () => {
    const calls: unknown[] = [];
    setStoreClient({
      async call<T>(call: unknown): Promise<T> {
        calls.push(call);
        return undefined as T;
      },
    });
    render(<StudyDashboardModal onClose={mockClose} />);
    fireEvent.click(screen.getByRole('button', { name: '메모 모아 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '원서 리더' }));
    expect(calls).toContainEqual({ op: 'page.open', page: 'memos' });
    expect(calls).toContainEqual({ op: 'page.open', page: 'reader' });
  });

  it('4.1-2 shows a login notice and reads nothing when signed out', async () => {
    const store = installFakeStore(null);
    render(<StudyDashboardModal onClose={mockClose} />);
    expect(await screen.findByText(/로그인하면 메모·체크리스트·학습 기록이 저장됩니다/)).toBeInTheDocument();
    expect(screen.queryByText('아직 학습 중인 영상이 없습니다.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '로그인 화면 열기' }));
    expect(store.ops().every((op) => op === 'auth.status' || op === 'page.open')).toBe(true);
    expect(store.calls).toContainEqual({ op: 'page.open', page: 'reader' });
  });

  it('4.4-4 shows a waiting indicator until the first read finishes', async () => {
    setStoreClient({
      call: (call) =>
        call.op === 'auth.status' ? Promise.resolve({ signedIn: true }) as never : new Promise(() => {}),
    });
    render(<StudyDashboardModal onClose={mockClose} />);
    expect(await screen.findByText('학습 기록을 불러오는 중…')).toBeInTheDocument();
  });

  it('4.2-3 re-reads the list when a studied video changes elsewhere', async () => {
    const store = installFakeStore();
    render(<StudyDashboardModal onClose={mockClose} />);
    await screen.findByText('아직 학습 중인 영상이 없습니다.');
    await act(async () => {
      await store.area!.set({ 'nf:studied:55555': video('55555', { title: 'Other Device Show' }) });
    });
    expect(await screen.findByText('Other Device Show')).toBeInTheDocument();
  });

  it('shows the error notice when the list cannot be read', async () => {
    installFakeStore(createMemoryArea(), { 'studied.list': 'unavailable' });
    render(<StudyDashboardModal onClose={mockClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(storageErrorMessage('unavailable'));
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
