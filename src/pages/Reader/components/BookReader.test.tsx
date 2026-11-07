import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Memo } from '../../../shared/memo/types';
import {
  getMemo,
  getPosition,
  getReaderSettings,
  listMemos,
  putMemo,
  saveBook,
} from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { handleBridgeRequest } from '../../../shared/bridge/handler';
import { BRIDGE_REQUEST, parseBridgeRequest } from '../../../shared/bridge/protocol';
import { ReaderEnvProvider } from '../env';
import { BookReader } from './BookReader';
import { BookList } from './BookList';

// 테스트용 책. 글은 직접 쓴 문장이다.
const BOOK_ID = 'bk1';
const CH1 = [
  'The lamp glowed over a quiet desk.',
  'A cat slept beside the warm window.',
  'Rain tapped softly on the roof.',
];
const CH2 = [
  'Two begins with a walk by the river.',
  'Two continues past the old mill.',
  'Two crosses a narrow wooden bridge.',
  'Two pauses at a bench in the park.',
  'Two notices a heron on the bank.',
  'Two ends when the bell rings at noon.',
];
const CH3 = ['Three is short and quiet.'];

const seedBook = (area: StorageArea) =>
  saveBook(
    area,
    { id: BOOK_ID, title: 'Lamp and River', author: 'Test Author', createdAt: 1, updatedAt: 1 },
    [
      { id: 'c1', title: 'Opening Night', paragraphs: CH1 },
      { id: 'c2', title: 'Second Wind', paragraphs: CH2 },
      { id: 'c3', title: 'Last Light', paragraphs: CH3 },
    ]
  );

const memoOn = (overrides: Partial<Memo> = {}): Memo =>
  bookMemo({
    id: 'm1',
    sourceId: BOOK_ID,
    chapterId: 'c1',
    paragraphIndex: 0,
    contextText: CH1[0],
    start: 4,
    end: 8,
    quote: 'lamp',
    note: '',
    ...overrides,
  });

const renderReader = (area: StorageArea, props: Partial<React.ComponentProps<typeof BookReader>> = {}) =>
  render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
      <BookReader bookId={BOOK_ID} navigate={vi.fn()} {...props} />
    </ReaderEnvProvider>
  );

