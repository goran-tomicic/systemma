import { afterEach, describe, expect, it } from 'vitest';
import { InputError } from '../src/errors.js';
import { expandSources } from '../src/sources.js';
import { tempProject } from './helpers.js';

let cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups) c(); cleanups = []; });
const project = (files: Record<string, string>): string => {
  const p = tempProject(files);
  cleanups.push(p.cleanup);
  return p.dir;
};
const paths = async (patterns: string[], base: string, cwd = base): Promise<string[]> => (await expandSources(patterns, base, cwd)).map((f) => f.path);
const failure = async (patterns: string[], base: string): Promise<string[]> => {
  try {
    await expandSources(patterns, base, base);
  } catch (e) {
    if (e instanceof InputError) return e.messages;
    throw e;
  }
  return [];
};

describe('expandSources', () => {
  it('walks a directory for token files, in path order, skipping other files', async () => {
    const dir = project({ 'tokens/b.json': '{}', 'tokens/a.css': '', 'tokens/c.scss': '', 'tokens/d.less': '', 'tokens/e.txt': '', 'tokens/sub/f.json': '{}', 'tokens/g.JSON': '{}' });
    expect(await paths(['tokens'], dir)).toEqual(['tokens/a.css', 'tokens/b.json', 'tokens/c.scss', 'tokens/d.less', 'tokens/g.JSON', 'tokens/sub/f.json']);
  });

  it('skips dependency and build directories when walking', async () => {
    const dir = project({ 'src/a.json': '{}', 'node_modules/x/a.json': '{}', 'dist/a.json': '{}', '.git/a.json': '{}', 'build/a.css': '' });
    expect(await paths(['.'], dir)).toEqual(['src/a.json']);
  });

  it('takes a named file as it is, whatever its extension', async () => {
    const dir = project({ 'x.txt': 'hello', 'a.json': '{}' });
    const files = await expandSources(['x.txt', 'a.json'], dir, dir);
    expect(files.map((f) => [f.path, f.explicit])).toEqual([['a.json', true], ['x.txt', true]]);
  });

  it('marks files found by a walk or a glob as not explicit', async () => {
    const dir = project({ 'tokens/a.json': '{}' });
    expect((await expandSources(['tokens'], dir, dir))[0]?.explicit).toBe(false);
    expect((await expandSources(['tokens/*.json'], dir, dir))[0]?.explicit).toBe(false);
  });

  it('keeps a file explicit when it is also found by a walk', async () => {
    const dir = project({ 'tokens/a.json': '{}' });
    expect((await expandSources(['tokens', 'tokens/a.json'], dir, dir))[0]?.explicit).toBe(true);
  });

  it('expands globs, with * inside a segment and ** across them', async () => {
    const dir = project({ 'tokens/a.json': '{}', 'tokens/deep/b.json': '{}', 'tokens/deep/c.css': '', 'other/d.json': '{}' });
    expect(await paths(['tokens/*.json'], dir)).toEqual(['tokens/a.json']);
    expect(await paths(['tokens/**/*.json'], dir)).toEqual(['tokens/a.json', 'tokens/deep/b.json']);
    expect(await paths(['**/*.json'], dir)).toEqual(['other/d.json', 'tokens/a.json', 'tokens/deep/b.json']);
    expect(await paths(['./tokens/*.json'], dir)).toEqual(['tokens/a.json']);
  });

  it('lists a file once however many patterns reach it', async () => {
    const dir = project({ 'tokens/a.json': '{}' });
    expect(await paths(['tokens', 'tokens/*.json', 'tokens/a.json'], dir)).toEqual(['tokens/a.json']);
  });

  it('shows paths relative to the working directory, resolved from the base', async () => {
    const dir = project({ 'cfg/tokens/a.json': '{}' });
    const files = await expandSources(['tokens'], `${dir}/cfg`, dir);
    expect(files.map((f) => f.path)).toEqual(['cfg/tokens/a.json']);
  });

  it('accepts an absolute path', async () => {
    const dir = project({ 'a.json': '{}' });
    expect(await paths([`${dir}/a.json`], dir)).toEqual(['a.json']);
  });

  it('reports a missing path, a glob with no matches and an empty directory, all together', async () => {
    const dir = project({ 'empty/readme.md': '', 'tokens/a.json': '{}' });
    expect(await failure(['nope.json', 'tokens/*.css', 'empty'], dir)).toEqual([
      'nope.json: no such file or directory.', 'tokens/*.css: no files match.', 'empty: no .json, .css, .scss or .less files inside.',
    ]);
  });
});
