import { readFile } from 'node:fs/promises';
import { createDataset, parseSource } from '@systemma/core';
import type { Dataset } from '@systemma/core';
import { InputError } from './errors.js';
import type { SourceFile } from './sources.js';

export interface Loaded {
  ds: Dataset;
  files: number;
  // Problems that do not stop the run: files that were skipped, and what the parsers warned about.
  warnings: string[];
}

// Reads every file into one dataset, in path order, so the first file to define a name keeps it. A file with
// "dark" in its path is the dark mode of a DTCG file; everything else is light. A file that was named outright
// and cannot be read as tokens is an error; one found by a directory walk or a glob is skipped with a warning,
// because a package.json or a tsconfig.json is not a mistake.
export async function loadDataset(files: readonly SourceFile[], opts: { stripSets: boolean }): Promise<Loaded> {
  const ds = createDataset('check');
  const warnings: string[] = [];
  const errors: string[] = [];
  let loaded = 0;

  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file.abs, 'utf8');
    } catch (e) {
      errors.push(`${file.path}: cannot be read (${e instanceof Error ? e.message : String(e)}).`);
      continue;
    }
    const result = parseSource(ds, text, { path: file.path, stripSets: opts.stripSets });
    if (!result.ok) {
      if (file.explicit) errors.push(`${file.path}: ${result.message}`);
      else warnings.push(`${file.path}: skipped. ${result.message}`);
      continue;
    }
    loaded++;
    for (const w of result.warnings) warnings.push(`${file.path}: ${w}`);
  }
  if (errors.length) throw new InputError(errors);
  return { ds, files: loaded, warnings };
}
