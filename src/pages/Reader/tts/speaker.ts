// 브라우저 내장 음성(speechSynthesis)으로 문장을 하나씩 읽는다. 크롬 음성의 알려진 문제를 여기서 피한다(4.3-8).
// - 정지·일시정지·다른 곳에서 읽기는 cancel()로 하고, cancel()이 보내는 끝 신호는 세대 번호로 버린다.
// - 일시정지는 cancel()이고, 다시 재생하면 그 문장 처음부터 읽는다(크롬의 pause/resume은 믿을 수 없다).
// - 끝 신호가 너무 늦으면 멈춘 것으로 보고 그 문장을 다시 읽는다.
// - 읽는 문장은 단어 위치 신호(boundary)가 아니라 문장마다의 발화로 정한다.
import { VoiceLike } from './voices';

export interface SpeechItem {
  text: string;
  paragraphIndex: number;
  start: number;
  end: number;
}

export type SpeakerStatus = 'idle' | 'playing' | 'paused' | 'ended';

export interface SpeakerSnapshot {
  status: SpeakerStatus;
  mode: 'chapter' | 'selection';
  index: number; // 장 안의 문장 번호. 고른 글을 읽을 때와 읽지 않을 때는 -1
  error: string | null;
}

// speechSynthesis와 SpeechSynthesisUtterance를 묶은 것. 테스트와 개발 화면은 가짜를 넣는다.
export interface SpeechBackend {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  resume?(): void;
  getVoices(): VoiceLike[];
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
  createUtterance(text: string): SpeechSynthesisUtterance;
}

export interface SpeakerOptions {
  rate: number;
  repeat: boolean;
  autoPause: boolean;
  // 발화마다 부른다. 기기 음성만 돌려줘야 한다(온라인 음성은 쓰지 않는다).
  getVoice: () => VoiceLike | null;
}

export function createBrowserBackend(): SpeechBackend | null {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return {
    speak: (u) => synth.speak(u),
    cancel: () => synth.cancel(),
    resume: () => synth.resume(),
    getVoices: () => synth.getVoices(),
    addEventListener: (type, l) => synth.addEventListener(type, l),
    removeEventListener: (type, l) => synth.removeEventListener(type, l),
    createUtterance: (text) => new SpeechSynthesisUtterance(text),
  };
}

const MAX_RETRIES = 2;
const NO_VOICE_ERROR = '쓸 수 있는 영어 음성이 없어서 읽기를 멈췄습니다. 읽기 설정에서 음성을 확인하세요.';

// 끝 신호를 기다리는 시간. 보통 1배속 영어는 1초에 15자 안팎이므로 넉넉히 두 배 넘게 잡는다.
export const stallTimeoutMs = (text: string, rate: number) => 5000 + (text.length * 150) / Math.max(rate, 0.5);

export class Speaker {
  private items: SpeechItem[] = [];
  private queue: SpeechItem[] = [];
  private mode: SpeakerSnapshot['mode'] = 'chapter';
  private index = -1;
  private status: SpeakerStatus = 'idle';
  private error: string | null = null;
  private generation = 0;
  private retries = 0;
  private finishedCurrent = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private options: SpeakerOptions = { rate: 1, repeat: false, autoPause: false, getVoice: () => null };
  // 읽는 중인 발화를 잡아 둔다. 잡아 두지 않으면 끝 신호 전에 사라지는 일이 있다.
  currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor(private backend: SpeechBackend, private onChange: (s: SpeakerSnapshot) => void) {}

  snapshot(): SpeakerSnapshot {
    return {
      status: this.status,
      mode: this.mode,
      index: this.mode === 'chapter' ? this.index : -1,
      error: this.error,
    };
  }

  setOptions(next: Partial<SpeakerOptions>) {
    const rateChanged = next.rate !== undefined && next.rate !== this.options.rate;
    this.options = { ...this.options, ...next };
    // 속도를 바꾸면 읽던 문장을 바로 새 속도로 다시 읽는다.
    if (rateChanged) this.voiceChanged();
  }

  // 음성을 바꿨을 때(목록 변경, 음성 고르기) 읽던 문장을 새 음성으로 다시 읽는다.
  voiceChanged() {
    if (this.status === 'playing') this.speakAt(this.index);
  }

  // 장의 문장 목록. 장이 바뀌면 읽기를 멈춘다(4.3-8 d).
  setItems(items: SpeechItem[]) {
    this.halt('idle');
    this.items = items;
    this.index = -1;
    this.emit();
  }

  start(index: number) {
    if (index < 0 || index >= this.items.length) return;
    this.mode = 'chapter';
    this.begin(this.items, index);
  }

