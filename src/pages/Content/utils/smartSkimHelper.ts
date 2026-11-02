export interface Sentence {
  startTime_ms: number;
  endTime_ms: number;
  text?: string;
  hTranslation?: string;
}

export interface SkimTargetOptions {
  currentTimeMs: number;
  sentences: Sentence[];
  lastSkimTimeMs: number | null;
  previewHoldDurationMs?: number; // 기본값 2000ms (2초 미리보기)
  defaultJumpMs?: number; // 기본값 5000ms (5초 점프)
}

export interface SkimTargetResult {
  shouldSeek: boolean;
  targetTimeMs: number | null;
  reason:
    | 'no_sentences'
    | 'active_sentence'
    | 'preview_holding'
    | 'approaching_next_sentence'
    | 'jump_to_next_sentence_prep'
    | 'jump_default_step'
    | 'jump_end_of_video';
}

/**
 * 스마트 템포 스킴 (2초 미리보기 건너뛰기) 타겟 시간 계산 유틸리티
 */
export function calculateSmartSkimTarget({
  currentTimeMs,
  sentences,
  lastSkimTimeMs,
  previewHoldDurationMs = 2000,
  defaultJumpMs = 5000,
}: SkimTargetOptions): SkimTargetResult {
  if (!sentences || sentences.length === 0) {
    return { shouldSeek: false, targetTimeMs: null, reason: 'no_sentences' };
  }

  // 1. 활성 자막(대사) 구간인지 확인 (+400ms 오디오 잔향 버퍼 포함)
  const activeSentence = sentences.find(
    (s) => currentTimeMs >= s.startTime_ms && currentTimeMs <= s.endTime_ms + 400
  );
  if (activeSentence) {
    return { shouldSeek: false, targetTimeMs: null, reason: 'active_sentence' };
  }

  // 2. 스킵 직후 2초 미리보기 보류(Preview Hold) 기간인지 확인
  if (lastSkimTimeMs !== null) {
    const elapsedSinceLastSkim = currentTimeMs - lastSkimTimeMs;
    if (elapsedSinceLastSkim >= 0 && elapsedSinceLastSkim < previewHoldDurationMs) {
      return { shouldSeek: false, targetTimeMs: null, reason: 'preview_holding' };
    }
  }

  // 3. 다음 대사 탐색
  const nextSentence = sentences.find((s) => s.startTime_ms > currentTimeMs);

  if (nextSentence) {
    const intervalToNext = nextSentence.startTime_ms - currentTimeMs;

    // 다음 대사 시작 1.5초 전 이내로 근접했으면 점프하지 않고 자연스레 진입하도록 둠
    if (intervalToNext <= 1500) {
      return { shouldSeek: false, targetTimeMs: null, reason: 'approaching_next_sentence' };
    }

    // 다음 대사까지 5초 미만 남았으면 다음 대사 1초 전 위치로 점프
    if (intervalToNext < defaultJumpMs) {
      const targetTimeMs = Math.max(currentTimeMs, nextSentence.startTime_ms - 1000);
      return { shouldSeek: true, targetTimeMs, reason: 'jump_to_next_sentence_prep' };
    }

    // 다음 대사까지 5초 이상 많이 남았으면 5초 앞으로 점프
    const targetTimeMs = currentTimeMs + defaultJumpMs;
    return { shouldSeek: true, targetTimeMs, reason: 'jump_default_step' };
  }

  // 4. 다음 대사가 더 이상 없더라도 영상 끝까지 5초 단위 점프
  const targetTimeMs = currentTimeMs + defaultJumpMs;
  return { shouldSeek: true, targetTimeMs, reason: 'jump_end_of_video' };
}
