import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Memo } from '../../../shared/memo/types';
import { KEY } from '../../../shared/storage/keys';
import {
  getBook,
  getChapterParagraphs,
  getMemo,
  listMemos,
  putMemo,
  saveBook,
  setChapterDone,
  setPosition,
} from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo } from '../../../shared/storage/testFixtures';
import { MAX_BOOK_CHARS } from '../../../shared/text/bookText';
import { editorText } from '../../../shared/text/chapterEdit';
import { ReaderEnvProvider } from '../env';
import App from '../App';
import { FakeSpeech, asBackend, createFakeSpeech, fakeVoice } from '../dev/fakeSpeech';
import { deleteChapter, saveChapterBody } from '../logic/bookEdit';
import { countMatches, replaceAll, shrinksTooMuch, summaryText } from './ChapterEditor';

// 테스트용 책. 글은 직접 쓴 문장이다.
const CH1 = [
  'The lamp glowed over a quiet desk.',
  'A cat slept beside teh warm window.',
  'Rain tapped softly on the roof.',
  'Teh kettle sang and teh clock ticked.',
];
const CH2 = ['Two begins with a walk by the river.', 'Two continues past the old mill.'];

const seed = (area: StorageArea) =>
  saveBook(area, { id: 'bk1', title: 'Lamp and River', author: 'Test Author', createdAt: 1, updatedAt: 1 }, [
    { id: 'ch1', title: 'Opening Night', paragraphs: CH1 },
    { id: 'ch2', title: 'Second Wind', paragraphs: CH2 },
  ]);

const memoAt = (paragraphIndex: number, quote: string, extra: Partial<Memo> = {}): Memo => {
  const start = CH1[paragraphIndex].indexOf(quote);
  return bookMemo({
    id: `m-${paragraphIndex}-${quote}`,
    sourceId: 'bk1',
    chapterId: 'ch1',
    paragraphIndex,
    contextText: CH1[paragraphIndex],
    start,
    end: start + quote.length,
    quote,
    note: 'my note',
    ...extra,
  });
};

const renderApp = (area: StorageArea, hash: string, speech: FakeSpeech | null = null) => {
  window.location.hash = hash;
  return render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn(), speech: speech && asBackend(speech) }}>
      <App />
    </ReaderEnvProvider>
  );
};

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

