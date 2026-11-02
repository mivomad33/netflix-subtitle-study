import { describe, it, expect } from 'vitest';
import { migrateChecklists } from './checklistMigrator';

describe('checklistMigrator utility', () => {
  it('should return default structure when input is null or undefined', () => {
    const resNull = migrateChecklists(null);
    expect(resNull).toEqual({
      currentActiveRound: 1,
      rounds: {
        1: {}
      }
    });

    const resUndefined = migrateChecklists(undefined);
    expect(resUndefined).toEqual({
      currentActiveRound: 1,
      rounds: {
        1: {}
      }
    });
  });

  it('should migrate old single-round structure (object without rounds key)', () => {
    const oldData = {
      0: { preStudy: true, noSubtitles: false, scriptAnalysis: false, shadowing: false, speaking: false },
      1: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true }
    };
    const res = migrateChecklists(oldData);
    expect(res).toEqual({
      currentActiveRound: 1,
      rounds: {
        1: oldData
      }
    });
  });

  it('should keep multi-round structure as-is if already in correct format', () => {
    const multiRoundData = {
      currentActiveRound: 2,
      rounds: {
        1: {
          0: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true }
        },
        2: {
          0: { preStudy: true, noSubtitles: false, scriptAnalysis: false, shadowing: false, speaking: false }
        }
      }
    };
    const res = migrateChecklists(multiRoundData);
    expect(res).toEqual(multiRoundData);
  });
});
