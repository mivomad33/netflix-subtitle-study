import { describe, it, expect } from 'vitest';
import { isEnglishVoice, pickVoice, usableVoices, voiceLabel } from './voices';

const v = (voiceURI: string, lang: string, localService = true, isDefault = false) => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService,
  default: isDefault,
});

const ALL = [
  v('Yuna', 'ko-KR', true, true),
  v('Google US English', 'en-US', false),
  v('Daniel', 'en-GB'),
  v('Samantha', 'en-US'),
  v('Google UK English Female', 'en-GB', false),
];

describe('voices', () => {
  it('4.3-7 lists only English voices, device voices first', () => {
    expect(isEnglishVoice(v('x', 'en_AU'))).toBe(true);
    expect(isEnglishVoice(v('x', 'ko-KR'))).toBe(false);
    expect(usableVoices(ALL, false).map((x) => x.voiceURI)).toEqual(['Daniel', 'Samantha']);
    expect(usableVoices(ALL, true).map((x) => x.voiceURI)).toEqual([
      'Daniel',
      'Samantha',
      'Google US English',
      'Google UK English Female',
    ]);
  });

  it('4.4-1 marks online voices', () => {
    expect(voiceLabel(v('Google US English', 'en-US', false))).toBe('Google US English (en-US) (온라인)');
    expect(voiceLabel(v('Daniel', 'en-GB'))).toBe('Daniel (en-GB)');
  });

  it('4.3-6 uses the saved voice when it is usable', () => {
    expect(pickVoice(ALL, 'Daniel', false)?.voiceURI).toBe('Daniel');
    expect(pickVoice(ALL, 'Google US English', true)?.voiceURI).toBe('Google US English');
  });

  it('4.3-6 / 4.4-2 falls back to a default English device voice when the saved one is missing or online but not allowed', () => {
    expect(pickVoice(ALL, 'Gone', false)?.voiceURI).toBe('Samantha');
    expect(pickVoice(ALL, 'Google US English', false)?.voiceURI).toBe('Samantha');
    expect(pickVoice(ALL, undefined, true)?.voiceURI).toBe('Samantha');
    // 브라우저 기본 음성이 영어 기기 음성이면 그것을 쓴다.
    expect(pickVoice([v('Daniel', 'en-GB', true, true), v('Samantha', 'en-US')], undefined, false)?.voiceURI).toBe('Daniel');
  });

  it('4.3-7 finds nothing when no usable English voice exists', () => {
    expect(pickVoice([v('Yuna', 'ko-KR')], undefined, true)).toBeNull();
    expect(pickVoice([v('Google US English', 'en-US', false)], undefined, false)).toBeNull();
    expect(pickVoice([v('Google US English', 'en-US', false)], undefined, true)?.voiceURI).toBe('Google US English');
  });
});
