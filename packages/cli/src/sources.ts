import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { compileGlob } from '@systemma/core';
import { InputError } from './errors.js';

export interface SourceFile {
  // Shown in reports: relative to the working directory, with forward slashes.
  path: string;
  abs: string;
  // Named on the command line or in the config as a file, as opposed to found by walking a directory or a glob.
  explicit: boolean;
}

// What a directory walk or a glob picks up. A file named outright can be anything.
const TOKEN_FILE = /\.(json|css|scss|less)$/i;
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.turbo', '.cache', 'storybook-static', 'vendor', '.svelte-kit', '.nuxt']);
const GLOB_CHARS = /[*?]/;

const posix = (p: string): string => p.split(sep).join('/');

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) await walk(resolve(dir, e.name), out);
    } else if (e.isFile() && TOKEN_FILE.test(e.name)) out.push(resolve(dir, e.name));
  }
}

// Turns paths, directories and globs into a sorted, de-duplicated list of files. A path that does not exist
// is an error, and so is a glob that matches nothing: both are almost always a typo.
export async function expandSources(patterns: readonly string[], base: string, cwd: string): Promise<SourceFile[]> {
  const found = new Map<string, SourceFile>();
  const errors: string[] = [];
  const add = (abs: string, explicit: boolean): void => {
    const prior = found.get(abs);
    if (prior) { prior.explicit ||= explicit; return; }
    found.set(abs, { path: posix(relative(cwd, abs)), abs, explicit });
  };

  for (const pattern of patterns) {
    if (GLOB_CHARS.test(pattern)) {
      const normalized = posix(pattern).replace(/^\.\//, '');
      const segments = normalized.split('/');
      const firstGlob = segments.findIndex((s) => GLOB_CHARS.test(s));
      const root = resolve(base, ...segments.slice(0, firstGlob));
      const matcher = compileGlob(normalized);
      const files: string[] = [];
      await walk(root, files);
      const hits = files.filter((f) => matcher.test(posix(relative(base, f))));
      if (!hits.length) errors.push(`${pattern}: no files match.`);
      for (const f of hits) add(f, false);
      continue;
    }
    const abs = isAbsolute(pattern) ? pattern : resolve(base, pattern);
    let info;
    try {
      info = await stat(abs);
    } catch {
      errors.push(`${pattern}: no such file or directory.`);
      continue;
    }
    if (info.isDirectory()) {
      const files: string[] = [];
      await walk(abs, files);
      if (!files.length) errors.push(`${pattern}: no .json, .css, .scss or .less files inside.`);
      for (const f of files) add(f, false);
    } else add(abs, true);
  }
  if (errors.length) throw new InputError(errors);
  return [...found.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
