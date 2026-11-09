import { createMemoryArea } from './storageArea';
import { defineRepoCases } from './repoCases';

defineRepoCases(async (initial) => createMemoryArea(initial));
