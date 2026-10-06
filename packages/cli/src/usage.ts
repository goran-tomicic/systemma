import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { scanCandidates, scanUsage } from '@systemma/core';
import type { Dataset, FileLike } from '@systemma/core';
import { InputError } from './errors.js';

// Core skips these again by path; skipping them here means not even listing a node_modules tree.
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.turbo', '.cache', 'storybook-static', 'vendor', '.svelte-kit', '.nuxt']);

const posix = (p: string): string => p.split(sep).join('/');

async function listFiles(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) await listFiles(resolve(dir, e.name), out);
    } else if (e.isFile()) out.push(resolve(dir, e.name));
  }
}

export interface UsageScan {
  records: number;
  warnings: string[];
}

// Finds where the tokens already in `ds` are used, in the code under `inputs`, and adds that to `ds.usage`.
// Token files that were loaded are left out of the scan: their own aliases are not usage, and counting them
// would make every aliased token look used. Usage that is already in the dataset (from a usage JSON file)
// is kept, although core's scan on its own would replace it.
export async function scanUsageInputs(inputs: readonly string[], base: string, cwd: string, ds: Dataset, loadedTokenFiles: ReadonlySet<string>): Promise<UsageScan> {
  const errors: string[] = [];
  const abs = new Set<string>();
  for (const input of inputs) {
    const target = isAbsolute(input) ? input : resolve(base, input);
    let info;
    try {
      info = await stat(target);
    } catch {
      errors.push(`usage ${input}: no such file or directory.`);
      continue;
    }
    if (info.isDirectory()) {
      const found: string[] = [];
      await listFiles(target, found);
      for (const f of found) abs.add(f);
    } else abs.add(target);
  }
  if (errors.length) throw new InputError(errors);

  const files: FileLike[] = [];
  for (const file of [...abs].sort()) {
    if (loadedTokenFiles.has(file)) continue;
    const size = (await stat(file)).size;
    files.push({ path: posix(relative(cwd, file)), size, text: () => readFile(file, 'utf8') });
  }

  const before = ds.usage;
  const scan = await scanCandidates(files);
  await scanUsage(scan, new Set(), ds);
  const found = ds.usage;
  ds.usage = [...before, ...found];

  const warnings = found.length || !ds.tokens.size ? [] : [`usage: no use of any token was found in ${inputs.join(', ')}. Is that the right place?`];
  return { records: found.length, warnings };
}