  speakSelection(texts: string[]) {
    const queue = texts.filter((t) => t.trim()).map((text) => ({ text, paragraphIndex: -1, start: 0, end: text.length }));
    if (queue.length === 0) return;
    this.mode = 'selection';
    this.begin(queue, 0);
  }

  pause() {
    if (this.status !== 'playing') return;
    this.halt('paused');
    this.emit();
  }

  // 일시정지한 곳에서 다시 읽는다. 다시 읽을 곳이 없으면 false.
  resume(): boolean {
    if (this.status !== 'paused' || this.index < 0) return false;
    this.error = null;
    this.retries = 0;
    if (this.finishedCurrent) this.advance();
    else this.speakAt(this.index);
    return true;
  }

  stop() {
    if (this.status === 'idle') return;
    this.halt('idle');
    this.mode = 'chapter';
    this.index = -1;
    this.emit();
  }

  // 문장 이동은 장을 읽는 중(또는 일시정지·장 끝)일 때만 한다.
  previous() {
    if (this.canMove()) this.speakChapterAt(Math.max(0, this.index - 1));
  }

  restart() {
    if (this.canMove()) this.speakChapterAt(Math.max(0, this.index));
  }

  next() {
    if (this.canMove()) this.advance();
  }

  dispose() {
    this.halt('idle');
  }

  private canMove() {
    return this.mode === 'chapter' && this.status !== 'idle' && this.index >= 0;
  }

  private speakChapterAt(index: number) {
    this.begin(this.items, index);
  }

  private begin(queue: SpeechItem[], index: number) {
    this.queue = queue;
    this.error = null;
    this.retries = 0;
    this.speakAt(index);
  }

  private halt(status: SpeakerStatus) {
    this.generation += 1; // cancel()이 보내는 끝 신호를 버리도록 먼저 올린다.
    this.clearTimer();
    this.backend.cancel();
    this.currentUtterance = null;
    this.status = status;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit() {
    this.onChange(this.snapshot());
  }

  private speakAt(index: number) {
    const item = this.queue[index];
    if (!item) return;
    const voice = this.options.getVoice();
    if (!voice) {
      // 음성을 정하지 않고 읽으면 브라우저가 온라인 음성을 고를 수 있다. 읽지 않고 멈춘다.
      this.halt('paused');
      this.index = index;
      this.finishedCurrent = false;
      this.error = NO_VOICE_ERROR;
      this.emit();
      return;
    }
    this.halt('playing');
    const generation = this.generation;
    this.index = index;
    this.finishedCurrent = false;
    const u = this.backend.createUtterance(item.text);
    u.rate = this.options.rate;
    u.voice = voice as SpeechSynthesisVoice;
    u.lang = voice.lang;
    const current = () => generation === this.generation;
    const armStallTimer = () => {
      this.clearTimer();
      this.timer = setTimeout(() => {
        if (current()) this.handleStall();
      }, stallTimeoutMs(item.text, this.options.rate));
    };
    u.onstart = () => {
      if (current()) armStallTimer();
    };
    u.onend = () => {
      if (current()) this.handleEnd();
    };
    u.onerror = (event: SpeechSynthesisErrorEvent | { error: string }) => {
      if (!current() || event.error === 'interrupted' || event.error === 'canceled') return;
      console.warn('[NF-STUDY] Speech error:', event.error);
      this.handleStall();
    };
    this.currentUtterance = u;
    this.backend.resume?.();
    this.backend.speak(u);
    armStallTimer();
    this.emit();
  }

  private handleStall() {
    this.retries += 1;
    if (this.retries <= MAX_RETRIES) {
      this.speakAt(this.index);
      return;
    }
    this.halt('paused');
    this.error = '음성이 멈춰서 읽기를 멈췄습니다. 재생을 눌러 다시 읽거나 다른 음성을 고르세요.';
    this.emit();
  }

  private handleEnd() {
    this.clearTimer();
    this.retries = 0;
    this.currentUtterance = null;
    if (this.mode === 'selection') {
      if (this.index + 1 < this.queue.length) this.speakAt(this.index + 1);
      else {
        this.status = 'idle';
        this.mode = 'chapter';
        this.index = -1;
        this.emit();
      }
      return;
    }
    if (this.options.repeat) {
      this.speakAt(this.index);
      return;
    }
    if (this.options.autoPause) {
      this.generation += 1;
      this.status = 'paused';
      this.finishedCurrent = true;
      this.emit();
      return;
    }
    this.advance();
  }

  private advance() {
    if (this.index + 1 < this.queue.length) this.speakAt(this.index + 1);
    else {
      this.halt('ended');
      this.emit();
    }
  }
}
