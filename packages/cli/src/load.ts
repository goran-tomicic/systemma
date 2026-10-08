import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, resolve } from 'node:path';
import { createDataset, detectFormat, loadResolver, parseSource } from '@systemma/core';
import type { Dataset, ReadRef, ResolverResult } from '@systemma/core';
import { InputError } from './errors.js';
import type { SourceFile } from './sources.js';

export interface Loaded {
  ds: Dataset;
  files: number;
  // Problems that do not stop the run: files that were skipped, and what the parsers warned about.
  warnings: string[];
  // Every file that was read, by absolute path. It is longer than the input when a resolver pulled in more.
  read: Set<string>;
}

// A reader for the files a resolver document points at: paths are relative to the resolver, local only.
function readerFor(file: SourceFile, referenced: Set<string>): ReadRef {
  return async (ref) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) && !/^[a-z]:[\\/]/i.test(ref)) throw new Error('only local files are read');
    const abs = isAbsolute(ref) ? ref : resolve(dirname(file.abs), ref);
    const text = await readFile(abs, 'utf8');
    referenced.add(abs);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { json, path: isAbsolute(ref) ? ref : posix.normalize(posix.join(posix.dirname(file.path), ref.split('\\').join('/'))) };
  };
}

const withResolver = async (ds: Dataset, file: SourceFile, json: unknown, referenced: Set<string>): Promise<ResolverResult> =>
  loadResolver(ds, json, readerFor(file, referenced), { path: file.path });

// Reads every file into one dataset, in path order, so the first file to define a name keeps it. A file with
// "dark" in its path is the dark mode of a DTCG file; everything else is light. A file that was named outright
// and cannot be read as tokens is an error; one found by a directory walk or a glob is skipped with a warning,
// because a package.json or a tsconfig.json is not a mistake.
// A DTCG resolver document is loaded with the files it references, and those are not loaded again on their own,
// since read alone a theme file would be taken for a light file and overwrite the resolved light values.
export async function loadDataset(files: readonly SourceFile[], opts: { stripSets: boolean }): Promise<Loaded> {
  const ds = createDataset('check');
  const warnings: string[] = [];
  const errors: string[] = [];
  const texts = new Map<SourceFile, string>();
  const read = new Set<string>();
  let loaded = 0;

  for (const file of files) {
    try {
      texts.set(file, await readFile(file.abs, 'utf8'));
      read.add(file.abs);
    } catch (e) {
      errors.push(`${file.path}: cannot be read (${e instanceof Error ? e.message : String(e)}).`);
    }
  }

  // A dry run into a scratch dataset finds which files each resolver uses, so they can be skipped below.
  const resolvers = new Map<SourceFile, unknown>();
  const skip = new Set<string>();
  for (const [file, text] of texts) {
    const d = detectFormat(text);
    if (d.kind !== 'resolver') continue;
    resolvers.set(file, d.json);
    const used = new Set<string>();
    if ((await withResolver(createDataset('dry'), file, d.json, used)).ok) for (const abs of used) skip.add(abs);
  }

  for (const file of files) {
    const text = texts.get(file);
    if (text === undefined) continue;
    const json = resolvers.get(file);
    if (json !== undefined) {
      const referenced = new Set<string>();
      const r = await withResolver(ds, file, json, referenced);
      if (!r.ok) {
        if (file.explicit) errors.push(...r.errors);
        else warnings.push(...r.errors.map((e) => `${e} Skipped.`));
        continue;
      }
      for (const abs of referenced) read.add(abs);
      loaded += 1 + r.files.length;
      warnings.push(...r.warnings);
      continue;
    }
    if (skip.has(file.abs)) continue;
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
  return { ds, files: loaded, warnings, read };
}