const paragraphText = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-paragraph-index="${index}"] p.annotatable`) as HTMLElement;

const selectRange = (startNode: Node, startOffset: number, endNode: Node, endOffset: number) => {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
};
const selectText = (node: Node, start: number, end: number) => selectRange(node, start, node, end);

// 본문 문단이 그려진 뒤의 하이라이트. 장 메모 목록은 본문보다 먼저 그려지므로 글자로 찾지 않는다.
const findMark = (container: HTMLElement, id: string) =>
  waitFor(() => {
    const mark = container.querySelector(`mark[data-memo-id="${id}"]`);
    expect(mark).not.toBeNull();
    return mark as HTMLElement;
  });

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BookReader', () => {
  // 4.4-1
  it('4.4-1 장 셋인 책에서 두 번째 장을 누르면 그 장의 첫 문단이 보이고 첫 장 문단은 보이지 않는다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    renderReader(area);

    expect(await screen.findByText(CH1[0])).toBeInTheDocument();
    const chapterNav = screen.getByRole('navigation', { name: '장 목록' });
    fireEvent.click(within(chapterNav).getByRole('button', { name: /Second Wind/ }));

    expect(await screen.findByText(CH2[0])).toBeInTheDocument();
    expect(screen.queryByText(CH1[0])).toBeNull();
    expect(screen.getByRole('heading', { name: 'Second Wind' })).toBeInTheDocument();
  });

  describe('4.4-2 원서 문단의 하이라이트·메모 (SentenceList.test.tsx와 같은 시나리오)', () => {
    // 4.4-2
    it('4.4-2 글을 고르면 도구막대가 뜨고, 하이라이트는 앞뒤 공백을 뺀 위치·고른 글·장·문단으로 저장된다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      const { container } = renderReader(area);
      await screen.findByText(CH1[0]);

      const p = paragraphText(container, 0);
      // " lamp " 를 골라도 공백은 빼고 "lamp"만 저장한다.
      selectText(p.firstChild!, 3, 9);
      fireEvent.mouseUp(p);
      fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));

      await waitFor(async () => expect(await listMemos(area)).toHaveLength(1));
      const [saved] = await listMemos(area);
      expect(saved).toMatchObject({
        kind: 'book',
        sourceId: BOOK_ID,
        chapterId: 'c1',
        paragraphIndex: 0,
        contextText: CH1[0],
        start: 4,
        end: 8,
        quote: 'lamp',
        note: '',
      });
      expect(container.querySelector('mark')).toHaveTextContent('lamp');
      expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
      expect(screen.queryByLabelText('메모')).toBeNull();
    });

    // 4.4-2
    it('4.4-2 메모 버튼은 만들자마자 6줄 이상인 메모 영역을 열고, 고른 글을 인용하며, 쓴 글을 자동 저장한다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      const { container } = renderReader(area);
      await screen.findByText(CH1[1]);

      const p = paragraphText(container, 1);
      selectText(p.firstChild!, 0, 5);
      fireEvent.mouseUp(p);
      fireEvent.click(screen.getByRole('button', { name: '메모' }));

      const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.rows).toBeGreaterThanOrEqual(6);
      expect(container.querySelector('.annotation-editor-quote')).toHaveTextContent('A cat');

      fireEvent.change(textarea, { target: { value: 'line 1\nline 2' } });
      await waitFor(async () => {
        const memos = await listMemos(area);
        expect(memos).toHaveLength(1);
        expect(memos[0]).toMatchObject({ quote: 'A cat', paragraphIndex: 1, note: 'line 1\nline 2' });
      });
    });

    // 4.4-2
    it('4.4-2 이미 칠한 곳과 겹치게 고르면 새로 칠하지 않고 그 하이라이트의 메모 영역을 연다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      await putMemo(area, memoOn());
      const { container } = renderReader(area);
      await findMark(container, 'm1');

      // 겹치지 않는 곳은 도구막대가 뜬다.
      const p = paragraphText(container, 0);
      selectText(p.firstChild!, 0, 3);
      fireEvent.mouseUp(p);
      expect(screen.getByRole('button', { name: '하이라이트' })).toBeInTheDocument();

      const mark = container.querySelector('mark[data-memo-id="m1"]')!;
      selectText(mark.firstChild!, 0, 3);
      fireEvent.mouseUp(mark);

      expect(await screen.findByLabelText('메모')).toBeInTheDocument();
      expect(container.querySelector('.annotation-editor-quote')).toHaveTextContent('lamp');
      expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
      expect(await listMemos(area)).toHaveLength(1);
    });

    // 4.4-2
    it('4.4-2 메모가 있는 하이라이트는 has-note로 표시되고, 칠한 곳을 누르면 메모 영역이 열린다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      await putMemo(area, memoOn({ note: 'a light source' }));
      await putMemo(
        area,
        memoOn({ id: 'm2', paragraphIndex: 1, contextText: CH1[1], start: 2, end: 5, quote: 'cat', note: '' })
      );
      const { container } = renderReader(area);
      await findMark(container, 'm1');

      const withNote = container.querySelector('mark[data-memo-id="m1"]')!;
      const withoutNote = container.querySelector('mark[data-memo-id="m2"]')!;
      expect(withNote).toHaveClass('has-note');
      expect(withoutNote).not.toHaveClass('has-note');
      expect(paragraphText(container, 0)).toHaveTextContent(CH1[0]);

      fireEvent.click(withNote);
      const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
      expect(textarea.value).toBe('a light source');
    });

    // 4.4-2
    it('4.4-2 메모가 있는 하이라이트를 지울 때 확인을 받고, 취소하면 남고 확인하면 저장소에서 지워진다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      await putMemo(area, memoOn({ note: 'keep me' }));
      const { container } = renderReader(area);
      fireEvent.click(await findMark(container, 'm1'));
      await screen.findByLabelText('메모');

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      fireEvent.click(screen.getByRole('button', { name: '하이라이트 지우기' }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(container.querySelector('mark[data-memo-id="m1"]')).not.toBeNull();
      expect(await getMemo(area, 'm1')).not.toBeNull();

      confirmSpy.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: '하이라이트 지우기' }));
      await waitFor(async () => expect(await getMemo(area, 'm1')).toBeNull());
      expect(container.querySelector('mark[data-memo-id="m1"]')).toBeNull();
      expect(screen.queryByLabelText('메모')).toBeNull();
    });

    // 4.4-2
    it('4.4-2 메모 영역에서 Esc를 누르면 닫힌다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      await putMemo(area, memoOn());
      const { container } = renderReader(area);
      fireEvent.click(await findMark(container, 'm1'));
      const textarea = await screen.findByLabelText('메모');

      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByLabelText('메모')).toBeNull();
    });

    // 4.4-2
    it('4.4-2 두 문단에 걸친 선택에는 도구막대가 뜨지 않는다', async () => {
      const area = createMemoryArea();
      await seedBook(area);
      const { container } = renderReader(area);
      await screen.findByText(CH1[1]);

      const first = paragraphText(container, 0);
      const second = paragraphText(container, 1);
      // 같은 문단 안에서는 뜨는 것을 먼저 본다.
      selectText(first.firstChild!, 4, 8);
      fireEvent.mouseUp(first);
      expect(screen.getByRole('button', { name: '하이라이트' })).toBeInTheDocument();

      selectRange(first.firstChild!, 4, second.firstChild!, 5);
      fireEvent.mouseUp(screen.getByTestId('reader-body'));
      expect(screen.queryByRole('button', { name: '하이라이트' })).toBeNull();
      expect(screen.queryByRole('button', { name: '메모' })).toBeNull();
    });
  });

  // 4.4-4
  it('4.4-4 메모 둘인 장에서 목록 두 번째 항목을 누르면 그 하이라이트로 스크롤하고 메모 영역이 열린다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, memoOn({ note: 'first note' }));
    await putMemo(
      area,
      memoOn({ id: 'm2', paragraphIndex: 2, contextText: CH1[2], start: 0, end: 4, quote: 'Rain', note: 'second note' })
    );
    const { container } = renderReader(area);
    await findMark(container, 'm1');

    const aside = screen.getByRole('complementary', { name: /이 장의 메모/ });
    const items = within(aside).getAllByRole('button');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Rain');
    expect(items[1]).toHaveTextContent('second note');

    scrollIntoView.mockClear();
    fireEvent.click(items[1]);

    const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('second note');
    const mark = container.querySelector('mark[data-memo-id="m2"]');
    expect(scrollIntoView.mock.contexts).toContain(mark);
  });

  // 4.4-4
  it('4.4-4 메모가 없는 장에서는 이 장의 메모 목록에 빈 안내가 보인다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, memoOn());
    renderReader(area, { initialChapterId: 'c3' });
    await screen.findByText(CH3[0]);

    const aside = screen.getByRole('complementary', { name: /이 장의 메모/ });
    expect(within(aside).getByText(/아직 메모가 없습니다/)).toBeInTheDocument();
    expect(within(aside).queryAllByRole('button')).toHaveLength(0);
  });

  // 4.4-5
  it('4.4-5 메모 영역에서 누른 키는 window의 keydown 처리기에 닿지 않는다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, memoOn());
    const { container } = renderReader(area);
    fireEvent.click(await findMark(container, 'm1'));
    const textarea = await screen.findByLabelText('메모');

    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    try {
      fireEvent.keyDown(textarea, { key: ' ', code: 'Space' });
      fireEvent.keyDown(textarea, { key: 'ArrowLeft', code: 'ArrowLeft' });
      fireEvent.keyDown(textarea, { key: 'f', code: 'KeyF' });
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydown);
    }
  });

  // 4.4-6
  it('4.4-6 두 번째 장의 다섯 번째 문단을 보다가 닫고 다시 열면 그 장이 열리고 그 문단으로 스크롤하며, 책 목록에 2/3장이 보인다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    const first = renderReader(area);
    await screen.findByText(CH1[0]);
    fireEvent.click(screen.getByRole('button', { name: /Second Wind/ }));
    await screen.findByText(CH2[0]);

    // 다섯 번째 문단(위치 4)이 화면 맨 위에 걸친 것처럼 꾸민다.
    first.container.querySelectorAll<HTMLElement>('[data-paragraph-index]').forEach((el) => {
      const index = Number(el.dataset.paragraphIndex);
      const bottom = index < 4 ? 10 : 300 + index * 50;
      el.getBoundingClientRect = () => ({ bottom, top: bottom - 40 } as DOMRect);
    });
    fireEvent.scroll(window);
    await waitFor(async () =>
      expect(await getPosition(area, BOOK_ID)).toMatchObject({ chapterId: 'c2', paragraphIndex: 4 })
    );
    first.unmount();

    scrollIntoView.mockClear();
    const second = renderReader(area);
    await screen.findByText(CH2[0]);
    expect(screen.getByRole('heading', { name: 'Second Wind' })).toBeInTheDocument();
    const target = second.container.querySelector('[data-paragraph-index="4"]');
    expect(target).toHaveTextContent(CH2[4]);
    expect(scrollIntoView.mock.contexts).toContain(target);
    second.unmount();

    render(
      <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
        <BookList navigate={vi.fn()} />
      </ReaderEnvProvider>
    );
    expect(await screen.findByText('2/3장')).toBeInTheDocument();
  });

  // 4.4-7
  it('4.4-7 글자 크기를 바꾸고 다시 렌더링해도 같은 크기가 보이고 본문에 적용된다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    const first = renderReader(area);
    await screen.findByText(CH1[0]);
    expect(screen.getByText('14pt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }));
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }));
    expect(screen.getByText('16pt')).toBeInTheDocument();
    await waitFor(async () => expect((await getReaderSettings(area)).fontSize).toBe(16));
    first.unmount();

    renderReader(area);
    await screen.findByText(CH1[0]);
    expect(screen.getByText('16pt')).toBeInTheDocument();
    expect(screen.getByTestId('reader-body')).toHaveStyle({ fontSize: '16pt' });
  });

  // 4.8-4
  describe('4.8-4 저장소 쓰기 실패', () => {
    const failingArea = async () => {
      const base = createMemoryArea();
      await seedBook(base);
      await putMemo(base, memoOn({ note: 'old note' }));
      const area: StorageArea = { ...base, set: vi.fn().mockRejectedValue(new Error('write failed')) };
      return area;
    };

    // 4.8-4
    it('4.8-4 메모를 새로 만들다 저장에 실패하면 "저장하지 못했습니다" 안내가 보이고 쓴 글이 남는다', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const area = await failingArea();
      const { container } = renderReader(area);
      await screen.findByText(CH1[1]);

      const p = paragraphText(container, 1);
      selectText(p.firstChild!, 2, 5);
      fireEvent.mouseUp(p);
      fireEvent.click(screen.getByRole('button', { name: '메모' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다');
      const textarea = screen.getByLabelText('메모') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'typed while offline' } });
      await act(async () => {});
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했습니다');
      expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('typed while offline');
    });

    // 4.8-4
    it('4.8-4 기존 메모를 고치다 저장에 실패하면 "저장하지 못했습니다" 안내가 보이고 쓴 글이 남는다', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const area = await failingArea();
      const { container } = renderReader(area);
      fireEvent.click(await findMark(container, 'm1'));
      const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
      expect(screen.queryByRole('alert')).toBeNull();

      fireEvent.change(textarea, { target: { value: 'old note, edited' } });
      expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다');
      expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('old note, edited');
    });
  });

  // 4.1-6
  it('4.1-6 리더 쪽과 넷플릭스 쪽이 같은 저장소에 서로 다른 메모를 번갈아 저장해도 모두 남는다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    const { container } = renderReader(area);
    await screen.findByText(CH1[0]);
    const openPage = vi.fn();
    // 넷플릭스 페이지가 보낸 메시지를 content script가 받는 경로 그대로 처리한다.
    const netflixPut = (memo: Memo) =>
      handleBridgeRequest(
        area,
        parseBridgeRequest({ channel: BRIDGE_REQUEST, requestId: memo.id, op: 'memos.put', memo })!,
        openPage
      );

    // 리더 탭: 첫 번째 하이라이트
    let p = paragraphText(container, 0);
    selectText(p.firstChild!, 4, 8);
    fireEvent.mouseUp(p);
    fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
    await waitFor(async () => expect(await listMemos(area)).toHaveLength(1));

    // 넷플릭스 탭: 메모 하나
    expect(await netflixPut(netflixMemo({ id: 'n1' }))).toEqual({ ok: true });

    // 리더 탭: 두 번째 하이라이트
    p = paragraphText(container, 2);
    selectText(p.firstChild!, 0, 4);
    fireEvent.mouseUp(p);
    fireEvent.click(screen.getByRole('button', { name: '하이라이트' }));
    await waitFor(async () => expect(await listMemos(area)).toHaveLength(3));

    // 넷플릭스 탭: 메모 하나 더
    expect(await netflixPut(netflixMemo({ id: 'n2', quote: 'Good', start: 0, end: 4 }))).toEqual({ ok: true });

    const memos = await listMemos(area);
    expect(memos).toHaveLength(4);
    expect(memos.filter((m) => m.kind === 'netflix').map((m) => m.id).sort()).toEqual(['n1', 'n2']);
    expect(memos.filter((m) => m.kind === 'book').map((m) => m.quote).sort()).toEqual(['Rain', 'lamp']);
  });
});
