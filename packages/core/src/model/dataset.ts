import type { Dataset } from './types.js';

export function createDataset(name?: string): Dataset {
  return { name: name || 'Untitled', tokens: new Map(), usage: [] };
}
