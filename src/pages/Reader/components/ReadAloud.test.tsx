import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReaderSettings,
  listCompletions,
  putMemo,
  saveBook,
  setPosition,
  updateReaderSettings,
} from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { bookMemo } from '../../../shared/storage/testFixtures';
import { FakeSpeech, asBackend, createFakeSpeech, fakeVoice } from '../dev/fakeSpeech';
import { ReaderEnvProvider } from '../env';
import { BookReader } from './BookReader';

// 테스트용 책. 글은 직접 쓴 문장이다.
const BOOK_ID = 'bk1';
const P0 = 'Ann waits by the gate. The bus is late.';
const P1 = 'Rain starts to fall. She opens a red umbrella. A dog runs past.';
const P2 = 'The bus arrives at last.';
const CHAPTERS = [
  { id: 'c1', title: 'Gate', paragraphs: [P0, P1, P2] },
  { id: 'c2', title: 'Map', paragraphs: ['Ben reads the map. He finds the road.'] },
  { id: 'c3', title: 'Home', paragraphs: ['The trip ends here.'] },
];

const DEVICE = fakeVoice('Fake Samantha', 'en-US', true, true);
const DEVICE_GB = fakeVoice('Fake Daniel', 'en-GB');
const KOREAN = fakeVoice('Fake Yuna', 'ko-KR');
const ONLINE = fakeVoice('Fake Online English', 'en-US', false);
const VOICES = [KOREAN, DEVICE, DEVICE_GB, ONLINE];

const seed = (area: StorageArea) =>
  saveBook(area, { id: BOOK_ID, title: 'Rainy Day', author: '', createdAt: 1, updatedAt: 1 }, CHAPTERS);

const renderReader = (area: StorageArea, speech: FakeSpeech | null) =>
  render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn(), speech: speech && asBackend(speech) }}>
      <BookReader bookId={BOOK_ID} navigate={vi.fn()} />
    </ReaderEnvProvider>
  );

async function setup(options: { voices?: typeof VOICES; prepare?: (area: StorageArea) => Promise<unknown> } = {}) {
  const area = createMemoryArea();
  await seed(area);
  await options.prepare?.(area);
  const fake = createFakeSpeech({ voices: options.voices ?? VOICES });
  const view = renderReader(area, fake);
  await waitForBody();
  return { area, fake, view, spoken: () => fake.spoken.map((s) => s.text) };
}

const waitForBody = () =>
  waitFor(() => expect(document.querySelector('[data-paragraph-index="0"]')).not.toBeNull());

const sentence = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-si]')).find((el) => el.textContent === text)!;

const selectText = (node: Node, start: number, end: number) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
};

const scrollIntoView = vi.fn();
const play = () => fireEvent.click(screen.getByRole('button', { name: /재생/ }));
const finish = (fake: FakeSpeech) => act(() => fake.end());

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('4.3-1 reading controls', () => {
  it('"여기서부터 읽기" on the second paragraph reads its first sentence first', async () => {
    const { spoken } = await setup();
    fireEvent.click(screen.getAllByRole('button', { name: '여기서부터 읽기' })[1]);
    expect(spoken()).toEqual(['Rain starts to fall.']);
  });

  it('play starts at the reading position paragraph, pause then play repeats the same sentence', async () => {
    const { fake, spoken } = await setup({
      prepare: (area) => setPosition(area, { bookId: BOOK_ID, chapterId: 'c1', paragraphIndex: 2, updatedAt: 1 }),
    });
    play();
    expect(spoken()).toEqual(['The bus arrives at last.']);
    fireEvent.click(screen.getByRole('button', { name: /일시정지/ }));
    expect(screen.getByRole('button', { name: /재생/ })).toBeInTheDocument();
    play();
    expect(spoken()).toEqual(['The bus arrives at last.', 'The bus arrives at last.']);
    void fake;
  });

  it('clicking a sentence while reading reads from it; clicking a highlight opens its memo and keeps the place', async () => {
    const { fake, view, spoken } = await setup({
      prepare: (area) =>
        putMemo(area, bookMemo({ id: 'm1', sourceId: BOOK_ID, chapterId: 'c1', paragraphIndex: 1, contextText: P1, start: 33, end: 36, quote: 'red' })),
    });
    // 읽지 않을 때 문장을 눌러도 읽지 않는다.
    fireEvent.click(sentence(view.container, 'The bus is late.'));
    expect(spoken()).toEqual([]);
    play();
    fireEvent.click(sentence(view.container, 'Rain starts to fall.'));
    expect(spoken()).toEqual(['Ann waits by the gate.', 'Rain starts to fall.']);
    fireEvent.click(view.container.querySelector('mark[data-memo-id="m1"]')!);
    expect(await screen.findByLabelText('메모')).toBeInTheDocument();
    expect(spoken()).toEqual(['Ann waits by the gate.', 'Rain starts to fall.']);
    expect(sentence(view.container, 'Rain starts to fall.')).toHaveClass('current-sentence');
    void fake;
  });
});

