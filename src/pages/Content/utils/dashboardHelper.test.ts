import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerVideoMetadata } from './dashboardHelper';
import { installFakeStore } from '../testing/fakeStore';
import { setStoreClient } from './storeClient';
import { getAuthState, startStudyStore } from './studyStore';

describe('dashboardHelper Utilities', () => {
  let store: ReturnType<typeof installFakeStore>;

  beforeEach(async () => {
    localStorage.clear();
    store = installFakeStore();
    startStudyStore();
    await vi.waitFor(() => expect(getAuthState()).toBe('in'));
    vi.stubGlobal('window', {
      netflix: undefined
    });
  });

  afterEach(() => {
    setStoreClient(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('skips metadata registration if window.netflix is unavailable', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await registerVideoMetadata('12345', 5);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('window.netflix.appContext.state.playerApp is not available')
    );
    expect(store.ops()).not.toContain('studied.put');
  });

  it('correctly parses video metadata from netflix API and stores one record for the video', async () => {
    // 넷플릭스 전역 API Mocking
    const mockGetVideoMetadata = vi.fn().mockReturnValue({
      _metadataObject: {
        video: {
          title: 'Stranger Things',
          artwork: [{ url: 'http://example.com/stranger_things.jpg' }],
          seasons: [
            {
              seq: 1,
              episodes: [
                { id: 12345, seq: 3, title: 'Chapter Three: The Polywog' }
              ]
            }
          ]
        }
      }
    });

    vi.stubGlobal('window', {
      netflix: {
        appContext: {
          state: {
            playerApp: {
              getAPI: () => ({
                getVideoMetadataByVideoId: mockGetVideoMetadata
              })
            }
          }
        }
      }
    });

    await registerVideoMetadata('12345', 8);

    const record = (await store.area!.get(['nf:studied:12345']))['nf:studied:12345'] as any;
    expect(record).toBeDefined();

    expect(record.title).toBe('Stranger Things');
    expect(record.cover).toBe('http://example.com/stranger_things.jpg');
    expect(record.epTitle).toBe('Chapter Three: The Polywog');
    expect(record.epSeq).toBe(3);
    expect(record.seasonSeq).toBe(1);
    expect(record.totalPages).toBe(8);
    expect(record.updatedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('registerVideoMetadata when signed out', () => {
  afterEach(() => {
    setStoreClient(null);
    vi.unstubAllGlobals();
  });

  it('does not write anything', async () => {
    const store = installFakeStore(null);
    startStudyStore();
    await vi.waitFor(() => expect(getAuthState()).toBe('out'));
    vi.stubGlobal('window', {
      netflix: { appContext: { state: { playerApp: { getAPI: () => ({ getVideoMetadataByVideoId: () => ({}) }) } } } },
    });
    await registerVideoMetadata('12345', 3);
    expect(store.ops()).toEqual(['auth.status']);
  });
});
