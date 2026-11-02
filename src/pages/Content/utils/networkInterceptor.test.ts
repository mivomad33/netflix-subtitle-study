import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initNetworkInterceptor, exportDataMap } from './networkInterceptor';

// subtitleHelper Mocking
vi.mock('./subtitleHelper', () => ({
  buildMediaInfo: vi.fn(() => ({
    movieId: 'movie123',
    textTracks: [
      { langCode_N: 'en', downloadableId: 'en_id' },
      { langCode_N: 'ko', downloadableId: 'ko_id' },
    ],
  })),
  getSubtitles: vi.fn(() => Promise.resolve([])),
  extractValidSubtitles: vi.fn(() => []),
  alignSubtitles: vi.fn(() => ({ printSubs: [] })),
  processExportSubtitles: vi.fn(() => []),
}));

describe('networkInterceptor', () => {
  let originalParse: typeof JSON.parse;
  let originalStringify: typeof JSON.stringify;

  beforeEach(() => {
    localStorage.clear();
    exportDataMap.clear();
    originalParse = JSON.parse;
    originalStringify = JSON.stringify;
  });

  afterEach(() => {
    JSON.parse = originalParse;
    JSON.stringify = originalStringify;
    vi.restoreAllMocks();
  });

  it('monkeypatches JSON.parse and JSON.stringify when initNetworkInterceptor is called', () => {
    initNetworkInterceptor(
      () => 'movie123',
      () => true,
      () => {}
    );

    expect(JSON.parse).not.toBe(originalParse);
    expect(JSON.stringify).not.toBe(originalStringify);
  });

  it('patches supportsPartialHydration and profiles inside JSON.stringify if present', () => {
    initNetworkInterceptor(
      () => 'movie123',
      () => true,
      () => {}
    );

    const inputData = {
      params: {
        supportsPartialHydration: false,
        profiles: ['dfxp-ls-sdh'],
      },
    };

    const resultStr = JSON.stringify(inputData);
    const parsed = originalParse(resultStr);

    expect(parsed.params.supportsPartialHydration).toBe(true);
    expect(parsed.params.profiles).toContain('webvtt-lssdh-ios8');
  });
});