describe('4.3-3 current sentence and auto scroll', () => {
  it('marks the sentence being read, keeps highlights, scrolls, and stops following after a user scroll', async () => {
    const { fake, view } = await setup({
      prepare: (area) =>
        putMemo(area, bookMemo({ id: 'm1', sourceId: BOOK_ID, chapterId: 'c1', paragraphIndex: 0, contextText: P0, start: 27, end: 30, quote: 'bus' })),
    });
    play();
    expect(sentence(view.container, 'Ann waits by the gate.')).toHaveClass('current-sentence');
    scrollIntoView.mockClear();
    act(() => fake.start());
    finish(fake);
    const second = view.container.querySelector('.current-sentence')!;
    expect(second.textContent).toBe('The ');
    expect(view.container.querySelectorAll('.current-sentence').length).toBe(3); // mark 앞·안·뒤로 나뉜다
    expect(view.container.querySelector('mark[data-memo-id="m1"] .current-sentence')).toHaveTextContent('bus');
    expect(sentence(view.container, 'Ann waits by the gate.')).not.toHaveClass('current-sentence');
    expect(scrollIntoView).toHaveBeenCalled();

    scrollIntoView.mockClear();
    fireEvent.wheel(window);
    finish(fake);
    expect(sentence(view.container, 'Rain starts to fall.')).toHaveClass('current-sentence');
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '읽는 곳으로' }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(sentence(view.container, 'Rain starts to fall.'));
    expect(screen.queryByRole('button', { name: '읽는 곳으로' })).toBeNull();
  });
});

describe('4.3-4 end of chapter', () => {
  it('stops after the last sentence and "다음 장 읽기" reads the next chapter from the start', async () => {
    const { area, fake, spoken } = await setup();
    fireEvent.click(screen.getAllByRole('button', { name: '여기서부터 읽기' })[2]);
    finish(fake);
    expect(spoken()).toEqual(['The bus arrives at last.']);
    // 4.1-2 끝까지 읽어도 학습 완료는 바뀌지 않는다.
    expect(await listCompletions(area, BOOK_ID)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '다음 장 읽기' }));
    await waitFor(() => expect(spoken()).toEqual(['The bus arrives at last.', 'Ben reads the map.']));
    expect(screen.getByRole('heading', { name: 'Map' })).toBeInTheDocument();
  });

  it('has no "다음 장 읽기" on the last chapter', async () => {
    const { fake } = await setup();
    fireEvent.click(screen.getByRole('button', { name: /Home/ }));
    await screen.findByText('The trip ends here.');
    play();
    finish(fake);
    expect(screen.queryByRole('button', { name: '다음 장 읽기' })).toBeNull();
    expect(fake.spoken.length).toBe(1);
  });
});

describe('4.3-5 reading a selection', () => {
  it('reads only the selected words and stops', async () => {
    const { fake, view, spoken } = await setup();
    const p = view.container.querySelector('[data-paragraph-index="1"] p.annotatable') as HTMLElement;
    // "She opens a red umbrella." 안의 "a red umbrella"
    const span = sentence(view.container, 'She opens a red umbrella.');
    selectText(span.firstChild!, 10, 24);
    fireEvent.mouseUp(p);
    fireEvent.click(screen.getByRole('button', { name: '읽기' }));
    expect(spoken()).toEqual(['a red umbrella']);
    finish(fake);
    expect(spoken()).toEqual(['a red umbrella']);
  });
});

