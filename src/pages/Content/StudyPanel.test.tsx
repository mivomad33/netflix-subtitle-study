import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createMemoryArea } from '../../shared/storage/storageArea';
import { createDirectClient } from '../../shared/bridge/directClient';
import { getMemo, getUnplacedNetflixMemoIds, listMemos, putMemo } from '../../shared/storage/repo';
import { netflixMemo } from '../../shared/storage/testFixtures';
import { setStoreClient } from './utils/storeClient';
import { installFakeStore } from './testing/fakeStore';
import { removeLegacyStudyKeys } from './utils/legacyCleanup';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StudyPanel from './StudyPanel';

describe('StudyPanel Main Component', () => {
  const mockSentences = [
    { startTime_ms: 1000, endTime_ms: 2000, text: 'Sentence One', hTranslation: '번역 하나' },
    { startTime_ms: 3000, endTime_ms: 4000, text: 'Sentence Two', hTranslation: '번역 둘' },
  ];

  const mockTogglePanel = vi.fn();
  const mockToggleOverlay = vi.fn();

  let store: ReturnType<typeof installFakeStore>;

  beforeEach(() => {
    localStorage.clear();
    // 기본은 로그인한 상태의 빈 저장소
    store = installFakeStore();
    // 넷플릭스 API 전역 가드 목킹
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
                _metadataObject: {
                  video: {
                    title: 'Test Show',
                    artwork: [],
                    seasons: [],
                  },
                },
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

  it('renders correctly and mounts pagination, control panel, and sentences list', () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    // 문장 리스트가 잘 출력되는지 확인
    expect(screen.getByText('Sentence One')).toBeInTheDocument();
    expect(screen.getByText('Sentence Two')).toBeInTheDocument();

    // 페이지네이션 활성화 체크 (대사 수 50개 기본이므로 1페이지 노출)
    expect(screen.getByText('1')).toBeInTheDocument();

    // 조작 패널 버튼 마운트 확인
    expect(screen.getByText('💬 영어 자막')).toBeInTheDocument();
  });

  it('toggles settings popover when clicking the settings gear icon', () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    // 설정 팝오버는 처음에 보이지 않음
    expect(screen.queryByText('페이지당 대사 수')).toBeNull();

    // 톱니바퀴 설정 아이콘 클릭
    const settingsBtn = screen.getByTitle('학습 환경 설정');
    fireEvent.click(settingsBtn);

    // 설정 팝오버 렌더링 확인
    expect(screen.getByText('페이지당 대사 수')).toBeInTheDocument();
  });

  it('renders round selector dropdown with current rounds', async () => {
    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    expect(await screen.findByText('1회차')).toBeInTheDocument();
  });

  it('shows next round button only when all pages checklist are complete', async () => {
    const fullChecklist = {
      currentActiveRound: 1,
      rounds: {
        1: {
          0: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true }
        }
      }
    };
    await store.area!.set({ 'nf:checklist:12345': fullChecklist });

    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    expect(await screen.findByText('1회차 🏆')).toBeInTheDocument();
    const newRoundBtn = screen.getByText('🚀 2회차 시작');
    expect(newRoundBtn).toBeInTheDocument();

    fireEvent.click(newRoundBtn);
    expect(screen.getByText('2회차')).toBeInTheDocument();
    // 새 회차는 저장소에 쓴다.
    await waitFor(async () =>
      expect((await store.area!.get(['nf:checklist:12345']))['nf:checklist:12345']).toMatchObject({ currentActiveRound: 2 })
    );
  });

  it('triggers reset study progress when clicking reset button and confirming', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <StudyPanel
        sentences={mockSentences}
        videoId="12345"
        isPanelVisible={true}
        isOverlayVisible={false}
        onTogglePanel={mockTogglePanel}
        onToggleOverlay={mockToggleOverlay}
      />
    );

    await screen.findByText('1회차');
    const settingsBtn = screen.getByTitle('학습 환경 설정');
    fireEvent.click(settingsBtn);

    const resetBtn = screen.getByText('현재 영상 학습 초기화');
    fireEvent.click(resetBtn);

    expect(confirmSpy).toHaveBeenCalled();
  });

  describe('memos in the shared store', () => {
    const legacyMemo = {
      id: 'a1',
      sentenceStartMs: 3000,
      sentenceText: 'Sentence Two',
      start: 9,
      end: 12,
      quote: 'Two',
      note: '',
      createdAt: 0,
      updatedAt: 0,
    };
    const storedMemo = netflixMemo({
      id: 'a1',
      sourceId: '12345',
      contextText: 'Sentence Two',
      start: 9,
      end: 12,
      quote: 'Two',
      sentenceStartMs: 3000,
      videoTitle: undefined,
    });
    let area: ReturnType<typeof createMemoryArea>;

    beforeEach(async () => {
      area = createMemoryArea({ 'nf:settings': { isEnglishVisible: true } });
      setStoreClient(createDirectClient(area));
    });

    const renderPanel = () =>
      render(
        <StudyPanel
          sentences={mockSentences}
          videoId="12345"
          isPanelVisible={true}
          isOverlayVisible={false}
          onTogglePanel={mockTogglePanel}
          onToggleOverlay={mockToggleOverlay}
        />
      );

    it('4.7-3 removes old memos from the Netflix localStorage without copying them to the store', async () => {
      localStorage.setItem('NF_annotations_12345', JSON.stringify([legacyMemo]));
      // 넷플릭스 화면이 열릴 때(index.tsx) 하는 정리
      removeLegacyStudyKeys();

      const { container } = renderPanel();
      await screen.findByText('1회차');
      await new Promise((r) => setTimeout(r, 20));
      expect(localStorage.getItem('NF_annotations_12345')).toBeNull();
      expect(container.querySelector('mark')).toBeNull();
      expect(await listMemos(area)).toEqual([]);
    });

    it('edits a stored memo in the shared store', async () => {
      await putMemo(area, storedMemo);

      const { container } = renderPanel();
      await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());

      fireEvent.click(container.querySelector('mark')!);
      fireEvent.change(screen.getByLabelText('메모'), {
        target: { value: 'number two\nsecond line' },
      });

      await waitFor(async () =>
        expect((await getMemo(area, 'a1'))?.note).toBe('number two\nsecond line')
      );
      expect((await getMemo(area, 'a1'))?.videoTitle).toBeUndefined();
    });

    it('saves new memos with the video title', async () => {
      const { container } = renderPanel();
      await screen.findByText('1회차');
      const textElement = container.querySelectorAll('.sentence-text')[0];
      const range = document.createRange();
      range.setStart(textElement.firstChild!, 0);
      range.setEnd(textElement.firstChild!, 8);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      fireEvent.mouseUp(textElement);
      fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));

      await waitFor(async () => expect(await listMemos(area)).toHaveLength(1));
      const [memo] = await listMemos(area);
      expect(memo).toMatchObject({
        kind: 'netflix',
        sourceId: '12345',
        quote: 'Sentence',
        sentenceStartMs: 1000,
        videoTitle: 'Test Show',
      });
    });

    it('keeps a memo made before stored memos finish loading', async () => {
      let releaseList: (() => void) | undefined;
      const direct = createDirectClient(area);
      setStoreClient({
        subscribe: direct.subscribe,
        async call<T>(call: any): Promise<T> {
          // 목록은 새 메모를 저장하기 전에 읽어 두고, 새 메모를 만든 뒤에 돌려준다.
          const result = direct.call<T>(call);
          if (call.op === 'memos.list') {
            await new Promise<void>((resolve) => (releaseList = resolve));
          }
          return result;
        },
      });
      await putMemo(area, storedMemo);

      const { container } = renderPanel();
      // 저장된 메모 목록을 읽기 시작한 뒤, 돌려주기 전에 새 메모를 만든다.
      await waitFor(() => expect(releaseList).toBeDefined());
      const textElement = container.querySelectorAll('.sentence-text')[0];
      const range = document.createRange();
      range.setStart(textElement.firstChild!, 0);
      range.setEnd(textElement.firstChild!, 8);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      fireEvent.mouseUp(textElement);
      fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
      expect(container.querySelectorAll('mark')).toHaveLength(1);

      await act(async () => releaseList!());
      await waitFor(() => expect(container.querySelectorAll('mark')).toHaveLength(2));
    });

    it('4.5-7 records which stored memos match no subtitle line so the collection can mark them', async () => {
      await putMemo(area, netflixMemo({ id: 'placed', sourceId: '12345', contextText: 'Sentence Two', start: 9, end: 12, quote: 'Two', sentenceStartMs: 3000 }));
      await putMemo(area, netflixMemo({ id: 'lost', sourceId: '12345', contextText: 'A line that was cut.', start: 2, end: 6, quote: 'line', sentenceStartMs: 3000 }));
      const { container } = renderPanel();
      await waitFor(() => expect(container.querySelectorAll('mark')).toHaveLength(1));

      await waitFor(async () =>
        expect(Array.from((await getUnplacedNetflixMemoIds(area, ['12345'])).get('12345') ?? [])).toEqual(['lost'])
      );
      // 4.1-5 그리지 못한 메모도 저장소에서 지우지 않는다.
      expect(await getMemo(area, 'lost')).not.toBeNull();
    });

    it('4.5-7 does not report the previous video memos when the panel switches videos', async () => {
      await putMemo(area, netflixMemo({ id: 'lost', sourceId: '12345', contextText: 'A line that was cut.', start: 2, end: 6, quote: 'line' }));
      const props = { isPanelVisible: true, isOverlayVisible: false, onTogglePanel: mockTogglePanel, onToggleOverlay: mockToggleOverlay };
      const { rerender } = render(<StudyPanel sentences={mockSentences} videoId="12345" {...props} />);
      await waitFor(async () => expect((await getUnplacedNetflixMemoIds(area, ['12345'])).get('12345')?.size).toBe(1));

      rerender(<StudyPanel sentences={[{ ...mockSentences[0], text: 'Other show line' }]} videoId="67890" {...props} />);
      await new Promise((r) => setTimeout(r, 50));
      expect((await getUnplacedNetflixMemoIds(area, ['67890'])).get('67890')?.size ?? 0).toBe(0);
    });

    it('keeps memos after resetting progress or changing lines per page', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await putMemo(area, storedMemo);
      const { container } = renderPanel();
      await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
      await screen.findByText('1회차');

      fireEvent.click(screen.getByTitle('학습 환경 설정'));
      fireEvent.click(screen.getByText('현재 영상 학습 초기화'));
      fireEvent.click(screen.getByRole('button', { name: '20' }));

      expect(await getMemo(area, 'a1')).not.toBeNull();
    });
  });
});
