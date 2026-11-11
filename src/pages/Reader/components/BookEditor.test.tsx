import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Memo } from '../../../shared/memo/types';
import { KEY } from '../../../shared/storage/keys';
import {
  getBook,
  getChapterParagraphs,
  listMemos,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
} from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { StorageError } from '../../../shared/storage/errors';
import { storageErrorMessage } from '../../../shared/ui/storageErrors';
import { bookMemo } from '../../../shared/storage/testFixtures';
import { ReaderEnvProvider } from '../env';
import App from '../App';
import { addChapter, deleteChapter } from '../logic/bookEdit';

// 테스트용 책. 글은 직접 쓴 문장이다.
const CH1 = ['The lamp glowed over a quiet desk.', 'A cat slept beside the warm window.'];
const CH2 = ['Two begins with a walk by the river.', 'Two continues past the old mill.'];
const CH3 = ['Three is short and quiet.'];

const seed = (area: StorageArea) =>
  saveBook(area, { id: 'bk1', title: 'Lamp and River', author: 'Test Author', createdAt: 1, updatedAt: 1 }, [
    { id: 'ch1', title: 'Opening Night', paragraphs: CH1 },
    { id: 'ch2', title: 'Second Wind', paragraphs: CH2 },
    { id: 'ch3', title: 'Last Light', paragraphs: CH3 },
  ]);

const memoOn = (chapterId: string, paragraphs: string[], quote: string, extra: Partial<Memo> = {}): Memo => {
  const start = paragraphs[0].indexOf(quote);
  return bookMemo({
    id: `m-${chapterId}-${quote}`,
    sourceId: 'bk1',
    chapterId,
    paragraphIndex: 0,
    contextText: paragraphs[0],
    start,
    end: start + quote.length,
    quote,
    note: 'my note',
    ...extra,
  });
};

const renderApp = (area: StorageArea, hash: string) => {
  window.location.hash = hash;
  return render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn(), speech: null }}>
      <App />
    </ReaderEnvProvider>
  );
};

// 쓰기 횟수를 세고, fail을 켜면 쓰기가 실패하는 저장소.
function countingArea(area: StorageArea) {
  const state = { writes: 0, fail: false };
  const wrapped: StorageArea = {
    ...area,
    set: async (items) => {
      state.writes++;
      if (state.fail) throw new Error('unavailable');
      return area.set(items);
    },
    remove: async (keys) => {
      state.writes++;
      if (state.fail) throw new Error('unavailable');
      return area.remove(keys);
    },
  };
  return { area: wrapped, state };
}

const chapterTitles = () =>
  screen.getAllByRole('textbox', { name: /번째 장 제목$/ }).map((input) => (input as HTMLInputElement).value);

