import React, { useEffect, useMemo, useRef, useState } from 'react';
import { READ_ALOUD_DEFAULTS, ReaderSettings } from '../../../shared/memo/types';
import { SentencePiece } from '../../../shared/ui/annotationUi';
import { splitSentences } from '../tts/sentences';
import { Speaker, SpeakerSnapshot, SpeechBackend, SpeechItem } from '../tts/speaker';
import { VoiceLike, pickVoice, usableVoices, voiceLabel } from '../tts/voices';

// 원서 리더의 소리 내어 읽기(4.3, 4.4). 읽기 상태는 Speaker가 갖고, 이 파일은 화면과 잇는다.

export type ReadAloudSettings = Required<Omit<ReaderSettings, 'fontSize' | 'voiceURI'>> & { voiceURI?: string };

export const readAloudSettings = (s: ReaderSettings): ReadAloudSettings => ({
  voiceURI: s.voiceURI,
  rate: s.rate ?? READ_ALOUD_DEFAULTS.rate,
  allowOnlineVoices: s.allowOnlineVoices ?? READ_ALOUD_DEFAULTS.allowOnlineVoices,
  repeat: s.repeat ?? READ_ALOUD_DEFAULTS.repeat,
  autoPause: s.autoPause ?? READ_ALOUD_DEFAULTS.autoPause,
});

const IDLE: SpeakerSnapshot = { status: 'idle', mode: 'chapter', index: -1, error: null };
const NO_PIECES: SentencePiece[] = [];

// 장 본문을 문장으로 나눈다. 문장 번호는 장 전체에서 이어진다.
export function chapterSentences(paragraphs: string[] | null) {
  const items: SpeechItem[] = [];
  const byParagraph: SentencePiece[][] = [];
  const firstOfParagraph: number[] = [];
  (paragraphs ?? []).forEach((text, paragraphIndex) => {
    firstOfParagraph.push(items.length);
    byParagraph.push(
      splitSentences(text).map((piece) => {
        items.push({ text: text.slice(piece.start, piece.end), paragraphIndex, ...piece });
        return { ...piece, index: items.length - 1 };
      })
    );
  });
  return { items, byParagraph, firstOfParagraph };
}

export function useReadAloud(
  speech: SpeechBackend | null,
  paragraphs: string[] | null,
  settings: ReadAloudSettings
) {
  const [allVoices, setAllVoices] = useState<VoiceLike[]>(() => speech?.getVoices() ?? []);
  const [snapshot, setSnapshot] = useState<SpeakerSnapshot>(IDLE);
  const speaker = useMemo(() => (speech ? new Speaker(speech, setSnapshot) : null), [speech]);

  // 음성 목록은 화면을 연 뒤에 늦게 채워지기도 한다(4.3-6).
  useEffect(() => {
    if (!speech) return;
    const update = () => setAllVoices(speech.getVoices());
    update();
    speech.addEventListener('voiceschanged', update);
    return () => speech.removeEventListener('voiceschanged', update);
  }, [speech]);

  const voices = useMemo(
    () => usableVoices(allVoices, settings.allowOnlineVoices),
    [allVoices, settings.allowOnlineVoices]
  );
  // 발화마다 이 값을 쓴다. 온라인 음성을 허용하지 않았으면 기기 음성만 나온다(4.4-2).
  const voice = useMemo(
    () => pickVoice(allVoices, settings.voiceURI, settings.allowOnlineVoices),
    [allVoices, settings.voiceURI, settings.allowOnlineVoices]
  );
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    speaker?.setOptions({ getVoice: () => voiceRef.current });
  }, [speaker]);

  useEffect(() => {
    speaker?.setOptions({ rate: settings.rate, repeat: settings.repeat, autoPause: settings.autoPause });
  }, [speaker, settings.rate, settings.repeat, settings.autoPause]);

  const voiceURI = voice?.voiceURI;
  const firstVoice = useRef(true);
  useEffect(() => {
    if (firstVoice.current) {
      firstVoice.current = false;
      return;
    }
    speaker?.voiceChanged();
  }, [speaker, voiceURI]);

  const sentences = useMemo(() => chapterSentences(paragraphs), [paragraphs]);

  // 장이 바뀌면(본문을 다시 불러오면) 읽기를 멈춘다(4.3-8 d).
  useEffect(() => {
    speaker?.setItems(sentences.items);
  }, [speaker, sentences]);

  // 다른 화면으로 가거나 탭을 닫으면 멈춘다.
  useEffect(() => {
    if (!speaker) return;
    const stop = () => speaker.stop();
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      speaker.dispose();
    };
  }, [speaker]);

  return {
    speaker,
    snapshot,
    voices,
    voice,
    sentences,
    piecesOf: (paragraphIndex: number) => sentences.byParagraph[paragraphIndex] ?? NO_PIECES,
  };
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; // RATE_MIN~RATE_MAX 안의 값

