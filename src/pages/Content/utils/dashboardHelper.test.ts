import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerVideoMetadata } from './dashboardHelper';
import { STORAGE_KEYS } from '../constants/storageKeys';

describe('dashboardHelper Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('window', {
      netflix: undefined
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips metadata registration if window.netflix is unavailable', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    registerVideoMetadata('12345', 5);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('window.netflix.appContext.state.playerApp is not available')
    );
    expect(localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS)).toBeNull();
  });

  it('correctly parses video metadata from netflix API and stores in localStorage', () => {
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

    registerVideoMetadata('12345', 8);

    const saved = localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS);
    expect(saved).not.toBeNull();

    const studiedVideos = JSON.parse(saved!);
    expect(studiedVideos['12345']).toBeDefined();
    
    const record = studiedVideos['12345'];
    expect(record.title).toBe('Stranger Things');
    expect(record.cover).toBe('http://example.com/stranger_things.jpg');
    expect(record.epTitle).toBe('Chapter Three: The Polywog');
    expect(record.epSeq).toBe(3);
    expect(record.seasonSeq).toBe(1);
    expect(record.totalPages).toBe(8);
    expect(record.updatedAt).toBeLessThanOrEqual(Date.now());
  });
});
