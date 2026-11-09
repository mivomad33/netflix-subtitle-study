// 음성 고르기. 기기 음성(localService) 중 듣기 좋은 영어 음성을 먼저, 온라인 영어 음성을 그 뒤에 보인다.
// 온라인 음성은 읽는 글을 외부(Google 등)로 보내므로 "(온라인)"을 붙이고, 고르지 않으면 쓰지 않는다.
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export const isEnglishVoice = (v: VoiceLike) => /^en([-_]|$)/i.test(v.lang);
const isUsEnglish = (v: VoiceLike) => /^en[-_]us$/i.test(v.lang);

// 크롬이 기기에 받아 두는 자연스러운 음성(예: "Google US English 1 (Natural)")과 macOS 고품질 음성
const isNatural = (v: VoiceLike) => /\(Natural\)/i.test(v.name);
const isPremium = (v: VoiceLike) => /\((Premium|Enhanced)\)/i.test(v.name);

// 듣기 어색한 기기 음성: macOS 효과음·옛 음성, 크롬 OS 기본 음성
const ODD_VOICE =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Chrome OS)\b/i;

const tier = (v: VoiceLike) => (isNatural(v) ? 0 : isPremium(v) ? 1 : 2);

// 목록에 보일 음성: 영어 기기 음성 중 Natural → Premium·Enhanced. 그런 음성이 하나도 없을 때만
// 어색한 음성을 뺀 기본 기기 음성을 보이고 basicOnly로 알린다. 그 뒤에 온라인 영어 음성을 붙인다.
export function usableVoices<V extends VoiceLike>(all: V[]): { voices: V[]; basicOnly: boolean } {
  const device = all.filter((v) => v.localService && isEnglishVoice(v));
  const good = device.filter((v) => tier(v) < 2);
  const voices = good.length > 0 ? good : device.filter((v) => !ODD_VOICE.test(v.name));
  const byName = (a: V, b: V) =>
    Number(isUsEnglish(b)) - Number(isUsEnglish(a)) || a.name.localeCompare(b.name, 'en', { numeric: true });
  const sorted = [...voices].sort((a, b) => tier(a) - tier(b) || byName(a, b));
  const online = all.filter((v) => !v.localService && isEnglishVoice(v)).sort(byName);
  return { voices: [...sorted, ...online], basicOnly: good.length === 0 && sorted.length > 0 };
}

// 저장한 음성이 목록에 있으면 그것, 아니면 목록의 첫 음성(기기 음성이 있으면 기기 음성).
export function pickVoice<V extends VoiceLike>(all: V[], savedURI: string | undefined): V | null {
  const { voices } = usableVoices(all);
  return (savedURI ? voices.find((v) => v.voiceURI === savedURI) : undefined) ?? voices[0] ?? null;
}

export const voiceLabel = (v: VoiceLike) => `${v.name} (${v.lang})${v.localService ? '' : ' (온라인)'}`;
