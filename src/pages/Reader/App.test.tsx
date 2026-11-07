import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemo, putMemo, saveBook } from '../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../shared/storage/storageArea';
import { bookMemo } from '../../shared/storage/testFixtures';
import { ReaderEnvProvider } from './env';
import App from './App';

// 테스트용 책. 글은 직접 쓴 문장이다.
const CH1 = ['The garden gate creaked open.'];
const CH2 = ['A robin hopped along the fence.', 'The kettle sang on the old stove.'];

const seed = async (area: StorageArea) => {
  await saveBook(area, { id: 'bk1', title: 'Garden Notes', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'c1', title: 'Gate', paragraphs: CH1 },
    { id: 'c2', title: 'Fence', paragraphs: CH2 },
  ]);
};

const renderApp = (area: StorageArea, hash: string) => {
  window.location.hash = hash;
  return render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
      <App />
    </ReaderEnvProvider>
  );
};

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('Reader App', () => {
  // 4.5-5
  it('4.5-5 모아 보기에서 원서 메모의 "원래 위치로"를 누르면 리더가 그 장을 열고 그 하이라이트로 스크롤해 메모 영역을 연다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(
      area,
      bookMemo({ id: 'm1', sourceId: 'bk1', chapterId: 'c2', paragraphIndex: 1, contextText: CH2[1], note: 'a pot' })
    );
    const { container } = renderApp(area, '#/memos');

    fireEvent.click(await screen.findByRole('button', { name: '원래 위치로' }));

    expect(await screen.findByRole('heading', { name: 'Fence' })).toBeInTheDocument();
    const textarea = (await screen.findByLabelText('메모')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('a pot');
    const mark = container.querySelector('mark[data-memo-id="m1"]');
    expect(mark).toHaveTextContent('kettle');
    expect(scrollIntoView.mock.contexts).toContain(mark);
    expect(window.location.hash).toContain('memo=m1');
  });

  // 4.5-7, 4.1-5
  it('4.5-7 4.1-5 문단 원문이 바뀐 원서 메모는 본문에 그려지지 않고, 모아 보기에 "위치를 찾지 못함"으로 나오며, 버튼은 그 장만 열고, 저장소에 남는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(
      area,
      bookMemo({
        id: 'lost',
        sourceId: 'bk1',
        chapterId: 'c2',
        paragraphIndex: 1,
        contextText: 'The kettle hummed on the new stove.',
        note: 'moved text',
      })
    );

    // 리더 본문에는 그려지지 않는다.
    const reader = renderApp(area, '#/book/bk1?chapter=c2');
    await screen.findByText(CH2[1]);
    expect(reader.container.querySelector('mark')).toBeNull();
    const aside = screen.getByRole('complementary', { name: /이 장의 메모/ });
    expect(within(aside).getByText('위치를 찾지 못함')).toBeInTheDocument();
    reader.unmount();

    // 모아 보기에는 표시와 함께 나온다.
    const { container } = renderApp(area, '#/memos');
    expect(await screen.findByText('위치를 찾지 못함')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원래 위치로' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '장 열기' }));
    expect(await screen.findByRole('heading', { name: 'Fence' })).toBeInTheDocument();
    await screen.findByText(CH2[1]);
    expect(window.location.hash).not.toContain('memo=');
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.queryByLabelText('메모')).toBeNull();
    expect(await getMemo(area, 'lost')).not.toBeNull();
  });

});
