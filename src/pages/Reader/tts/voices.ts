// 음성 고르기. 기기 음성(localService)은 글이 밖으로 나가지 않고, 온라인 음성은 글을 외부 서버로 보낸다(4.4).
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export const isEnglishVoice = (v: VoiceLike) => /^en([-_]|$)/i.test(v.lang);
export const isOnlineVoice = (v: VoiceLike) => !v.localService;

// 목록에 보일 음성: 영어만, 온라인 음성은 허용했을 때만, 기기 음성 먼저.
export function usableVoices<V extends VoiceLike>(all: V[], allowOnline: boolean): V[] {
  const english = all.filter(isEnglishVoice);
  const device = english.filter((v) => !isOnlineVoice(v));
  return allowOnline ? [...device, ...english.filter(isOnlineVoice)] : device;
}

// 저장한 음성을 쓸 수 있으면 그것, 아니면 기본 영어 기기 음성(브라우저 기본 → 미국 영어 → 첫 영어 기기 음성).
// 온라인 음성은 허용했고 영어 기기 음성이 없을 때만 대신 고른다.
export function pickVoice<V extends VoiceLike>(all: V[], savedURI: string | undefined, allowOnline: boolean): V | null {
  const list = usableVoices(all, allowOnline);
  const saved = savedURI ? list.find((v) => v.voiceURI === savedURI) : undefined;
  if (saved) return saved;
  const device = list.filter((v) => !isOnlineVoice(v));
  return (
    device.find((v) => v.default) ??
    device.find((v) => /^en[-_]us$/i.test(v.lang)) ??
    device[0] ??
    list[0] ??
    null
  );
}

export const voiceLabel = (v: VoiceLike) => `${v.name} (${v.lang})${isOnlineVoice(v) ? ' (온라인)' : ''}`;