const EDIT_CH1 = '#/book/bk1/edit/ch1?from=reader';
const body = async () => (await screen.findByRole('textbox', { name: '장 본문' })) as HTMLTextAreaElement;
const type = (textarea: HTMLTextAreaElement, value: string) => fireEvent.input(textarea, { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: '저장' }));
const go = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
};
const fixTypo = (text: string) => text.replace('beside teh warm', 'beside the warm');

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('book-edit 4.3 장 본문 편집 창', () => {
  it('4.3-1 책 편집 화면과 리더에서 편집 창이 열리고, 본문이 문단 사이 빈 줄과 함께 들어 있다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '「Second Wind」 본문 고치기' }));
    expect((await body()).value).toBe(`${CH2[0]}\n\n${CH2[1]}`);
    expect(screen.getByRole('heading', { name: '본문 고치기 · Second Wind' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '책 편집으로 돌아가기' }));
    expect(await screen.findByRole('heading', { name: '책 편집' })).toBeInTheDocument();

    await go('#/book/bk1?chapter=ch1');
    await screen.findByText(CH1[0]);
    fireEvent.click(screen.getByRole('button', { name: '이 장 고치기' }));
    expect((await body()).value).toBe(CH1.join('\n\n'));
  });

  it('4.3-1 소리 내어 읽는 중에 편집 창을 열면 읽기가 멈춘다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const fake = createFakeSpeech({ voices: [fakeVoice('Fake Samantha', 'en-US', true, true)] });
    renderApp(area, '#/book/bk1?chapter=ch1', fake);
    await screen.findByText(CH1[0]);
    fireEvent.click(await screen.findByRole('button', { name: '▶ 재생' }));
    await waitFor(() => expect(fake.current).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '이 장 고치기' }));
    await body();
    expect(fake.current).toBeNull();
  });

  it('4.3-2 리더에서 열면 읽던 문단 처음에 커서가 있고, 저장하면 그 문단으로 돌아온다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 2, updatedAt: 5 });
    const { container } = renderApp(area, '#/book/bk1');
    await screen.findByText(CH1[2]);
    fireEvent.click(screen.getByRole('button', { name: '이 장 고치기' }));
    const textarea = await body();
    const offset = editorText(CH1).indexOf(CH1[2]);
    expect(textarea.selectionStart).toBe(offset);
    expect(textarea.selectionEnd).toBe(offset);
    expect(document.activeElement).toBe(textarea);

    // 앞에 문단을 하나 더하고 저장하면 읽던 문단은 3번째가 된다.
    scrollIntoView.mockClear();
    type(textarea, `A new first line.\n\n${textarea.value}`);
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    await waitFor(() => expect(container.querySelector('[data-paragraph-index="3"]')).not.toBeNull());
    const target = container.querySelector('[data-paragraph-index="3"]');
    expect(target).toHaveTextContent(CH1[2]);
    await waitFor(() => expect(scrollIntoView.mock.instances).toContain(target));
  });

  it('4.3-2 취소하면 읽던 문단으로 돌아온다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await setPosition(area, { bookId: 'bk1', chapterId: 'ch1', paragraphIndex: 1, updatedAt: 5 });
    const { container } = renderApp(area, '#/book/bk1');
    await screen.findByText(CH1[1]);
    fireEvent.click(screen.getByRole('button', { name: '이 장 고치기' }));
    await body();
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await screen.findByRole('navigation', { name: '장 목록' });
    await waitFor(() => expect(scrollIntoView.mock.instances).toContain(container.querySelector('[data-paragraph-index="1"]')));
  });

  it('4.3-3 줄바꿈마다 문단으로 저장하고, 장 제목 모양의 줄이 있어도 장 수는 그대로다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, '#/book/bk1/edit/ch2');
    type(await body(), 'a\nb\n\n\n c \n\nChapter 9\n\n');
    save();
    // 글이 크게 줄어 확인을 받는다(4.3-7).
    fireEvent.click(await screen.findByRole('button', { name: '그래도 저장' }));
    await waitFor(async () => expect(await getChapterParagraphs(area, 'bk1', 'ch2')).toEqual(['a', 'b', 'c', 'Chapter 9']));
    expect((await getBook(area, 'bk1'))!.chapters).toHaveLength(2);
  });

  it('4.3-4 고치지 않고 저장하면 저장소에 쓰지 않고 리더로 돌아간다', async () => {
    const { area, state } = countingArea(createMemoryArea());
    await seed(area);
    const memo = memoAt(0, 'lamp');
    await putMemo(area, memo);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    state.writes = 0;
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    expect(state.writes).toBe(0);
    expect(await getMemo(area, memo.id)).toEqual(memo);

    // 빈 줄만 더한 것도 같은 문단이라 쓰지 않는다.
    await go(EDIT_CH1);
    const again = await body();
    expect(again).not.toBe(textarea);
    state.writes = 0;
    type(again, `\n\n${again.value}\n\n\n`);
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    expect(state.writes).toBe(0);
  });

  it('4.3-5, 4.4-5 오타를 고쳐 저장하면 확인 없이 저장되고 하이라이트가 고친 글에 그려진다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoAt(1, 'teh warm'));
    await setChapterDone(area, 'bk1', 'ch1', true, 5);
    const { container } = renderApp(area, EDIT_CH1);
    const textarea = await body();
    type(textarea, fixTypo(textarea.value));
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    expect(screen.queryByRole('dialog', { name: '저장하기 전에 확인해 주세요' })).toBeNull();
    await waitFor(() => expect(container.querySelector('mark[data-memo-id="m-1-teh warm"]')).toHaveTextContent('the warm'));
    const chapter = (await getBook(area, 'bk1'))!.chapters[0];
    expect(chapter).toMatchObject({ paragraphCount: 4, charCount: CH1.join('').length });
    expect(screen.getByRole('checkbox', { name: 'Opening Night 학습 완료' })).toBeChecked();
    expect(screen.queryByText('위치를 찾지 못함')).toBeNull();
  });

  it('4.3-6 찾아 바꾸기: 개수, 다음 찾기, 바꾸기, 모두 바꾸기, 대소문자 구분', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    const text = textarea.value;
    const find = screen.getByRole('textbox', { name: '찾을 글' });
    const replace = screen.getByRole('textbox', { name: '바꿀 글' });
    const group = screen.getByRole('group', { name: '찾아 바꾸기' });
    const status = () => within(group).getByRole('status').textContent;
    expect(screen.getByRole('button', { name: '다음 찾기' })).toBeDisabled();

    fireEvent.change(find, { target: { value: 'teh' } });
    await waitFor(() => expect(status()).toBe('3곳'));
    fireEvent.click(screen.getByRole('checkbox', { name: '대소문자 구분' }));
    await waitFor(() => expect(status()).toBe('2곳'));
    fireEvent.click(screen.getByRole('checkbox', { name: '대소문자 구분' }));
    await waitFor(() => expect(status()).toBe('3곳'));

    // 다음 찾기는 차례로 고르고 끝에서 처음으로 돌아온다.
    const positions = [text.indexOf('teh'), text.indexOf('Teh'), text.lastIndexOf('teh')];
    textarea.setSelectionRange(0, 0);
    for (const at of [...positions, positions[0]]) {
      fireEvent.click(screen.getByRole('button', { name: '다음 찾기' }));
      expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([at, at + 3]);
    }

    // 바꾸기는 고른 곳 하나를 바꾸고 다음을 고른다. $1 같은 글도 글자 그대로 들어간다.
    fireEvent.change(replace, { target: { value: '$1the' } });
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(textarea.value).toBe(text.replace('teh', '$1the'));
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('Teh');
    await waitFor(() => expect(status()).toBe('2곳'));

    fireEvent.change(replace, { target: { value: 'the' } });
    fireEvent.click(screen.getByRole('button', { name: '모두 바꾸기' }));
    expect(textarea.value).toBe(text.replace('teh', '$1the').replace('Teh', 'the').replace('teh', 'the'));
    expect(status()).toBe('2곳을 바꿨습니다.');

    // 찾을 글이 없으면 알리고 본문은 그대로다.
    const now = textarea.value;
    fireEvent.change(find, { target: { value: 'zebra' } });
    fireEvent.click(screen.getByRole('button', { name: '모두 바꾸기' }));
    expect(status()).toBe('찾지 못했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '다음 찾기' }));
    expect(status()).toBe('찾지 못했습니다.');
    expect(textarea.value).toBe(now);

    // 바꾼 결과는 저장을 눌러야 저장된다.
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
    save();
    await waitFor(async () => expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[1]).toBe('A cat slept beside $1the warm window.'));
  });

  it('4.3-6 찾아 바꾸기 계산', () => {
    expect(countMatches('Teh teh TEH', 'teh', false)).toBe(3);
    expect(countMatches('Teh teh TEH', 'teh', true)).toBe(1);
    expect(countMatches('aaaa', 'aa', true)).toBe(2);
    expect(countMatches('abc', '', true)).toBe(0);
    expect(replaceAll('Teh teh', 'teh', '$&x', false)).toEqual({ text: '$&x $&x', count: 2 });
    expect(replaceAll('Teh teh', 'teh', 'the', true)).toEqual({ text: 'Teh the', count: 1 });
    expect(replaceAll('abc', '', 'x', true)).toEqual({ text: 'abc', count: 0 });
  });

  it('4.3-7 변경 요약이 입력에 따라 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    expect(await screen.findByText('문단 4→4 · 글자 0')).toBeInTheDocument();
    type(textarea, `${CH1[0]}\n\n${CH1[1]}`);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const removed = CH1[2].length + CH1[3].length;
    expect(screen.getByText(`문단 4→2 · 글자 −${removed}`)).toBeInTheDocument();
    type(textarea, `${textarea.value}\n\nMore.`);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(`문단 4→3 · 글자 −${removed - 5}`)).toBeInTheDocument();
    expect(summaryText(['ab'], ['ab', 'cde'])).toBe('문단 1→2 · 글자 +3');
  });

  it('4.3-7 글자가 10% 넘게 줄면 확인받고, 정확히 10%면 확인 없이 저장한다', async () => {
    expect(shrinksTooMuch(100, 90)).toBe(false);
    expect(shrinksTooMuch(100, 89)).toBe(true);
    expect(shrinksTooMuch(0, 0)).toBe(false);

    const area = createMemoryArea();
    const ten = ['a'.repeat(50), 'b'.repeat(40), 'c'.repeat(10)];
    await saveBook(area, { id: 'bk1', title: 'Ten', author: '', createdAt: 1, updatedAt: 1 }, [
      { id: 'ch1', title: 'One', paragraphs: ten },
      { id: 'ch2', title: 'Two', paragraphs: ['x'] },
    ]);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    // 11자를 줄인다.
    type(textarea, `${ten[0]}\n\n${'b'.repeat(39)}`);
    save();
    const dialog = await screen.findByRole('dialog', { name: '저장하기 전에 확인해 주세요' });
    expect(dialog).toHaveTextContent('글자가 11자(11%) 줄어듭니다. 저장할까요?');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 고치기' }));
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(ten);
    expect(textarea.value).toBe(`${ten[0]}\n\n${'b'.repeat(39)}`);

    // 정확히 10자를 줄이면 확인 없이 저장된다.
    type(textarea, `${ten[0]}\n\n${ten[1]}`);
    save();
    await waitFor(async () => expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual([ten[0], ten[1]]));
    expect(screen.queryByRole('dialog', { name: '저장하기 전에 확인해 주세요' })).toBeNull();
  });

  it('4.3-8 책 본문 상한을 넘으면 저장하지 않고 글자 수를 알리며 글이 남는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    const big = 'x'.repeat(MAX_BOOK_CHARS);
    type(textarea, big);
    save();
    const alert = await screen.findByText(/책 본문이 너무 깁니다/);
    expect(alert).toHaveTextContent('2,000,000자까지');
    expect(alert).toHaveTextContent((MAX_BOOK_CHARS + CH2.join('').length).toLocaleString('ko-KR'));
    expect(textarea.value).toBe(big);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
  });

  it('4.3-9, 4.7-3 저장이 실패하면 안내가 보이고 고친 글이 남아 다시 저장할 수 있다', async () => {
    const { area, state } = countingArea(createMemoryArea());
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    const fixed = fixTypo(textarea.value);
    type(textarea, fixed);
    state.fail = true;
    save();
    expect(await screen.findByText(/저장하지 못했습니다. 고친 글은 화면에 남아 있습니다/)).toBeInTheDocument();
    // 화면 위쪽의 종류별 저장 오류 안내도 보인다.
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
    expect(textarea.value).toBe(fixed);
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
    state.fail = false;
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    expect((await getChapterParagraphs(area, 'bk1', 'ch1'))[1]).toBe('A cat slept beside the warm window.');
  });

  it('4.3-11 저장하지 않은 수정이 있으면 나가기 전에 확인받고, 없으면 바로 나간다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    let textarea = await body();

    // 수정이 없으면 탭을 닫아도 막지 않는다.
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    type(textarea, `${textarea.value}\n\nUnsaved line.`);
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    // 돌아가기 버튼
    fireEvent.click(screen.getByRole('button', { name: '리더로 돌아가기' }));
    let dialog = await screen.findByRole('dialog', { name: '저장하지 않은 수정이 있습니다' });
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 고치기' }));
    expect(screen.getByRole('textbox', { name: '장 본문' })).toBe(textarea);
    expect(textarea.value).toContain('Unsaved line.');
    expect(window.location.hash).toBe(EDIT_CH1);

    // 머리글의 메뉴(주소가 바뀌는 이동)
    await go('#/memos');
    dialog = await screen.findByRole('dialog', { name: '저장하지 않은 수정이 있습니다' });
    expect(screen.getByRole('textbox', { name: '장 본문' })).toBe(textarea);
    fireEvent.click(within(dialog).getByRole('button', { name: '저장하지 않고 나가기' }));
    expect(await screen.findByRole('heading', { name: '메모 모아 보기' })).toBeInTheDocument();
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);

    // 수정이 없으면 묻지 않는다.
    await go(EDIT_CH1);
    textarea = await body();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(await screen.findByRole('navigation', { name: '장 목록' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '저장하지 않은 수정이 있습니다' })).toBeNull();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('4.3-12 편집을 시작한 뒤 다른 곳에서 본문이 바뀌면 저장을 막고, 다시 열 수 있다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    const elsewhere = [CH1[0], 'Changed in another tab.', CH1[2], CH1[3]];
    await act(async () => {
      await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after: elsewhere });
    });
    const mine = fixTypo(textarea.value);
    type(textarea, mine);
    save();
    expect(await screen.findByText(/편집을 시작한 뒤 이 장이 다른 곳에서 바뀌어 저장하지 않았습니다/)).toBeInTheDocument();
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(elsewhere);
    expect(textarea.value).toBe(mine);

    fireEvent.click(screen.getByRole('button', { name: '새 본문으로 다시 열기' }));
    const dialog = await screen.findByRole('dialog', { name: '새 본문으로 다시 열까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 열기' }));
    await waitFor(async () => expect((await body()).value).toBe(elsewhere.join('\n\n')));
    expect(screen.queryByText(/다른 곳에서 바뀌어 저장하지 않았습니다/)).toBeNull();
  });

  it('4.3-12 장이 다른 곳에서 지워졌으면 알리고 저장하지 않는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    await act(async () => {
      await deleteChapter(area, (await getBook(area, 'bk1'))!, 'ch1', { deleteMemos: false });
    });
    type(textarea, fixTypo(textarea.value));
    save();
    expect(await screen.findByText(/이 장이나 책이 다른 곳에서 지워져 저장하지 않았습니다/)).toBeInTheDocument();
    expect(await area.getKeys()).not.toContain(KEY.chapter('bk1', 'ch1'));
    expect(textarea.value).toContain('beside the warm');
  });

  it('4.3-12 편집 창을 연 뒤 다른 화면에서 단 메모도 저장 뒤 새 본문에 붙어 있다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const { container } = renderApp(area, EDIT_CH1);
    const textarea = await body();
    await act(async () => {
      await putMemo(area, memoAt(2, 'Rain'));
    });
    type(textarea, `A new first line.\n\n${fixTypo(textarea.value)}`);
    save();
    await screen.findByRole('navigation', { name: '장 목록' });
    await waitFor(() => expect(container.querySelector('mark[data-memo-id="m-2-Rain"]')).toHaveTextContent('Rain'));
    expect((await getMemo(area, 'm-2-Rain'))!.paragraphIndex).toBe(3);
  });

  it('4.3-13 리더가 열어 둔 장의 본문이 다른 곳에서 바뀌면 새 본문과 옮긴 하이라이트가 그려진다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoAt(1, 'teh warm'));
    const { container } = renderApp(area, '#/book/bk1?chapter=ch1');
    await screen.findByText(CH1[0]);
    expect(container.querySelector('mark[data-memo-id="m-1-teh warm"]')).toHaveTextContent('teh warm');
    const after = ['A new first line.', CH1[0], 'A cat slept beside the warm window.', CH1[2], CH1[3]];
    await act(async () => {
      await saveChapterBody(area, { bookId: 'bk1', chapterId: 'ch1', original: CH1, after });
    });
    expect(await screen.findByText('A new first line.')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('mark[data-memo-id="m-1-teh warm"]')).toHaveTextContent('the warm'));
    expect(container.querySelector('[data-paragraph-index="2"]')).toHaveTextContent('A cat slept beside the warm window.');
    expect(screen.queryByText('위치를 찾지 못함')).toBeNull();
  });
});