describe('4.3-6 rate and voice', () => {
  it('remembers rate and voice and uses them for each utterance', async () => {
    const { area, fake, view } = await setup();
    fireEvent.change(screen.getByLabelText('속도'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('음성'), { target: { value: 'Fake Daniel' } });
    await waitFor(async () => expect(await getReaderSettings(area)).toMatchObject({ rate: 1.5, voiceURI: 'Fake Daniel' }));
    view.unmount();

    const again = createFakeSpeech({ voices: VOICES });
    renderReader(area, again);
    await waitForBody();
    expect((screen.getByLabelText('속도') as HTMLSelectElement).value).toBe('1.5');
    expect((screen.getByLabelText('음성') as HTMLSelectElement).value).toBe('Fake Daniel');
    play();
    expect(again.spoken[0]).toMatchObject({ rate: 1.5, voiceURI: 'Fake Daniel' });
    void fake;
  });

  it('uses the default English device voice when the saved one is missing and keeps the setting', async () => {
    const { area, fake } = await setup({ prepare: (area) => updateReaderSettings(area, { voiceURI: 'Gone Voice' }) });
    play();
    expect(fake.spoken[0].voiceURI).toBe('Fake Samantha');
    expect((await getReaderSettings(area)).voiceURI).toBe('Gone Voice');
  });

  it('picks up voices that arrive late (voiceschanged)', async () => {
    const { fake } = await setup({ voices: [], prepare: (area) => updateReaderSettings(area, { voiceURI: 'Fake Daniel' }) });
    expect(screen.queryByRole('button', { name: /재생/ })).toBeNull();
    act(() => fake.setVoices(VOICES));
    expect((await screen.findByLabelText('음성') as HTMLSelectElement).value).toBe('Fake Daniel');
    play();
    expect(fake.spoken[0].voiceURI).toBe('Fake Daniel');
  });
});

describe('4.3-7 voices that cannot be used', () => {
  it('lists only English voices', async () => {
    await setup();
    const options = within(screen.getByLabelText('음성')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Fake Samantha (en-US)', 'Fake Daniel (en-GB)']);
  });

  it.each([
    ['only a Korean voice', [KOREAN]],
    ['no voice at all', []],
  ])('shows how to get an English voice with %s', async (_name, voices) => {
    await setup({ voices });
    expect(screen.getByRole('status')).toHaveTextContent('영어 음성');
    expect(screen.getByRole('status')).toHaveTextContent('온라인 음성');
    expect(screen.queryByRole('button', { name: /재생/ })).toBeNull();
    expect(screen.queryAllByRole('button', { name: '여기서부터 읽기' })).toEqual([]);
  });

  it('says reading aloud is unavailable without speechSynthesis', async () => {
    const area = createMemoryArea();
    await seed(area);
    renderReader(area, null);
    await screen.findByText(P0);
    expect(screen.getByText('이 브라우저에서는 소리 내어 읽기를 쓸 수 없습니다.')).toBeInTheDocument();
  });
});

describe('4.3-8 (d) stopping', () => {
  it('stops when the chapter changes, the page is hidden, or the reader closes', async () => {
    const { fake, view, spoken } = await setup();
    play();
    fireEvent.click(screen.getByRole('button', { name: /Map/ }));
    await screen.findByText('Ben reads the map.', { exact: false });
    expect(fake.current).toBeNull();
    finish(fake);
    expect(spoken()).toEqual(['Ann waits by the gate.']);

    play();
    expect(fake.current).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(fake.current).toBeNull();

    play();
    view.unmount();
    expect(fake.current).toBeNull();
    expect(spoken().length).toBe(3);
  });
});

describe('4.3-9 shortcuts', () => {
  const key = (target: Element | Window, code: string) => fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code.slice(3).toLowerCase() });

  it('Space, A, S, D, Q and R do what the Netflix panel keys do', async () => {
    const { fake, spoken } = await setup();
    key(window, 'Space');
    expect(spoken()).toEqual(['Ann waits by the gate.']);
    key(window, 'KeyD');
    key(window, 'KeyD');
    key(window, 'KeyA');
    key(window, 'KeyS');
    expect(spoken()).toEqual([
      'Ann waits by the gate.',
      'The bus is late.',
      'Rain starts to fall.',
      'The bus is late.',
      'The bus is late.',
    ]);
    key(window, 'Space');
    expect(screen.getByRole('button', { name: /재생/ })).toBeInTheDocument();
    key(window, 'KeyR');
    expect(screen.getByRole('button', { name: '문장 반복' })).toHaveAttribute('aria-pressed', 'true');
    key(window, 'KeyQ');
    expect(screen.getByRole('button', { name: '문장마다 멈춤' })).toHaveAttribute('aria-pressed', 'true');
    void fake;
  });

  it('does nothing while typing a memo or using a select, and Space does not press a focused button', async () => {
    const { view, spoken } = await setup({
      prepare: (area) =>
        putMemo(area, bookMemo({ id: 'm1', sourceId: BOOK_ID, chapterId: 'c1', paragraphIndex: 0, contextText: P0, start: 0, end: 3, quote: 'Ann' })),
    });
    fireEvent.click(view.container.querySelector('mark[data-memo-id="m1"]')!);
    const textarea = await screen.findByLabelText('메모');
    key(textarea, 'Space');
    key(textarea, 'KeyD');
    key(screen.getByLabelText('음성'), 'Space');
    key(screen.getByRole('checkbox', { name: 'Gate 학습 완료' }), 'KeyR');
    expect(spoken()).toEqual([]);
    expect(screen.getByRole('button', { name: '문장 반복' })).toHaveAttribute('aria-pressed', 'false');

    const stop = screen.getByRole('button', { name: /정지/ });
    const next = screen.getByRole('button', { name: '다음 장' });
    const onClick = vi.fn();
    next.addEventListener('click', onClick);
    next.focus();
    const downAllowed = fireEvent.keyDown(next, { code: 'Space', key: ' ' });
    const upAllowed = fireEvent.keyUp(next, { code: 'Space', key: ' ' });
    expect(downAllowed).toBe(false);
    expect(upAllowed).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(spoken()).toEqual(['Ann waits by the gate.']);
    void stop;
  });
});

