import { describe, it, expect } from 'vitest';
import { netflixMemo } from '../../../shared/storage/testFixtures';
import { netflixWatchUrl } from './netflixUrl';

describe('netflixWatchUrl', () => {
  it('links to the sentence start in whole seconds', () => {
    expect(
      netflixWatchUrl(
        netflixMemo({ sourceId: '81234567', sentenceStartMs: 65_900 })
      )
    ).toBe('https://www.netflix.com/watch/81234567?t=65');
  });

  it('links to the start when asked or when there is no time', () => {
    const memo = netflixMemo({ sourceId: '81234567', sentenceStartMs: 65_900 });
    expect(netflixWatchUrl(memo, { fromStart: true })).toBe(
      'https://www.netflix.com/watch/81234567'
    );
    expect(
      netflixWatchUrl(
        netflixMemo({ sourceId: '81234567', sentenceStartMs: undefined })
      )
    ).toBe('https://www.netflix.com/watch/81234567');
  });

  it('encodes the id', () => {
    expect(
      netflixWatchUrl(netflixMemo({ sourceId: 'a/b c' }), { fromStart: true })
    ).toBe('https://www.netflix.com/watch/a%2Fb%20c');
  });
});
