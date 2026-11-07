import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookMeta } from '../../../shared/memo/types';
import {
  getPosition,
  listCompletions,
  listMemos,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
} from '../../../shared/storage/repo';
import { KEY } from '../../../shared/storage/keys';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo } from '../../../shared/storage/testFixtures';
import { ReaderEnvProvider } from '../env';
import { BookReader } from './BookReader';
import { BookList } from './BookList';

// 테스트용 책: 길이가 다른 세 장(10자, 84자, 19자, 모두 113자). 글은 직접 쓴 문장이다.
const BOOK_ID = 'bk1';
const CHAPTERS = [
  { id: 'c1', title: 'Preface', paragraphs: ['Tiny note.'] },
  { id: 'c2', title: 'Middle', paragraphs: ['The second chapter is longer than the first one.', 'It has two paragraphs of plain text.'] },
  { id: 'c3', title: 'Ending', paragraphs: ['The end comes soon.'] },
];

const seed = (area: StorageArea, id = BOOK_ID, title = 'Three Lengths') =>
  saveBook(area, { id, title, author: '', createdAt: 1, updatedAt: 1 }, CHAPTERS);

const env = (area: StorageArea) => ({ area, openTab: vi.fn() });

const renderReader = (area: StorageArea, navigate = vi.fn()) =>
  render(
    <ReaderEnvProvider env={env(area)}>
      <BookReader bookId={BOOK_ID} navigate={navigate} />
    </ReaderEnvProvider>
  );

const renderList = (area: StorageArea) =>
  render(
    <ReaderEnvProvider env={env(area)}>
      <BookList navigate={vi.fn()} />
    </ReaderEnvProvider>
  );

const doneIds = async (area: StorageArea) =>
  (await listCompletions(area, BOOK_ID)).filter((c) => c.done).map((c) => c.chapterId).sort();

const chapterCheck = (title: string) => screen.getByRole('checkbox', { name: `${title} 학습 완료` }) as HTMLInputElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('4.1 chapter completion', () => {
  it('4.1-1 (a) a chapter-list check stays on after rendering again', async () => {
    const area = createMemoryArea();
    await seed(area);
    const first = renderReader(area);
    await screen.findByText('Tiny note.');
    fireEvent.click(chapterCheck('Middle'));
    await waitFor(() => expect(chapterCheck('Middle').checked).toBe(true));
    expect(await doneIds(area)).toEqual(['c2']);
    expect(chapterCheck('Middle').closest('li')).toHaveClass('done');
    first.unmount();

    renderReader(area);
    await screen.findByText('Tiny note.');
    expect(chapterCheck('Middle').checked).toBe(true);
    expect(chapterCheck('Preface').checked).toBe(false);
  });

  it('4.1-1 (b) the end-of-text button turns the chapter on and off in storage', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderReader(area);
    await screen.findByText('Tiny note.');
    fireEvent.click(screen.getByRole('button', { name: '이 장 학습 완료' }));
    await waitFor(async () => expect(await doneIds(area)).toEqual(['c1']));
    // 완료한 장의 버튼은 끄는 버튼으로 바뀐다.
    fireEvent.click(await screen.findByRole('button', { name: '학습 완료 취소' }));
    await waitFor(async () => expect(await doneIds(area)).toEqual([]));
    expect(await screen.findByRole('button', { name: '이 장 학습 완료' })).toBeInTheDocument();
  });

  it('4.1-1 (c) "다음 장" opens the next chapter and the last chapter has none', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderReader(area);
    await screen.findByText('Tiny note.');
    fireEvent.click(screen.getByRole('button', { name: /Middle/ }));
    await screen.findByText(CHAPTERS[1].paragraphs[0]);
    fireEvent.click(screen.getByRole('button', { name: '다음 장' }));
    await screen.findByText('The end comes soon.');
    expect(screen.getByRole('heading', { name: 'Ending' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 장' })).toBeNull();
    expect(screen.getByRole('button', { name: '이 장 학습 완료' })).toBeInTheDocument();
  });

  it('4.1-2 scrolling to the end does not complete a chapter, and toggling keeps position and memos', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, bookMemo({ id: 'm1', sourceId: BOOK_ID, chapterId: 'c1', contextText: 'Tiny note.', start: 0, end: 4, quote: 'Tiny' }));
    const { container } = renderReader(area);
    await screen.findByText('note.', { exact: false });
    // 마지막 문단까지 스크롤한 것처럼 꾸민다.
    container.querySelectorAll<HTMLElement>('[data-paragraph-index]').forEach((el) => {
      el.getBoundingClientRect = () => ({ top: 100, bottom: 200 } as DOMRect);
    });
    fireEvent.scroll(window);
    await waitFor(async () => expect(await getPosition(area, BOOK_ID)).not.toBeNull());
    expect(await doneIds(area)).toEqual([]);

    const position = await getPosition(area, BOOK_ID);
    const memos = await listMemos(area);
    fireEvent.click(screen.getByRole('button', { name: '이 장 학습 완료' }));
    await waitFor(async () => expect(await doneIds(area)).toEqual(['c1']));
    fireEvent.click(await screen.findByRole('button', { name: '학습 완료 취소' }));
    await waitFor(async () => expect(await doneIds(area)).toEqual([]));
    expect(await getPosition(area, BOOK_ID)).toEqual(position);
    expect(await listMemos(area)).toEqual(memos);
  });

  it('4.1-3 two tabs completing different chapters alternately keep both', async () => {
    const area = createMemoryArea();
    await seed(area);
    const tabA = renderReader(area);
    const tabB = renderReader(area);
    await waitFor(() => expect(screen.getAllByText('Tiny note.').length).toBe(2));
    const check = (tab: typeof tabA, title: string) =>
      within(tab.container).getByRole('checkbox', { name: `${title} 학습 완료` }) as HTMLInputElement;

    fireEvent.click(check(tabA, 'Preface'));
    await waitFor(async () => expect(await doneIds(area)).toEqual(['c1']));
    fireEvent.click(check(tabB, 'Middle'));
    await waitFor(async () => expect(await doneIds(area)).toEqual(['c1', 'c2']));
    fireEvent.click(check(tabA, 'Ending'));
    await waitFor(async () => expect(await doneIds(area)).toEqual(['c1', 'c2', 'c3']));
    // 다른 탭이 바꾼 장도 화면에 반영된다.
    await waitFor(() => expect(check(tabA, 'Middle').checked).toBe(true));
    await waitFor(() => expect(check(tabB, 'Ending').checked).toBe(true));
  });

  it('4.1-4 a failed save shows the notice and the check matches storage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = createMemoryArea();
    await seed(base);
    await setChapterDone(base, BOOK_ID, 'c2', true, 1);
    const area: StorageArea = { ...base, set: vi.fn().mockRejectedValue(new Error('write failed')) };
    renderReader(area);
    await screen.findByText('Tiny note.');
    fireEvent.click(chapterCheck('Preface'));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다');
    expect(chapterCheck('Preface').checked).toBe(false);
    fireEvent.click(chapterCheck('Middle'));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(chapterCheck('Middle').checked).toBe(true);
    expect(await doneIds(base)).toEqual(['c2']);
  });
});

