import { afterEach, describe, expect, it } from 'vitest';
import { InputError } from '../src/errors.js';
import { loadDataset } from '../src/load.js';
import { expandSources } from '../src/sources.js';
import { tempProject, tokens } from './helpers.js';

let cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups) c(); cleanups = []; });

async function load(files: Record<string, string>, patterns: string[], stripSets = false) {
  const p = tempProject(files);
  cleanups.push(p.cleanup);
  return loadDataset(await expandSources(patterns, p.dir, p.dir), { stripSets });
}
const messages = async (files: Record<string, string>, patterns: string[]): Promise<string[]> => {
  try {
    await load(files, patterns);
  } catch (e) {
    if (e instanceof InputError) return e.messages;
    throw e;
  }
  return [];
};
const color = (v: string) => ({ $type: 'color', $value: v });

describe('loadDataset', () => {
  it('reads DTCG JSON, CSS and usage JSON into one dataset and counts the files', async () => {
    const { ds, files, warnings } = await load({
      'tokens/a.json': tokens({ c: { a: color('#fff') } }),
      'styles/t.css': ':root { --space-4: 4px; }',
      'usage.json': tokens([{ component: 'Btn', token: 'c/a' }]),
    }, ['tokens', 'styles', 'usage.json']);
    expect(files).toBe(3);
    expect(warnings).toEqual([]);
    expect([...ds.tokens.keys()].sort()).toEqual(['c-a', 'space-4']);
    expect(ds.usage).toHaveLength(1);
  });

  it('reads a Figma variables export', async () => {
    const figma = { meta: { variableCollections: { c: { id: 'c', name: 'S', modes: [{ modeId: 'm', name: 'M' }], defaultModeId: 'm' } }, variables: { v: { id: 'v', name: 'color/bg', variableCollectionId: 'c', resolvedType: 'COLOR', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } } } } };
    const { ds } = await load({ 'figma.json': tokens(figma) }, ['figma.json']);
    expect(ds.tokens.get('color-bg')?.format).toBe('figma');
  });

  it('takes a file with "dark" in its path as the dark mode', async () => {
    const { ds } = await load({
      'tokens/light.json': tokens({ c: color('#fff') }),
      'tokens/dark.json': tokens({ c: color('#000') }),
      'dark/extra.json': tokens({ d: color('#111') }),
    }, ['tokens', 'dark']);
    expect(ds.tokens.get('c')?.modes).toEqual({ light: { lit: '#fff' }, dark: { lit: '#000' } });
    expect(ds.tokens.get('d')?.modes).toEqual({ dark: { lit: '#111' } });
  });

  it('passes the file path as the source of each token', async () => {
    const { ds } = await load({ 'tokens/a.json': tokens({ c: color('#fff') }) }, ['tokens']);
    expect(ds.tokens.get('c')?.source).toBe('tokens/a.json');
  });

  it('lets the first file in path order keep a name that two files define differently', async () => {
    const { ds, warnings } = await load({
      'tokens/a.json': tokens({ 'a-b': { c: color('#111') } }),
      'tokens/b.json': tokens({ a: { 'b-c': color('#222') } }),
    }, ['tokens']);
    expect(ds.tokens.get('a-b-c')?.modes.light).toEqual({ lit: '#111' });
    expect(warnings).toEqual(["tokens/b.json: 'a/b-c' has the same id as 'a-b/c' (a-b-c) and was not merged."]);
  });

  it('strips Tokens Studio set names only when asked', async () => {
    const files = { 'ts.json': tokens({ global: { color: { p: { value: '#fff', type: 'color' } } } }) };
    expect([...(await load(files, ['ts.json'], true)).ds.tokens.keys()]).toEqual(['color-p']);
    expect([...(await load(files, ['ts.json'], false)).ds.tokens.keys()]).toEqual(['global-color-p']);
  });

  it('skips a file found by a walk that is not a token file, and says so', async () => {
    const { files, warnings } = await load({ 'tokens/ok.json': tokens({ c: color('#fff') }), 'tokens/bad.json': '{nope', 'tokens/empty.css': '.a { color: red }' }, ['tokens']);
    expect(files).toBe(1);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^tokens\/bad\.json: skipped\. Invalid JSON/);
    expect(warnings[1]).toBe('tokens/empty.css: skipped. Unrecognized format. Expected JSON or CSS custom properties.');
  });

  it('fails for a file that was named outright and cannot be read as tokens', async () => {
    expect((await messages({ 'bad.json': '{nope' }, ['bad.json']))[0]).toMatch(/^bad\.json: Invalid JSON/);
    expect(await messages({ 'notes.txt': 'hello' }, ['notes.txt'])).toEqual(['notes.txt: Unrecognized format. Expected JSON or CSS custom properties.']);
  });

  it('reports every unreadable named file, not just the first', async () => {
    expect(await messages({ 'a.txt': 'x', 'b.txt': 'y' }, ['a.txt', 'b.txt'])).toHaveLength(2);
  });

  it('prefixes parser warnings with the file they came from', async () => {
    const { warnings } = await load({ 'a.css': ':root { --A: 1; --a: 2 }' }, ['a.css']);
    expect(warnings).toEqual(["a.css: '--a' has the same id as '--A' (a) and was not merged."]);
  });
});
