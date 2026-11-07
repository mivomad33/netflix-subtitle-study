import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMemo, putMemo, saveBook, setUnplacedNetflixMemos } from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { ReaderEnvProvider } from '../env';
import { MemoCollection } from './MemoCollection';

// 테스트용 책. 글은 직접 쓴 문장이다.
const PARAGRAPH = 'The kettle sang on the old stove.';
const seedBook = (area: StorageArea) =>
  saveBook(area, { id: 'bk1', title: 'Kitchen Tales', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'c1', title: 'Morning Tea', paragraphs: [PARAGRAPH] },
  ]);

const renderCollection = (area: StorageArea, openTab = vi.fn(), navigate = vi.fn()) =>
  render(
    <ReaderEnvProvider env={{ area, openTab }}>
      <MemoCollection navigate={navigate} />
    </ReaderEnvProvider>
  );

const card = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-memo-card="${id}"]`) as HTMLElement;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MemoCollection', () => {
  // 4.5-1
  it('4.5-1 넷플릭스 메모 둘과 원서 메모 하나가 고친 시각이 최근인 것부터 나오고, 출처(영상 제목과 회차 / 책 제목과 장 이름)가 보인다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, netflixMemo({ id: 'n-old', updatedAt: 1000, note: 'oldest note' }));
    await putMemo(
      area,
      netflixMemo({
        id: 'n-new',
        sourceId: 'v2',
        updatedAt: 3000,
        videoTitle: 'Harbor Days',
        seasonSeq: 2,
        episodeSeq: 5,
        episodeTitle: 'Low Tide',
        note: 'newest note',
      })
    );
    await putMemo(area, bookMemo({ id: 'b-mid', sourceId: 'bk1', updatedAt: 2000 }));
    const { container } = renderCollection(area);

    await screen.findByText('newest note');
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[data-memo-card]')).map(
      (el) => el.dataset.memoCard
    );
    expect(ids).toEqual(['n-new', 'b-mid', 'n-old']);

    const sourceOf = (id: string) => card(container, id).querySelector('.nfr-memo-source')!.textContent;
    expect(sourceOf('n-new')).toBe('Harbor Days · 시즌 2 5화 Low Tide');
    expect(sourceOf('n-old')).toBe('Test Show · 시즌 1 2화 Pilot');
    expect(sourceOf('b-mid')).toBe('Kitchen Tales · Morning Tea');
    // 고른 글, 메모 글, 출처 원문도 보인다.
    const bookCard = card(container, 'b-mid');
    expect(within(bookCard).getByText('a pot for boiling water')).toBeInTheDocument();
    expect(bookCard.querySelector('.nfr-memo-quote')).toHaveTextContent('kettle');
    expect(bookCard.querySelector('.nfr-memo-context')).toHaveTextContent(PARAGRAPH);
  });

  // 4.5-4
  it('4.5-4 모아 보기에서 고친 메모 글이 저장소에 저장된다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, bookMemo({ sourceId: 'bk1', note: '' }));
    renderCollection(area);

    fireEvent.click(await screen.findByRole('button', { name: '메모 고치기' }));
    const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
    expect(textarea.rows).toBeGreaterThanOrEqual(6);
    fireEvent.change(textarea, { target: { value: 'boils water for tea' } });

    await waitFor(async () => expect((await getMemo(area, 'b1'))?.note).toBe('boils water for tea'));
    expect(screen.getAllByText('boils water for tea').length).toBeGreaterThan(0);
  });

  // 4.5-4
  it('4.5-4 메모 글이 있는 메모를 지울 때 확인을 받고, 확인하면 저장소와 목록에서 사라진다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, bookMemo({ sourceId: 'bk1', note: 'has a note' }));
    await putMemo(area, netflixMemo({ id: 'n1', note: '', updatedAt: 0 }));
    const { container } = renderCollection(area);
    await screen.findByText('has a note');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(within(card(container, 'b1')).getByRole('button', { name: '지우기' }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(card(container, 'b1')).not.toBeNull();
    expect(await getMemo(area, 'b1')).not.toBeNull();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(within(card(container, 'b1')).getByRole('button', { name: '지우기' }));
    await waitFor(async () => expect(await getMemo(area, 'b1')).toBeNull());
    expect(card(container, 'b1')).toBeNull();

    // 메모 글이 없는 메모는 묻지 않고 지운다.
    confirmSpy.mockClear();
    fireEvent.click(within(card(container, 'n1')).getByRole('button', { name: '지우기' }));
    await waitFor(async () => expect(await getMemo(area, 'n1')).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(card(container, 'n1')).toBeNull();
  });

  // 4.5-6
  it('4.5-6 넷플릭스 메모의 "원래 위치로"는 그 영상의 대사 시작 시각 주소로 새 탭을 연다', async () => {
    const area = createMemoryArea();
    await putMemo(area, netflixMemo({ id: 'n1', sourceId: '81234567', sentenceStartMs: 83_900 }));
    const openTab = vi.fn();
    renderCollection(area, openTab);

    fireEvent.click(await screen.findByRole('button', { name: '원래 위치로' }));
    expect(openTab).toHaveBeenCalledWith('https://www.netflix.com/watch/81234567?t=83');
  });

  // 4.5-7
  it('4.5-7 학습 패널이 대사를 찾지 못했다고 남긴 넷플릭스 메모는 "위치를 찾지 못함"이 붙고 그 영상 처음을 연다', async () => {
    const area = createMemoryArea();
    await putMemo(area, netflixMemo({ id: 'n-lost', sourceId: '81234567', sentenceStartMs: 83_900 }));
    await putMemo(area, netflixMemo({ id: 'n-ok', sourceId: '81234567', sentenceStartMs: 12_000, updatedAt: 0 }));
    await setUnplacedNetflixMemos(area, '81234567', ['n-lost']);
    const openTab = vi.fn();
    const { container } = renderCollection(area, openTab);

    await waitFor(() => expect(container.querySelectorAll('[data-memo-card]')).toHaveLength(2));
    expect(within(card(container, 'n-lost')).getByText('위치를 찾지 못함')).toBeInTheDocument();
    expect(within(card(container, 'n-ok')).queryByText('위치를 찾지 못함')).toBeNull();

    fireEvent.click(within(card(container, 'n-lost')).getByRole('button', { name: '영상 열기' }));
    expect(openTab).toHaveBeenCalledWith('https://www.netflix.com/watch/81234567');
  });

  // 4.5-2
  it('4.5-2 검색 결과가 없으면 "조건에 맞는 메모가 없습니다" 안내가 보인다', async () => {
    const area = createMemoryArea();
    await seedBook(area);
    await putMemo(area, bookMemo({ sourceId: 'bk1' }));
    await putMemo(area, netflixMemo());
    const { container } = renderCollection(area);
    await screen.findByText('a pot for boiling water');

    fireEvent.change(screen.getByRole('searchbox', { name: '메모 검색' }), { target: { value: 'KETTLE' } });
    expect(container.querySelectorAll('[data-memo-card]')).toHaveLength(1);
    expect(screen.queryByText(/조건에 맞는 메모가 없습니다/)).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: '메모 검색' }), { target: { value: 'zebra-crossing' } });
    expect(await screen.findByText(/조건에 맞는 메모가 없습니다/)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-memo-card]')).toHaveLength(0);
  });
});
