import { describe, it, expect } from 'vitest';
import { calculateSmartSkimTarget, Sentence } from './smartSkimHelper';

describe('smartSkimHelper - calculateSmartSkimTarget', () => {
  const mockSentences: Sentence[] = [
    { startTime_ms: 10000, endTime_ms: 15000, text: 'First sentence' },
    { startTime_ms: 30000, endTime_ms: 35000, text: 'Second sentence' },
    { startTime_ms: 38000, endTime_ms: 42000, text: 'Third sentence' },
  ];

  it('returns no_sentences if sentence list is empty', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 5000,
      sentences: [],
      lastSkimTimeMs: null,
    });
    expect(result.shouldSeek).toBe(false);
    expect(result.reason).toBe('no_sentences');
  });

  it('does not seek during active sentence playback (including buffer)', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 12000, // inside sentence 1 (10000 ~ 15000)
      sentences: mockSentences,
      lastSkimTimeMs: null,
    });
    expect(result.shouldSeek).toBe(false);
    expect(result.reason).toBe('active_sentence');
  });

  it('holds preview for 2 seconds (2000ms) right after a skim operation', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 16500, // 1100ms after last skim at 15400 (preview holding for 2000ms)
      sentences: mockSentences,
      lastSkimTimeMs: 15400,
    });
    expect(result.shouldSeek).toBe(false);
    expect(result.reason).toBe('preview_holding');
  });

  it('triggers a 5-second jump if next sentence is far away (>5s) and preview hold time expired', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 17500, // 2100ms after last skim at 15400 (hold expired after 2000ms)
      sentences: mockSentences, // next sentence starts at 30000 (12.5s away)
      lastSkimTimeMs: 15400,
    });
    expect(result.shouldSeek).toBe(true);
    expect(result.targetTimeMs).toBe(22500); // 17500 + 5000
    expect(result.reason).toBe('jump_default_step');
  });

  it('jumps to 1 second before next sentence if interval is less than 5 seconds', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 36000, // sentence 2 ended at 35000. Next is at 38000 (2초 남음)
      sentences: mockSentences,
      lastSkimTimeMs: null,
    });
    expect(result.shouldSeek).toBe(true);
    expect(result.targetTimeMs).toBe(37000); // 38000 - 1000
    expect(result.reason).toBe('jump_to_next_sentence_prep');
  });

  it('does not seek if approaching next sentence within 1.5 seconds', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 36800, // 1.2s before 38000
      sentences: mockSentences,
      lastSkimTimeMs: null,
    });
    expect(result.shouldSeek).toBe(false);
    expect(result.reason).toBe('approaching_next_sentence');
  });

  it('continues jumping 5s forward if there are no more sentences remaining', () => {
    const result = calculateSmartSkimTarget({
      currentTimeMs: 50000, // past all sentences
      sentences: mockSentences,
      lastSkimTimeMs: null,
    });
    expect(result.shouldSeek).toBe(true);
    expect(result.targetTimeMs).toBe(55000);
    expect(result.reason).toBe('jump_end_of_video');
  });
});
