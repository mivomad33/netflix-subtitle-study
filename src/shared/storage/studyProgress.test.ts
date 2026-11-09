import { createMemoryArea } from './storageArea';
import { defineStudyProgressCases } from './studyProgressCases';

defineStudyProgressCases(async (initial) => createMemoryArea(initial));
