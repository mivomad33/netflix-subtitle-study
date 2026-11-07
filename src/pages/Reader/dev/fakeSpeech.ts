import { SpeechBackend } from '../tts/speaker';
import { VoiceLike } from '../tts/voices';

// 테스트와 개발 화면(reader-dev.html)에서 쓰는 가짜 음성. 소리를 내지 않고 읽은 글을 기록한다.
// 빌드 결과물에 들어가면 안 된다(check:build가 이 표시 문자열을 찾는다, 4.6-3).
export const FAKE_SPEECH_MARKER = 'NF_STUDY_FAKE_SPEECH';

export interface FakeUtterance {
  text: string;
  rate: number;
  voice: VoiceLike | null;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

export interface SpokenRecord {
  text: string;
  rate: number;
  voiceURI: string | null;
  at: number;
}

export interface FakeSpeechOptions {
  voices?: VoiceLike[];
  // 자동으로 읽기 시작·끝 신호를 보낼지. 개발 화면에서 쓴다. 테스트에서는 직접 보낸다.
  autoPlay?: { msPerChar: number };
}

export const fakeVoice = (voiceURI: string, lang: string, localService = true, isDefault = false): VoiceLike => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService,
  default: isDefault,
});

export const FAKE_VOICE_SETS: Record<string, VoiceLike[]> = {
  device: [
    fakeVoice('Fake Samantha', 'en-US', true, true),
    fakeVoice('Fake Daniel', 'en-GB'),
    fakeVoice('Fake Yuna', 'ko-KR'),
    fakeVoice('Fake Online US English', 'en-US', false),
  ],
  online: [fakeVoice('Fake Yuna', 'ko-KR', true, true), fakeVoice('Fake Online US English', 'en-US', false)],
  none: [],
};

export function createFakeSpeech(options: FakeSpeechOptions = {}) {
  let voices = options.voices ?? [];
  let current: FakeUtterance | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const listeners = new Set<() => void>();
  const spoken: SpokenRecord[] = [];
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const fake = {
    marker: FAKE_SPEECH_MARKER,
    spoken,
    get current() {
      return current;
    },
    speak(u: FakeUtterance) {
      current = u;
      spoken.push({ text: u.text, rate: u.rate, voiceURI: u.voice?.voiceURI ?? null, at: performance.now() });
      if (options.autoPlay) {
        const duration = (u.text.length * options.autoPlay.msPerChar) / (u.rate || 1);
        timers.push(setTimeout(() => current === u && u.onstart?.(), 30));
        timers.push(
          setTimeout(() => {
            if (current !== u) return;
            current = null;
            u.onend?.();
          }, 30 + duration)
        );
      }
    },
    // 크롬처럼 취소한 발화에도 끝 신호를 보낸다(4.3-8 a).
    cancel() {
      clearTimers();
      const u = current;
      current = null;
      u?.onend?.();
    },
    resume() {},
    getVoices: () => voices,
    addEventListener: (_type: 'voiceschanged', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'voiceschanged', listener: () => void) => listeners.delete(listener),
    createUtterance: (text: string): FakeUtterance => ({
      text,
      rate: 1,
      voice: null,
      lang: '',
      onstart: null,
      onend: null,
      onerror: null,
    }),
    // ---- 테스트에서 신호를 보낸다 ----
    start() {
      current?.onstart?.();
    },
    end() {
      const u = current;
      current = null;
      u?.onend?.();
    },
    error(error: string) {
      const u = current;
      current = null;
      u?.onerror?.({ error });
    },
    setVoices(next: VoiceLike[]) {
      voices = next;
      listeners.forEach((l) => l());
    },
  };
  return fake;
}

export type FakeSpeech = ReturnType<typeof createFakeSpeech>;

// SpeechBackend 모양으로 쓴다.
export const asBackend = (fake: FakeSpeech) => fake as unknown as SpeechBackend;
