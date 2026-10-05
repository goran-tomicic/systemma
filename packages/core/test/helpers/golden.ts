import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Dataset, FileLike } from '../../src/index.js';

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

// A directory of files as FileLike objects, with paths relative to its root.
export function readRepo(name: string): FileLike[] {
  const root = resolve(FIXTURES, name, 'repo');
  const out: FileLike[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push({ path: relative(root, full).split(sep).join('/'), size: statSync(full).size, text: () => Promise.resolve(readFileSync(full, 'utf8')) });
    }
  };
  walk(root);
  return out;
}
