import { describe, it, expect } from 'vitest';
import { isEnglishVoice, pickVoice, usableVoices, voiceLabel } from './voices';

const v = (voiceURI: string, lang: string, localService = true, isDefault = false) => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService,
  default: isDefault,
});

// 크롬 확장 프로그램 화면에서 실제로 보이는 이름을 본뜬 목록
const NATURAL_US_1 = v('Google US English 1 (Natural)', 'en-US');
const NATURAL_US_2 = v('Google US English 2 (Natural)', 'en-US');
const NATURAL_GB = v('Google UK English 1 (Natural)', 'en-GB');
const PREMIUM = v('Ava (Premium)', 'en-US');
const ENHANCED = v('Serena (Enhanced)', 'en-GB');
const BASIC = [v('Samantha', 'en-US'), v('Daniel', 'en-GB')];
const ODD = [
  v('Bubbles', 'en-US'),
  v('Zarvox', 'en-US'),
  v('Bad News', 'en-US'),
  v('Grandma (영어(미국))', 'en-US'),
  v('Chrome OS US English 1', 'en-US'),
];
const ONLINE = [v('Google US English', 'en-US', false), v('Google UK English Female', 'en-GB', false)];
const KOREAN = v('Yuna', 'ko-KR', true, true);

const names = (list: { voiceURI: string }[]) => list.map((x) => x.voiceURI);

describe('voices', () => {
  it('recognises English voices', () => {
    expect(isEnglishVoice(v('x', 'en_AU'))).toBe(true);
    expect(isEnglishVoice(v('x', 'ko-KR'))).toBe(false);
  });

  it('lists only good device voices: Natural first, then Premium and Enhanced, US English first, then by name', () => {
    const all = [KOREAN, ...ONLINE, ...ODD, ...BASIC, ENHANCED, NATURAL_GB, PREMIUM, NATURAL_US_2, NATURAL_US_1];
    expect(names(usableVoices(all).voices)).toEqual([
      'Google US English 1 (Natural)',
      'Google US English 2 (Natural)',
      'Google UK English 1 (Natural)',
      'Ava (Premium)',
      'Serena (Enhanced)',
    ]);
    expect(usableVoices(all).basicOnly).toBe(false);
  });

  it('never lists online voices, even ones with a natural name', () => {
    const onlineNatural = v('Google US English 3 (Natural)', 'en-US', false);
    expect(names(usableVoices([...ONLINE, onlineNatural, NATURAL_US_1]).voices)).toEqual([
      'Google US English 1 (Natural)',
    ]);
    expect(usableVoices(ONLINE).voices).toEqual([]);
  });

  it('falls back to plain device voices without novelty ones when no good voice exists', () => {
    const result = usableVoices([KOREAN, ...ONLINE, ...ODD, ...BASIC]);
    expect(names(result.voices)).toEqual(['Samantha', 'Daniel']);
    expect(result.basicOnly).toBe(true);
    expect(usableVoices([...ODD]).voices).toEqual([]);
  });

  it('labels voices with their language', () => {
    expect(voiceLabel(NATURAL_US_1)).toBe('Google US English 1 (Natural) (en-US)');
  });

  it('4.3-6 uses the saved voice when it is listed, otherwise the first listed voice', () => {
    const all = [...BASIC, NATURAL_US_1, NATURAL_US_2];
    expect(pickVoice(all, 'Google US English 2 (Natural)')?.voiceURI).toBe('Google US English 2 (Natural)');
    expect(pickVoice(all, 'Gone')?.voiceURI).toBe('Google US English 1 (Natural)');
    // 좋은 음성이 있으면 저장한 기본 음성이나 온라인 음성은 쓰지 않는다.
    expect(pickVoice(all, 'Samantha')?.voiceURI).toBe('Google US English 1 (Natural)');
    expect(pickVoice([...ONLINE, ...BASIC], 'Google US English')?.voiceURI).toBe('Samantha');
  });

  it('4.3-7 finds nothing when no usable English voice exists', () => {
    expect(pickVoice([KOREAN], undefined)).toBeNull();
    expect(pickVoice([...ONLINE], undefined)).toBeNull();
  });
});
