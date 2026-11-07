import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asBackend, createFakeSpeech, fakeVoice } from '../dev/fakeSpeech';
import { Speaker, SpeakerSnapshot, stallTimeoutMs } from './speaker';

// 글은 직접 쓴 문장이다.
const ITEMS = ['First line.', 'Second line.', 'Third line.'].map((text, i) => ({
  text,
  paragraphIndex: 0,
  start: i * 13,
  end: i * 13 + text.length,
}));
const VOICE = fakeVoice('Fake Samantha', 'en-US');

function setup(options: Partial<{ repeat: boolean; autoPause: boolean; rate: number }> = {}) {
  const fake = createFakeSpeech({ voices: [VOICE] });
  const snapshots: SpeakerSnapshot[] = [];
  const speaker = new Speaker(asBackend(fake), (s) => snapshots.push(s));
  speaker.setOptions({ rate: 1, repeat: false, autoPause: false, getVoice: () => VOICE, ...options });
  speaker.setItems(ITEMS);
  const texts = () => fake.spoken.map((s) => s.text);
  const last = () => snapshots[snapshots.length - 1];
  return { fake, speaker, texts, last };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Speaker', () => {
  it('reads sentence by sentence and stops at the end of the chapter (4.3-4)', () => {
    const { fake, speaker, texts, last } = setup();
    speaker.start(0);
    expect(last()).toMatchObject({ status: 'playing', index: 0 });
    fake.start();
    fake.end();
    fake.end();
    fake.end();
    expect(texts()).toEqual(['First line.', 'Second line.', 'Third line.']);
    expect(last()).toMatchObject({ status: 'ended' });
    vi.advanceTimersByTime(60_000);
    expect(texts().length).toBe(3);
  });

  it('4.3-8 (a) the end signal of a cancelled sentence does not read on', () => {
    const { fake, speaker, texts, last } = setup();
    speaker.start(0);
    speaker.pause(); // 가짜 음성은 취소한 발화에도 끝 신호를 보낸다.
    expect(last()).toMatchObject({ status: 'paused', index: 0 });
    speaker.start(2);
    speaker.stop();
    expect(last()).toMatchObject({ status: 'idle' });
    speaker.start(0);
    speaker.setItems(ITEMS); // 장 바꾸기
    expect(texts()).toEqual(['First line.', 'Third line.', 'First line.']);
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['First line.', 'Third line.', 'First line.']);
    // 지난 발화의 신호가 늦게 와도 무시한다.
    const stale = fake.current;
    expect(stale).toBeNull();
  });

  it('4.3-8 (a) a late end signal from an older utterance is ignored', () => {
    const { fake, speaker, texts } = setup();
    speaker.start(0);
    const old = fake.current!;
    speaker.start(1);
    old.onend?.(); // 앞 발화의 끝 신호가 늦게 온다.
    old.onerror?.({ error: 'interrupted' });
    expect(texts()).toEqual(['First line.', 'Second line.']);
  });

  it('4.3-8 (b) reads the sentence again when no end signal comes for too long', () => {
    const { fake, speaker, texts } = setup();
    speaker.start(1);
    fake.start();
    vi.advanceTimersByTime(stallTimeoutMs('Second line.', 1) + 10);
    expect(texts()).toEqual(['Second line.', 'Second line.']);
    fake.end();
    expect(texts()).toEqual(['Second line.', 'Second line.', 'Third line.']);
  });

  it('4.3-8 (b) gives up with a message after repeated stalls', () => {
    const { speaker, texts, last } = setup();
    speaker.start(0);
    for (let i = 0; i < 5; i++) vi.advanceTimersByTime(stallTimeoutMs('First line.', 1) + 10);
    expect(texts().length).toBe(3);
    expect(last()).toMatchObject({ status: 'paused', index: 0 });
    expect(last().error).toMatch(/멈/);
  });

  it('4.3-8 (b) waits longer for long sentences and slow rates', () => {
    expect(stallTimeoutMs('x'.repeat(150), 1)).toBeGreaterThan(stallTimeoutMs('x'.repeat(10), 1));
    expect(stallTimeoutMs('x'.repeat(150), 0.5)).toBeGreaterThan(stallTimeoutMs('x'.repeat(150), 1));
  });

  it('4.3-8 (c) resumes from the start of the paused sentence', () => {
    const { fake, speaker, texts } = setup();
    speaker.start(0);
    fake.end();
    fake.start();
    speaker.pause();
    expect(speaker.resume()).toBe(true);
    expect(texts()).toEqual(['First line.', 'Second line.', 'Second line.']);
  });

  it('4.3-10 repeat reads the same sentence until turned off', () => {
    const { fake, speaker, texts } = setup({ repeat: true });
    speaker.start(1);
    fake.end();
    fake.end();
    speaker.setOptions({ repeat: false });
    fake.end();
    expect(texts()).toEqual(['Second line.', 'Second line.', 'Second line.', 'Third line.']);
  });

  it('4.3-10 auto pause stops after each sentence and play reads the next one', () => {
    const { fake, speaker, texts, last } = setup({ autoPause: true });
    speaker.start(0);
    fake.end();
    expect(last()).toMatchObject({ status: 'paused', index: 0 });
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['First line.']);
    speaker.resume();
    expect(texts()).toEqual(['First line.', 'Second line.']);
    fake.end();
    speaker.next(); // D도 다음 문장을 읽는다.
    expect(texts()).toEqual(['First line.', 'Second line.', 'Third line.']);
  });

  it('moves to the previous, current and next sentence (4.3-9 A S D)', () => {
    const { speaker, texts, last } = setup();
    speaker.start(1);
    speaker.previous();
    speaker.restart();
    speaker.next();
    speaker.next();
    speaker.next(); // 마지막 문장 뒤에는 장 끝
    expect(texts()).toEqual(['Second line.', 'First line.', 'First line.', 'Second line.', 'Third line.']);
    expect(last().status).toBe('ended');
  });

  it('4.3-5 reads only the selected text and then stops', () => {
    const { fake, speaker, texts, last } = setup();
    speaker.speakSelection(['Picked words here.']);
    expect(last()).toMatchObject({ status: 'playing', mode: 'selection', index: -1 });
    fake.end();
    expect(last()).toMatchObject({ status: 'idle' });
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Picked words here.']);
  });

  it('uses the voice and rate given for every utterance and keeps a reference to it', () => {
    const { fake, speaker } = setup({ rate: 1.5 });
    speaker.start(0);
    expect(fake.spoken[0]).toMatchObject({ rate: 1.5, voiceURI: 'Fake Samantha' });
    expect(fake.current?.lang).toBe('en-US');
    expect(speaker.currentUtterance).toBe(fake.current);
  });

  it('reads the current sentence again with a new rate while playing', () => {
    const { fake, speaker } = setup();
    speaker.start(1);
    speaker.setOptions({ rate: 2 });
    expect(fake.spoken.map((s) => [s.text, s.rate])).toEqual([
      ['Second line.', 1],
      ['Second line.', 2],
    ]);
  });

  it('a real error stops like a stall, interrupted is ignored', () => {
    const { fake, speaker, texts } = setup();
    speaker.start(0);
    fake.error('synthesis-failed');
    expect(texts()).toEqual(['First line.', 'First line.']);
  });
});