describe('4.3-10 shadowing', () => {
  it('repeat reads the same sentence again and shows green when on', async () => {
    const { fake, spoken } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '문장 반복' }));
    expect(screen.getByRole('button', { name: '문장 반복' })).toHaveClass('nfr-btn-on');
    play();
    finish(fake);
    finish(fake);
    expect(spoken()).toEqual(['Ann waits by the gate.', 'Ann waits by the gate.', 'Ann waits by the gate.']);
  });

  it('auto pause stops after one sentence and play reads the next one', async () => {
    const { fake, spoken } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '문장마다 멈춤' }));
    expect(screen.getByRole('button', { name: '문장마다 멈춤' })).toHaveClass('nfr-btn-on');
    play();
    finish(fake);
    expect(spoken()).toEqual(['Ann waits by the gate.']);
    expect(screen.getByRole('button', { name: /재생/ })).toBeInTheDocument();
    play();
    expect(spoken()).toEqual(['Ann waits by the gate.', 'The bus is late.']);
  });
});

describe('4.4 online voices', () => {
  const openSettings = () => fireEvent.click(screen.getByRole('button', { name: '읽기 설정' }));

  it('4.4-1 shows device voices first and online voices with a label after turning the setting on', async () => {
    const { area, view } = await setup();
    const names = () => within(screen.getByLabelText('음성')).getAllByRole('option').map((o) => o.textContent);
    expect(names()).toEqual(['Fake Samantha (en-US)', 'Fake Daniel (en-GB)']);
    openSettings();
    expect(screen.getByText('켜면 읽는 글이 외부(Google 등) 서버로 전송됩니다.')).toBeInTheDocument();
    const toggle = screen.getByRole('checkbox', { name: '온라인 음성도 쓰기' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(names()).toEqual(['Fake Samantha (en-US)', 'Fake Daniel (en-GB)', 'Fake Online English (en-US) (온라인)']);
    await waitFor(async () => expect((await getReaderSettings(area)).allowOnlineVoices).toBe(true));
    view.unmount();

    renderReader(area, createFakeSpeech({ voices: VOICES }));
    await waitForBody();
    openSettings();
    expect((screen.getByRole('checkbox', { name: '온라인 음성도 쓰기' }) as HTMLInputElement).checked).toBe(true);
  });

  it('4.4-2 never speaks with an online voice while the setting is off, on every path', async () => {
    const { fake, view } = await setup({
      prepare: (area) => updateReaderSettings(area, { voiceURI: ONLINE.voiceURI, allowOnlineVoices: false }),
    });
    play(); // 재생
    fireEvent.keyDown(window, { code: 'KeyD', key: 'd' }); // 단축키
    fireEvent.click(screen.getAllByRole('button', { name: '여기서부터 읽기' })[2]); // 여기서부터 읽기
    finish(fake);
    fireEvent.click(screen.getByRole('button', { name: '다음 장 읽기' })); // 다음 장 읽기
    await screen.findByText('Ben reads the map.', { exact: false });
    await waitFor(() => expect(fake.spoken.length).toBe(4));
    const span = sentence(view.container, 'He finds the road.');
    selectText(span.firstChild!, 3, 8);
    fireEvent.mouseUp(view.container.querySelector('[data-paragraph-index="0"] p.annotatable')!);
    fireEvent.click(screen.getByRole('button', { name: '읽기' })); // 고른 글 읽기
    expect(fake.spoken.length).toBe(5);
    expect(fake.spoken.map((s) => s.voiceURI)).toEqual(Array(5).fill('Fake Samantha'));
  });

  it('4.4-2 speaks with the online voice when the setting is on, and falls back when it is turned off', async () => {
    const { fake } = await setup({
      prepare: (area) => updateReaderSettings(area, { voiceURI: ONLINE.voiceURI, allowOnlineVoices: true }),
    });
    play();
    expect(fake.spoken[0].voiceURI).toBe(ONLINE.voiceURI);
    openSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: '온라인 음성도 쓰기' }));
    // 읽던 문장을 기기 음성으로 다시 읽는다.
    expect(fake.spoken[fake.spoken.length - 1].voiceURI).toBe('Fake Samantha');
    finish(fake);
    expect(fake.spoken[fake.spoken.length - 1]).toMatchObject({ text: 'The bus is late.', voiceURI: 'Fake Samantha' });
    expect((screen.getByLabelText('음성') as HTMLSelectElement).value).toBe('Fake Samantha');
  });
});
