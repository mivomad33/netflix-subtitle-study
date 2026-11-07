import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { putMemo, saveBook, setPosition } from '../../../shared/storage/repo';
import { createMemoryArea, StorageArea } from '../../../shared/storage/storageArea';
import { bookMemo, netflixMemo } from '../../../shared/storage/testFixtures';
import { ReaderEnvProvider } from '../env';
import { BookList } from './BookList';

// 테스트용 책 둘. 글은 직접 쓴 문장이다.
const seed = async (area: StorageArea) => {
  await saveBook(area, { id: 'bkA', title: 'Apple Orchard', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'c1', title: 'One', paragraphs: ['Trees stood in neat rows.'] },
    { id: 'c2', title: 'Two', paragraphs: ['The harvest came early.'] },
  ]);
  await saveBook(area, { id: 'bkB', title: 'Brass Clock', author: '', createdAt: 2, updatedAt: 2 }, [
    { id: 'c1', title: 'One', paragraphs: ['The clock ticked loudly.'] },
  ]);
  await setPosition(area, { bookId: 'bkA', chapterId: 'c2', paragraphIndex: 0, updatedAt: 3 });
  await setPosition(area, { bookId: 'bkB', chapterId: 'c1', paragraphIndex: 0, updatedAt: 3 });
  await putMemo(area, bookMemo({ id: 'a1', sourceId: 'bkA', contextText: 'Trees stood in neat rows.', start: 0, end: 5, quote: 'Trees' }));
  await putMemo(area, bookMemo({ id: 'a2', sourceId: 'bkA', chapterId: 'c2', contextText: 'The harvest came early.', start: 4, end: 11, quote: 'harvest' }));
  await putMemo(area, bookMemo({ id: 'b1', sourceId: 'bkB', contextText: 'The clock ticked loudly.', start: 4, end: 9, quote: 'clock' }));
  await putMemo(area, netflixMemo({ id: 'n1' }));
};

const snapshot = async (area: StorageArea) => {
  const keys = (await area.getKeys()).sort();
  return { keys, values: await area.get(keys) };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BookList', () => {
  // 4.3-6
  it('4.3-6 책을 지울 때 메모 개수를 담은 확인을 받고, 취소하면 아무것도 지워지지 않는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const before = await snapshot(area);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
        <BookList navigate={vi.fn()} />
      </ReaderEnvProvider>
    );

    const deleteButton = await screen.findByRole('button', { name: '「Apple Orchard」 지우기' });
    // 목록을 다 읽은 뒤에는 저장소를 건드리지 않아야 한다. 지우기가 시작되면 getKeys가 곧바로 불린다.
    const getKeys = vi.spyOn(area, 'getKeys');
    const remove = vi.spyOn(area, 'remove');
    fireEvent.click(deleteButton);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(getKeys).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(confirmSpy.mock.calls[0][0]).toContain('메모 2개');
    expect(confirmSpy.mock.calls[0][0]).toContain('Apple Orchard');

    expect(await snapshot(area)).toEqual(before);
    expect(screen.getByText('Apple Orchard')).toBeInTheDocument();
  });

  // 4.3-6
  it('4.3-6 확인하면 그 책의 본문·메모·읽기 위치만 지워지고 다른 책과 넷플릭스 메모는 남는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
        <BookList navigate={vi.fn()} />
      </ReaderEnvProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: '「Apple Orchard」 지우기' }));
    await waitFor(() => expect(screen.queryByText('Apple Orchard')).toBeNull());
    expect(screen.getByText('Brass Clock')).toBeInTheDocument();

    expect((await area.getKeys()).sort()).toEqual(
      ['book:bkB', 'bookch:bkB:c1', 'memo:b1', 'memo:n1', 'pos:bkB'].sort()
    );
  });
});