export const NO_ENGLISH_VOICE_NOTICE =
  '쓸 수 있는 영어 음성이 없습니다. macOS 시스템 설정 › 손쉬운 사용 › 말하는 콘텐츠(Spoken Content)의 시스템 음성에서 영어 음성을 내려받은 뒤 크롬을 다시 열거나, 읽기 설정에서 온라인 음성을 켜세요.';

interface BarProps {
  supported: boolean;
  snapshot: SpeakerSnapshot;
  voices: VoiceLike[];
  voice: VoiceLike | null;
  settings: ReadAloudSettings;
  following: boolean;
  hasNextChapter: boolean;
  onChange: (patch: Partial<ReadAloudSettings>) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onFollow: () => void;
  onReadNextChapter: () => void;
}

export const ReadAloudBar: React.FC<BarProps> = ({
  supported,
  snapshot,
  voices,
  voice,
  settings,
  following,
  hasNextChapter,
  onChange,
  onPlayPause,
  onStop,
  onPrevious,
  onNext,
  onFollow,
  onReadNextChapter,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!supported) {
    return (
      <div className="nfr-read-bar">
        <p className="nfr-muted">이 브라우저에서는 소리 내어 읽기를 쓸 수 없습니다.</p>
      </div>
    );
  }
  const { status } = snapshot;
  const reading = snapshot.mode === 'chapter' && (status === 'playing' || status === 'paused');
  const playing = status === 'playing';
  const settingsButton = (
    <button
      type="button"
      className={`nfr-btn ${settingsOpen ? 'nfr-btn-pressed' : ''}`}
      aria-expanded={settingsOpen}
      aria-controls="read-settings"
      onClick={() => setSettingsOpen((open) => !open)}
    >
      읽기 설정
    </button>
  );
  const settingsPanel = settingsOpen && (
    <div className="nfr-read-settings" id="read-settings" role="group" aria-label="읽기 설정">
      <label className="nfr-check">
        <input
          type="checkbox"
          checked={settings.allowOnlineVoices}
          onChange={(e) => onChange({ allowOnlineVoices: e.target.checked })}
        />
        온라인 음성도 쓰기
      </label>
      <p className="nfr-read-settings-note">켜면 읽는 글이 외부(Google 등) 서버로 전송됩니다.</p>
    </div>
  );

  return (
    <div className="nfr-read-bar">
      {!voice ? (
        <>
          <div className="nfr-read-row">
            <p className="nfr-read-notice" role="status">
              {NO_ENGLISH_VOICE_NOTICE}
            </p>
            {settingsButton}
          </div>
          {settingsPanel}
        </>
      ) : (
        <>
          <div className="nfr-read-row" role="toolbar" aria-label="소리 내어 읽기">
            <button type="button" className="nfr-btn nfr-btn-primary nfr-play" onClick={onPlayPause} title="Space">
              {playing ? '❚❚ 일시정지' : '▶ 재생'}
            </button>
            <button type="button" className="nfr-btn" onClick={onStop} disabled={status === 'idle'}>
              ■ 정지
            </button>
            <button type="button" className="nfr-btn" onClick={onPrevious} disabled={!reading && status !== 'ended'} title="A">
              이전 문장
            </button>
            <button type="button" className="nfr-btn" onClick={onNext} disabled={!reading && status !== 'ended'} title="D">
              다음 문장
            </button>
            <button
              type="button"
              className={`nfr-btn ${settings.repeat ? 'nfr-btn-on' : ''}`}
              aria-pressed={settings.repeat}
              onClick={() => onChange({ repeat: !settings.repeat })}
              title="R"
            >
              문장 반복
            </button>
            <button
              type="button"
              className={`nfr-btn ${settings.autoPause ? 'nfr-btn-on' : ''}`}
              aria-pressed={settings.autoPause}
              onClick={() => onChange({ autoPause: !settings.autoPause })}
              title="Q"
            >
              문장마다 멈춤
            </button>
          </div>
          <div className="nfr-read-row">
            <label className="nfr-select-label">
              속도
              <select
                className="nfr-input nfr-select"
                value={String(settings.rate)}
                onChange={(e) => onChange({ rate: Number(e.target.value) })}
              >
                {RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}배
                  </option>
                ))}
              </select>
            </label>
            <label className="nfr-select-label nfr-voice-label">
              음성
              <select
                className="nfr-input nfr-select"
                value={voice.voiceURI}
                onChange={(e) => onChange({ voiceURI: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {voiceLabel(v)}
                  </option>
                ))}
              </select>
            </label>
            {settingsButton}
          </div>
          {settingsPanel}
          {snapshot.error && (
            <p className="nfr-error" role="alert">
              {snapshot.error}
            </p>
          )}
          {(reading && !following) || (status === 'ended' && hasNextChapter) ? (
            <div className="nfr-read-row">
              {reading && !following && (
                <button type="button" className="nfr-btn" onClick={onFollow}>
                  읽는 곳으로
                </button>
              )}
              {status === 'ended' && hasNextChapter && (
                <>
                  <span className="nfr-muted">이 장을 끝까지 읽었습니다.</span>
                  <button type="button" className="nfr-btn nfr-btn-primary" onClick={onReadNextChapter}>
                    다음 장 읽기
                  </button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
