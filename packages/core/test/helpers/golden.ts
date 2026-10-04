import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Dataset } from '../../src/index.js';

// Vitest runs from packages/core in every environment; import.meta.url is not a file path under jsdom.
const FIXTURES = resolve(process.cwd(), '../../fixtures');

export const fixturePath = (name: string, file: string): string => resolve(FIXTURES, name, file);
export const readFixture = (name: string, file: string): string => readFileSync(fixturePath(name, file), 'utf8');

// Plain, order-stable form of a dataset for golden files.
export function serializeDataset(ds: Dataset): unknown {
  return {
    tokens: [...ds.tokens.values()],
    usage: ds.usage,
  };
}

export const toGolden = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