describe('4.2 progress and continue reading', () => {
  it('4.2-2 the reader progress changes at once and the book list shows the new value', async () => {
    const area = createMemoryArea();
    await seed(area);
    const reader = renderReader(area);
    await screen.findByText('Tiny note.');
    expect(screen.getByText('0% · 3장 중 0장 완료')).toBeInTheDocument();
    fireEvent.click(chapterCheck('Middle'));
    expect(await screen.findByText('74% · 3장 중 1장 완료')).toBeInTheDocument();
    fireEvent.click(chapterCheck('Preface'));
    expect(await screen.findByText('83% · 3장 중 2장 완료')).toBeInTheDocument();
    reader.unmount();

    renderList(area);
    expect(await screen.findByText('83% · 3장 중 2장 완료')).toBeInTheDocument();
  });

  it('4.2-3 the book list says where to continue, or that the book was not read', async () => {
    const area = createMemoryArea();
    await seed(area, 'bk1', 'Read Book');
    await seed(area, 'bk2', 'Unread Book');
    await setPosition(area, { bookId: 'bk1', chapterId: 'c2', paragraphIndex: 1, updatedAt: 2 });
    renderList(area);
    const read = (await screen.findByText('Read Book')).closest('li')!;
    const unread = screen.getByText('Unread Book').closest('li')!;
    expect(within(read).getByText('이어 읽기: 2장 〈Middle〉')).toBeInTheDocument();
    expect(within(unread).getByText('아직 읽지 않음')).toBeInTheDocument();
    // 진행률과 다른 줄이다.
    expect(within(read).getByText('0% · 3장 중 0장 완료')).not.toBe(within(read).getByText('이어 읽기: 2장 〈Middle〉'));
  });

  it('4.2-4 an old book without character counts shows the right progress, and the second list open reads no chapter text', async () => {
    const area = createMemoryArea();
    const saved = await seed(area);
    const old: BookMeta = { ...saved, chapters: saved.chapters.map(({ charCount: _c, ...rest }) => rest) };
    await area.set({ [KEY.book(BOOK_ID)]: old });
    await setChapterDone(area, BOOK_ID, 'c2', true, 1);

    const first = renderList(area);
    expect(await screen.findByText('74% · 3장 중 1장 완료')).toBeInTheDocument();
    first.unmount();

    const get = vi.spyOn(area, 'get');
    const second = renderList(area);
    expect(await screen.findByText('74% · 3장 중 1장 완료')).toBeInTheDocument();
    const keysRead = get.mock.calls.flatMap((call) => call[0] as string[]);
    expect(keysRead.filter((k) => k.startsWith('bookch:'))).toEqual([]);
    second.unmount();

    await area.set({ [KEY.book(BOOK_ID)]: old });
    renderReader(area);
    expect(await screen.findByText('74% · 3장 중 1장 완료')).toBeInTheDocument();
  });

  it('4.2-1 the book list shows a progress bar for each book', async () => {
    const area = createMemoryArea();
    await seed(area);
    await setChapterDone(area, BOOK_ID, 'c2', true, 1);
    const { container } = renderList(area);
    await screen.findByText('74% · 3장 중 1장 완료');
    const fill = container.querySelector('.nfr-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('74%');
  });
});

describe('4.5-2 deleting a book', () => {
  it('removes only that book completion records', async () => {
    const area = createMemoryArea();
    await seed(area, 'bk1', 'First');
    await seed(area, 'bk2', 'Second');
    await setChapterDone(area, 'bk1', 'c1', true, 1);
    await setChapterDone(area, 'bk2', 'c3', true, 1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList(area);
    fireEvent.click(await screen.findByRole('button', { name: '「First」 지우기' }));
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    const keys = (await area.getKeys()).sort();
    expect(keys.filter((k) => k.startsWith('done:'))).toEqual(['done:bk2:c3']);
    expect(keys.some((k) => k.includes('bk1'))).toBe(false);
  });
});