const go = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('book-edit 4.1 책 편집 화면', () => {
  it('4.1-1 리더에서 책 편집 화면으로 들어가고, 조작이 모두 있으며, 리더로 돌아온다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1');
    fireEvent.click(await screen.findByRole('button', { name: '책 편집' }));

    expect(await screen.findByRole('heading', { name: '책 편집' })).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: '책 제목' }) as HTMLInputElement).value).toBe('Lamp and River');
    expect((screen.getByRole('textbox', { name: '지은이' }) as HTMLInputElement).value).toBe('Test Author');
    expect(chapterTitles()).toEqual(['Opening Night', 'Second Wind', 'Last Light']);
    for (const name of ['「Second Wind」 위로', '「Second Wind」 아래로', '「Second Wind」 본문 고치기', '「Second Wind」 지우기', '장 추가']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '「Opening Night」 위로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '「Last Light」 아래로' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '리더로 돌아가기' }));
    expect(await screen.findByRole('navigation', { name: '장 목록' })).toBeInTheDocument();
  });

  it('4.1-2 빈 책 제목과 201자는 저장되지 않고, 200자는 저장되며, 새 제목이 책 목록과 모아 보기에 보인다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch1', CH1, 'lamp'));
    renderApp(area, '#/book/bk1/edit');
    const title = (await screen.findByRole('textbox', { name: '책 제목' })) as HTMLInputElement;

    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.blur(title);
    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 넣으세요');
    expect((await getBook(area, 'bk1'))!.title).toBe('Lamp and River');

    fireEvent.change(title, { target: { value: 'x'.repeat(201) } });
    fireEvent.blur(title);
    expect(screen.getByRole('alert')).toHaveTextContent('200자까지');
    expect((await getBook(area, 'bk1'))!.title).toBe('Lamp and River');

    fireEvent.change(title, { target: { value: 'y'.repeat(200) } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.title).toBe('y'.repeat(200)));

    fireEvent.change(title, { target: { value: 'Harbor Days' } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.title).toBe('Harbor Days'));
    const author = screen.getByRole('textbox', { name: '지은이' }) as HTMLInputElement;
    fireEvent.change(author, { target: { value: '' } });
    fireEvent.blur(author);
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.author).toBe(''));

    await go('#/');
    expect(await screen.findByText('Harbor Days')).toBeInTheDocument();
    await go('#/memos');
    expect(await screen.findByText(/Harbor Days · Opening Night/)).toBeInTheDocument();
  });

  it('4.1-3 장 제목을 고치면 리더, 책 목록의 이어 읽기, 모아 보기에 보이고, 빈 제목은 막힌다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch1', CH1, 'lamp'));
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 0, updatedAt: 5 });
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;

    fireEvent.change(first, { target: { value: '' } });
    fireEvent.blur(first);
    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 넣으세요');
    expect((await getBook(area, 'bk1'))!.chapters[0].title).toBe('Opening Night');

    fireEvent.change(first, { target: { value: 'First Night' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.chapters[0].title).toBe('First Night'));

    await go('#/book/bk1');
    expect(await screen.findByRole('heading', { name: 'First Night' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: '장 목록' })).getByText('First Night')).toBeInTheDocument();
    await go('#/');
    expect(await screen.findByText('이어 읽기: 1장 〈First Night〉')).toBeInTheDocument();
    await go('#/memos');
    expect(await screen.findByText(/Lamp and River · First Night/)).toBeInTheDocument();
  });

  it('4.1-4 장을 위로 옮기면 순서, 다음 장, 이어 읽기 번호가 새 순서를 따르고 진행률과 메모는 그대로다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch2', CH2, 'river'));
    await setChapterDone(area, 'bk1', 'ch2', true, 5);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: 5 });
    const { container } = renderApp(area, '#/book/bk1');
    const before = (await screen.findByText(/3장 중 1장 완료/)).textContent;

    await go('#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 위로' }));
    await waitFor(() => expect(chapterTitles()).toEqual(['Second Wind', 'Opening Night', 'Last Light']));

    await go('#/book/bk1');
    // 읽던 장(Second Wind)이 열리고, 메모가 붙어 있고, 완료 표시가 남아 있다.
    expect(await screen.findByRole('heading', { name: 'Second Wind' })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('mark[data-memo-id="m-ch2-river"]')).toHaveTextContent('river'));
    expect(screen.getByText(/3장 중 1장 완료/).textContent).toBe(before);
    expect(screen.getByRole('checkbox', { name: 'Second Wind 학습 완료' })).toBeChecked();
    const names = within(screen.getByRole('navigation', { name: '장 목록' }))
      .getAllByRole('button')
      .map((b) => b.querySelector('.nfr-chapter-name')?.textContent)
      .filter(Boolean);
    expect(names).toEqual(['Second Wind', 'Opening Night', 'Last Light']);
    fireEvent.click(screen.getByRole('button', { name: '다음 장' }));
    expect(await screen.findByRole('heading', { name: 'Opening Night' })).toBeInTheDocument();

    await setPosition(area, { bookId: 'bk1', chapterId: 'ch2', paragraphIndex: 1, updatedAt: Date.now() + 1000 });
    await go('#/');
    expect(await screen.findByText('이어 읽기: 1장 〈Second Wind〉')).toBeInTheDocument();
  });

  it('4.1-5 제목에 열 글자를 넣는 동안 저장하지 않고, 저장이 실패하면 안내가 보이고 입력한 값이 남는다', async () => {
    const { area, state } = countingArea(createMemoryArea());
    await seed(area);
    state.writes = 0;
    renderApp(area, '#/book/bk1/edit');
    const title = (await screen.findByRole('textbox', { name: '책 제목' })) as HTMLInputElement;
    for (let i = 1; i <= 10; i++) fireEvent.change(title, { target: { value: 'New title!'.slice(0, i) } });
    expect(state.writes).toBe(0);
    fireEvent.blur(title);
    await waitFor(() => expect(state.writes).toBe(1));
    expect((await getBook(area, 'bk1'))!.title).toBe('New title!');

    state.fail = true;
    fireEvent.change(title, { target: { value: 'Will not save' } });
    fireEvent.blur(title);
    expect(await screen.findByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    // 4.7-3: 화면 위쪽에 종류별 저장 오류 안내가 보인다.
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
    expect(title.value).toBe('Will not save');
    expect((await getBook(area, 'bk1'))!.title).toBe('New title!');
  });

  it('4.1-5 제목을 고친 뒤 곧바로 누른 순서 버튼도 무시되지 않고 차례로 저장된다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'First Night' } });
    // 입력칸을 벗어나며 저장이 시작된 직후, 기다리지 않고 다른 장의 순서 버튼을 누른다.
    fireEvent.blur(first);
    fireEvent.click(screen.getByRole('button', { name: '「Last Light」 위로' }));
    await waitFor(async () =>
      expect((await getBook(area, 'bk1'))!.chapters.map((c) => c.title)).toEqual(['First Night', 'Last Light', 'Second Wind'])
    );
    await waitFor(() => expect(chapterTitles()).toEqual(['First Night', 'Last Light', 'Second Wind']));
    // 저장하는 동안에도 입력칸은 비활성이 되지 않는다(포커스를 잃지 않는다).
    expect(first).toBeEnabled();
  });

  it.each(['unavailable', 'resource-exhausted', 'permission-denied', 'unauthenticated', 'quota-exceeded'] as const)(
    '4.7-3 책 편집 화면의 저장이 %s 오류로 실패하면 그 종류의 안내가 보이고 화면이 저장소와 같다',
    async (errorCode) => {
      const inner = createMemoryArea();
      await seed(inner);
      const area: StorageArea = {
        ...inner,
        set: async () => {
          throw new StorageError(errorCode);
        },
      };
      renderApp(area, '#/book/bk1/edit');
      fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 위로' }));
      expect(await screen.findByText(storageErrorMessage(errorCode))).toBeInTheDocument();
      expect(screen.getByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
      expect(chapterTitles()).toEqual((await getBook(inner, 'bk1'))!.chapters.map((c) => c.title));
      expect(chapterTitles()).toEqual(['Opening Night', 'Second Wind', 'Last Light']);
    }
  );

  it('4.1-5, 4.7-3 앞의 저장이 실패하면 안내가 남고, 그 뒤에 눌러 둔 동작은 하지 않는다', async () => {
    const inner = createMemoryArea();
    await seed(inner);
    let calls = 0;
    const area: StorageArea = {
      ...inner,
      set: async (items) => {
        if (++calls === 1) throw new Error('unavailable');
        return inner.set(items);
      },
    };
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'First Night' } });
    fireEvent.blur(first);
    fireEvent.click(screen.getByRole('button', { name: '「Last Light」 위로' }));
    expect(await screen.findByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('저장하는 중입니다…')).toBeNull());
    // 실패 안내가 지워지지 않고, 뒤에 눌러 둔 순서 바꾸기는 실행되지 않았다.
    expect(screen.getByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    expect((await getBook(inner, 'bk1'))!.chapters.map((c) => c.title)).toEqual(['Opening Night', 'Second Wind', 'Last Light']);
    expect(first.value).toBe('First Night');
    expect(screen.queryByText(/다른 곳에서 책이 바뀌어/)).toBeNull();
  });

  it('4.1-5 저장하는 동안 같은 입력칸에 이어 친 글이 사라지지 않고 저장된다', async () => {
    const inner = createMemoryArea();
    await seed(inner);
    let release: (() => void) | null = null;
    const area: StorageArea = {
      ...inner,
      set: async (items) => {
        if (!release) await new Promise<void>((resolve) => (release = resolve));
        return inner.set(items);
      },
    };
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'First' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(() => expect(release).not.toBeNull());
    // 저장이 끝나기 전에 이어 친다.
    fireEvent.change(first, { target: { value: 'First Night' } });
    await act(async () => {
      release!();
    });
    await waitFor(async () => expect((await getBook(inner, 'bk1'))!.chapters[0].title).toBe('First'));
    expect(first.value).toBe('First Night');
    fireEvent.blur(first);
    await waitFor(async () => expect((await getBook(inner, 'bk1'))!.chapters[0].title).toBe('First Night'));
  });

  it('4.1-5 이어서 저장한 둘째 제목이 실패해도 입력한 둘째 값이 화면에 남는다', async () => {
    const inner = createMemoryArea();
    await seed(inner);
    let calls = 0;
    let release: (() => void) | null = null;
    const area: StorageArea = {
      ...inner,
      set: async (items) => {
        calls += 1;
        if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
        if (calls === 2) {
          // 둘째 저장은 첫째의 결과가 화면에 그려진 뒤에 실패한다(네트워크 오류처럼).
          await new Promise((resolve) => setTimeout(resolve, 30));
          throw new Error('unavailable');
        }
        return inner.set(items);
      },
    };
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'Alpha' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(() => expect(release).not.toBeNull());
    fireEvent.change(first, { target: { value: 'Beta' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await act(async () => {
      release!();
    });
    expect(await screen.findByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('저장하는 중입니다…')).toBeNull());
    expect((await getBook(inner, 'bk1'))!.chapters[0].title).toBe('Alpha');
    expect(first.value).toBe('Beta');
  });

  it('4.1-5 저장하는 동안 원래 제목으로 되돌려 다시 저장하면 원래 제목이 남는다', async () => {
    const inner = createMemoryArea();
    await seed(inner);
    let release: (() => void) | null = null;
    const area: StorageArea = {
      ...inner,
      set: async (items) => {
        if (!release) await new Promise<void>((resolve) => (release = resolve));
        return inner.set(items);
      },
    };
    renderApp(area, '#/book/bk1/edit');
    const first = (await screen.findByRole('textbox', { name: '1번째 장 제목' })) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'Wrong' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(() => expect(release).not.toBeNull());
    fireEvent.change(first, { target: { value: 'Opening Night' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await act(async () => {
      release!();
    });
    await waitFor(() => expect(screen.queryByText('저장하는 중입니다…')).toBeNull());
    await waitFor(async () => expect((await getBook(inner, 'bk1'))!.chapters[0].title).toBe('Opening Night'));
    expect(first.value).toBe('Opening Night');
  });

  it('4.1-6 다른 곳에서 책이 바뀐 뒤의 저장은 덮어쓰지 않고 다시 읽어 알린다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    await screen.findByRole('button', { name: '「Second Wind」 위로' });
    // 다른 탭이 장을 더했다.
    await act(async () => {
      await addChapter(area, (await getBook(area, 'bk1'))!, { title: 'Added Elsewhere', paragraphs: ['Elsewhere text.'] });
    });
    fireEvent.click(screen.getByRole('button', { name: '「Second Wind」 위로' }));

    expect(await screen.findByText('다른 곳에서 책이 바뀌어 다시 읽었습니다. 다시 해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(chapterTitles()).toEqual(['Opening Night', 'Second Wind', 'Last Light', 'Added Elsewhere']));
    expect((await getBook(area, 'bk1'))!.chapters.map((c) => c.title)).toEqual([
      'Opening Night',
      'Second Wind',
      'Last Light',
      'Added Elsewhere',
    ]);
  });

  it('4.1-6 다른 곳에서 책이 지워지면 책을 찾지 못했다고 알린다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    await screen.findByRole('button', { name: '「Second Wind」 위로' });
    await act(async () => {
      await area.remove([KEY.book('bk1')]);
    });
    fireEvent.click(screen.getByRole('button', { name: '「Second Wind」 위로' }));
    expect(await screen.findByText('책을 찾지 못했습니다. 지워졌을 수 있습니다.')).toBeInTheDocument();
  });
});

describe('book-edit 4.2 장 추가와 삭제', () => {
  const openAdd = async (area: StorageArea) => {
    renderApp(area, '#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '장 추가' }));
    const form = screen.getByRole('form', { name: '장 추가' });
    return {
      title: within(form).getByRole('textbox', { name: /장 제목/ }) as HTMLInputElement,
      body: within(form).getByRole('textbox', { name: /본문/ }) as HTMLTextAreaElement,
      clean: within(form).getByRole('checkbox', { name: /본문 정리/ }) as HTMLInputElement,
      save: within(form).getByRole('button', { name: '장 저장' }),
    };
  };
  const lastChapter = async (area: StorageArea) => {
    const book = (await getBook(area, 'bk1'))!;
    const chapter = book.chapters[book.chapters.length - 1];
    return { book, chapter, paragraphs: await getChapterParagraphs(area, 'bk1', chapter.id) };
  };

  it('4.2-1 본문 정리를 켜면 줄 끝에서 끊긴 글을 합치고, 장 제목 모양의 줄이 있어도 장은 하나만 는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const form = await openAdd(area);
    expect(form.clean).toBeChecked();
    fireEvent.change(form.title, { target: { value: 'Harbor' } });
    fireEvent.change(form.body, { target: { value: 'The boat left the har-\nbor at dawn and\nsailed north.\n\nChapter 3\n\nGulls followed it.' } });
    fireEvent.click(form.save);
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(4));
    const { chapter, paragraphs } = await lastChapter(area);
    expect(chapter.title).toBe('Harbor');
    expect(paragraphs).toEqual(['The boat left the harbor at dawn and sailed north.', 'Chapter 3', 'Gulls followed it.']);
    await waitFor(() => expect(chapterTitles()).toEqual(['Opening Night', 'Second Wind', 'Last Light', 'Harbor']));
  });

  it('4.2-1 본문 정리를 끄면 줄마다 문단이고, 빈 제목은 막히고, 빈 본문은 저장된다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const form = await openAdd(area);
    fireEvent.click(form.clean);
    fireEvent.change(form.body, { target: { value: 'Line one\nLine two\n\nLine three' } });
    fireEvent.click(form.save);
    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 넣으세요');
    expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(3);

    fireEvent.change(form.title, { target: { value: 'Lines' } });
    fireEvent.click(form.save);
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(4));
    expect((await lastChapter(area)).paragraphs).toEqual(['Line one', 'Line two', 'Line three']);

    fireEvent.click(await screen.findByRole('button', { name: '장 추가' }));
    const again = screen.getByRole('form', { name: '장 추가' });
    fireEvent.change(within(again).getByRole('textbox', { name: /장 제목/ }), { target: { value: 'Empty' } });
    fireEvent.click(within(again).getByRole('button', { name: '장 저장' }));
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(5));
    expect((await lastChapter(area)).paragraphs).toEqual([]);
  });

  it('4.2-2 모든 장을 완료한 책에 글이 있는 장을 더하면 진행률이 100% 아래가 된다', async () => {
    const area = createMemoryArea();
    await seed(area);
    for (const id of ['ch1', 'ch2', 'ch3']) await setChapterDone(area, 'bk1', id, true, 5);
    renderApp(area, '#/book/bk1');
    expect(await screen.findByText('100% · 3장 중 3장 완료')).toBeInTheDocument();
    await go('#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '장 추가' }));
    const form = screen.getByRole('form', { name: '장 추가' });
    fireEvent.change(within(form).getByRole('textbox', { name: /장 제목/ }), { target: { value: 'More' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /본문/ }), { target: { value: 'A new page of words to study here.' } });
    fireEvent.click(within(form).getByRole('button', { name: '장 저장' }));
    await waitFor(async () => expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(4));
    await go('#/book/bk1');
    expect(await screen.findByText(/^\d\d% · 4장 중 3장 완료$/)).toBeInTheDocument();
  });

  it('4.2-4 지우기 확인 창은 메모가 있으면 두 선택을, 없으면 지우기만 보이고, 취소하면 그대로다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch2', CH2, 'river'));
    await putMemo(area, memoOn('ch2', CH2, 'walk', { id: 'detached', contextText: 'An older walk sentence.', start: 9, end: 13 }));
    renderApp(area, '#/book/bk1/edit');
    const snapshot = async () => JSON.stringify(await area.get(await area.getKeys()));
    const before = await snapshot();

    fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 지우기' }));
    let dialog = screen.getByRole('dialog', { name: '「Second Wind」 장을 지울까요?' });
    expect(dialog).toHaveTextContent('메모·하이라이트가 2개');
    expect(dialog).toHaveTextContent('되돌릴 수 없습니다');
    expect(within(dialog).getByRole('button', { name: '메모 남기기' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '메모도 지우기' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '지우기' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '「Second Wind」 장을 지울까요?' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '「Last Light」 지우기' }));
    dialog = screen.getByRole('dialog', { name: '「Last Light」 장을 지울까요?' });
    expect(dialog).toHaveTextContent('메모·하이라이트가 없습니다');
    expect(within(dialog).getByRole('button', { name: '지우기' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '메모 남기기' })).toBeNull();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '「Last Light」 장을 지울까요?' })).toBeNull());
    expect(await snapshot()).toBe(before);
  });

  it('4.2-6 메모 남기기로 지우면 메모가 모아 보기에 위치를 찾지 못함으로 남는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch2', CH2, 'river'));
    renderApp(area, '#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 지우기' }));
    fireEvent.click(screen.getByRole('button', { name: '메모 남기기' }));
    await waitFor(() => expect(chapterTitles()).toEqual(['Opening Night', 'Last Light']));
    expect((await listMemos(area)).map((m) => m.id)).toEqual(['m-ch2-river']);
    await go('#/memos');
    expect(await screen.findByText('위치를 찾지 못함')).toBeInTheDocument();
    expect(screen.getAllByText('river').length).toBeGreaterThan(0);
  });

  it('4.2-6 메모도 지우기로 지우면 그 장의 메모만 지워진다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoOn('ch2', CH2, 'river'));
    await putMemo(area, memoOn('ch1', CH1, 'lamp'));
    renderApp(area, '#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 지우기' }));
    fireEvent.click(screen.getByRole('button', { name: '메모도 지우기' }));
    await waitFor(async () => expect((await listMemos(area)).map((m) => m.id)).toEqual(['m-ch1-lamp']));
    expect(chapterTitles()).toEqual(['Opening Night', 'Last Light']);
  });

  it('4.2-7 장이 하나뿐이면 지우기가 비활성이고 안내가 있다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    expect(await screen.findByRole('button', { name: '「Opening Night」 지우기' })).toBeEnabled();
    expect(screen.queryByText(/장이 하나뿐이라 지울 수 없습니다/)).toBeNull();
    await act(async () => {
      let book = (await getBook(area, 'bk1'))!;
      book = await deleteChapter(area, book, 'ch3', { deleteMemos: false });
      await deleteChapter(area, book, 'ch2', { deleteMemos: false });
    });
    await waitFor(() => expect(chapterTitles()).toEqual(['Opening Night']));
    expect(screen.getByRole('button', { name: '「Opening Night」 지우기' })).toBeDisabled();
    expect(screen.getByText(/장이 하나뿐이라 지울 수 없습니다/)).toBeInTheDocument();
  });

  it('4.2-8 리더가 열어 둔 장이 다른 곳에서 지워지면 오류 없이 알리고 남은 장을 보인다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1?chapter=ch2');
    expect(await screen.findByRole('heading', { name: 'Second Wind' })).toBeInTheDocument();
    await act(async () => {
      await deleteChapter(area, (await getBook(area, 'bk1'))!, 'ch2', { deleteMemos: false });
    });
    expect(await screen.findByText('보던 장이 다른 곳에서 지워져 첫 장을 엽니다.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Opening Night' })).toBeInTheDocument();
    expect(await screen.findByText(CH1[0])).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: '장 목록' })).queryByText('Second Wind')).toBeNull();
  });

  it('4.7-3 장 지우기가 실패하면 안내가 보이고 장 목록이 저장소와 같다', async () => {
    const { area, state } = countingArea(createMemoryArea());
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '「Last Light」 지우기' }));
    state.fail = true;
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(await screen.findByText('저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(chapterTitles()).toEqual((await getBook(area, 'bk1'))!.chapters.map((c) => c.title));
    expect(chapterTitles()).toHaveLength(3);
  });
});
