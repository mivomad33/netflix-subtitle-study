import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getChapterParagraphs, listBooks } from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { ReaderEnvProvider } from '../env';
import { BookImport } from './BookImport';
import { BookList } from './BookList';

// 테스트용 본문. 글은 직접 쓴 문장이다.
const BOOK_TEXT = [
  'A short note before the story begins.',
  '',
  'Chapter 1',
  '',
  'First chapter opens here.',
  '',
  'Second paragraph of one.',
  '',
  'Chapter 2',
  '',
  'Opening of two.',
  '',
  'More of two.',
  '',
  'Chapter 3',
  '',
  'Opening of three.',
  '',
  'Last line of three.',
].join('\n');

const renderImport = (area: StorageArea, navigate = vi.fn()) =>
  render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
      <BookImport navigate={navigate} />
    </ReaderEnvProvider>
  );

const titleInput = () => screen.getByRole('textbox', { name: /책 제목/ });
const bodyInput = () => screen.getByRole('textbox', { name: /본문/ });

const previewItems = () => {
  const list = screen.getByRole('region', { name: /미리 보기/ }).querySelector('.nfr-preview-list')!;
  return within(list as HTMLElement).getAllByRole('listitem').filter((li) => li.classList.contains('nfr-preview-chapter'));
};

describe('BookImport', () => {
  // 4.3-1
  it('4.3-1 제목 없이, 본문 없이 저장하면 막히고 무엇이 비었는지 보이며, 둘 다 넣으면 책 목록에 나온다', async () => {
    const area = createMemoryArea();
    const navigate = vi.fn();
    const view = renderImport(area, navigate);

    // 제목 없이
    fireEvent.change(bodyInput(), { target: { value: 'Only a body here.' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('책 제목을 넣으세요.')).toBeInTheDocument();
    expect(screen.queryByText('본문을 붙여 넣으세요.')).toBeNull();
    expect(await listBooks(area)).toHaveLength(0);

    // 본문 없이
    fireEvent.change(titleInput(), { target: { value: 'Quiet Harbor' } });
    fireEvent.change(bodyInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('본문을 붙여 넣으세요.')).toBeInTheDocument();
    expect(screen.queryByText('책 제목을 넣으세요.')).toBeNull();
    expect(await listBooks(area)).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();

    // 둘 다
    fireEvent.change(bodyInput(), { target: { value: 'The harbor was calm at night.' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ name: 'book' })));
    const books = await listBooks(area);
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Quiet Harbor');
    view.unmount();

    render(
      <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
        <BookList navigate={vi.fn()} />
      </ReaderEnvProvider>
    );
    expect(await screen.findByText('Quiet Harbor')).toBeInTheDocument();
  });

  // 4.3-4
  it('4.3-4 미리 보기에서 나눈 곳 하나를 빼고, 한 곳을 더하고, 장 이름을 바꾼 뒤 저장하면 저장된 책의 장 개수·이름·첫 문단이 미리 보기와 같다', async () => {
    const area = createMemoryArea();
    const navigate = vi.fn();
    renderImport(area, navigate);
    fireEvent.change(titleInput(), { target: { value: 'Three Doors' } });
    fireEvent.change(bodyInput(), { target: { value: BOOK_TEXT } });
    fireEvent.click(screen.getByRole('button', { name: '미리 보기' }));

    // 앞부분(머리말) + 세 장
    await screen.findByRole('region', { name: /미리 보기 · 장 4개/ });
    expect(
      previewItems().map((li) => (within(li).getByRole('textbox') as HTMLInputElement).value)
    ).toEqual(['앞부분', 'Chapter 1', 'Chapter 2', 'Chapter 3']);

    // 나눈 곳 빼기: Chapter 3(4번째 장)을 Chapter 2에 합친다.
    fireEvent.click(screen.getByRole('button', { name: '4번째 장을 앞 장과 합치기' }));
    await screen.findByRole('region', { name: /미리 보기 · 장 3개/ });

    // 나눌 곳 더하기: Chapter 1(2번째 장)을 펼쳐 "Second paragraph of one."부터 새 장으로 나눈다.
    fireEvent.click(within(previewItems()[1]).getByRole('button', { name: '문단 펼치기' }));
    fireEvent.click(screen.getByRole('button', { name: '4번째 문단부터 새 장 시작' }));
    await screen.findByRole('region', { name: /미리 보기 · 장 4개/ });

    // 장 이름 바꾸기: 머리말과 새로 나눈 장
    fireEvent.change(screen.getByRole('textbox', { name: '1번째 장 이름' }), { target: { value: 'Foreword' } });
    fireEvent.change(screen.getByRole('textbox', { name: '3번째 장 이름' }), { target: { value: 'Interlude' } });

    const expected = {
      titles: ['Foreword', 'Chapter 1', 'Interlude', 'Chapter 2'],
      firsts: ['A short note before the story begins.', 'First chapter opens here.', 'Second paragraph of one.', 'Opening of two.'],
    };
    const items = previewItems();
    expect(items.map((li) => (within(li).getByRole('textbox') as HTMLInputElement).value)).toEqual(expected.titles);
    expect(items.map((li) => li.querySelector('.nfr-preview-first')!.textContent)).toEqual(expected.firsts);

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [book] = await listBooks(area);
    expect(book.chapters.map((c) => c.title)).toEqual(expected.titles);
    const firsts = await Promise.all(
      book.chapters.map(async (c) => (await getChapterParagraphs(area, book.id, c.id))[0])
    );
    expect(firsts).toEqual(expected.firsts);
    // 합친 장에는 Chapter 3의 문단까지 들어 있다.
    const merged = await getChapterParagraphs(area, book.id, book.chapters[3].id);
    expect(merged).toEqual(['Opening of two.', 'More of two.', 'Chapter 3', 'Opening of three.', 'Last line of three.']);
  });

  // 4.3-2
  it('4.3-2 본문 정리는 기본으로 켜져 있고, 미리 보기를 연 채 끄면 줄바꿈이 문단을 나눈 미리 보기로 바뀐다', async () => {
    const area = createMemoryArea();
    renderImport(area);
    const checkbox = screen.getByRole('checkbox', { name: /본문 정리/ });
    expect(checkbox).toBeChecked();

    fireEvent.change(bodyInput(), {
      target: { value: 'The fog rolled in\nacross the bay.\n\nA boat waited by\nthe dock.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '미리 보기' }));
    expect(await screen.findByRole('region', { name: /문단 2개/ })).toBeInTheDocument();
    expect(screen.getByText('The fog rolled in across the bay.')).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(await screen.findByRole('region', { name: /문단 4개/ })).toBeInTheDocument();
    expect(screen.queryByText('The fog rolled in across the bay.')).toBeNull();
    expect(screen.getByText('The fog rolled in')).toBeInTheDocument();
  });
});