describe('book-edit 4.4 저장 전 확인과 떨어진 메모', () => {
  it('4.4-5 붙일 수 없는 메모가 있으면 개수와 목록을 보이고, 계속 고치기는 아무것도 저장하지 않는다', async () => {
    const area = createMemoryArea();
    await seed(area);
    await putMemo(area, memoAt(2, 'Rain tapped', { note: 'first lost note' }));
    await putMemo(area, memoAt(3, 'kettle sang', { note: '' }));
    await putMemo(area, memoAt(0, 'lamp'));
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    const edited = `${CH1[0]}\n\n${CH1[1]}`;
    type(textarea, edited);
    save();
    const dialog = await screen.findByRole('dialog', { name: '저장하기 전에 확인해 주세요' });
    expect(dialog).toHaveTextContent('메모·하이라이트 2개를 고친 글에 붙일 수 없습니다');
    expect(dialog).toHaveTextContent('메모 글은 지워지지 않습니다');
    const items = within(within(dialog).getByRole('list', { name: '붙일 수 없는 메모' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Rain tappedfirst lost note', 'kettle sang']);
    expect(within(dialog).getByRole('button', { name: '그래도 저장' })).toBeInTheDocument();

    // Esc(취소 이벤트)는 계속 고치기와 같다.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '저장하기 전에 확인해 주세요' })).toBeNull());
    expect(await getChapterParagraphs(area, 'bk1', 'ch1')).toEqual(CH1);
    expect(textarea.value).toBe(edited);
  });

  it('4.4-6 그래도 저장하면 메모는 그대로 남고 리더와 모아 보기에 위치를 찾지 못함으로 보인다', async () => {
    const area = createMemoryArea();
    await seed(area);
    const lost = memoAt(2, 'Rain tapped', { note: 'kept note' });
    await putMemo(area, lost);
    renderApp(area, EDIT_CH1);
    const textarea = await body();
    type(textarea, `${CH1[0]}\n\n${CH1[1]}\n\n${CH1[3]}`);
    save();
    const dialog = await screen.findByRole('dialog', { name: '저장하기 전에 확인해 주세요' });
    fireEvent.click(within(dialog).getByRole('button', { name: '그래도 저장' }));
    await screen.findByRole('navigation', { name: '장 목록' });
    expect(await getMemo(area, lost.id)).toEqual(lost);
    expect((await listMemos(area)).length).toBe(1);
    const side = await screen.findByRole('complementary', { name: /이 장의 메모/ });
    expect(await within(side).findByText('위치를 찾지 못함')).toBeInTheDocument();

    await go('#/memos');
    expect(await screen.findByText('위치를 찾지 못함')).toBeInTheDocument();
    expect(screen.getAllByText(/Rain tapped/).length).toBeGreaterThan(0);
    // 모아 보기에서 메모를 지울 수 있다.
    expect(screen.getByRole('button', { name: /지우기/ })).toBeInTheDocument();
  });
});
