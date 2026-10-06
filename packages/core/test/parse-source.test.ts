import { describe, expect, it } from 'vitest';
import { createDataset, parseSource } from '../src/index.js';

const json = (v: unknown): string => JSON.stringify(v);
const color = (v: string) => ({ $type: 'color', $value: v });

describe('parseSource', () => {
  it.each([
    [json({ c: color('#fff') }), 'dtcg'],
    [':root { --a: 1px; }', 'css'],
    [json([{ component: 'B', token: 'c' }]), 'usage'],
    [json({ meta: { variables: {}, variableCollections: {} } }), 'figma'],
  ] as const)('recognizes %s as %s', (text, kind) => {
    const r = parseSource(createDataset(), text, { path: 'x' });
    expect(r).toMatchObject({ ok: true, kind });
  });

  it('parses into the dataset and reports the count', () => {
    const ds = createDataset();
    const r = parseSource(ds, json({ c: { a: color('#fff'), b: color('#000') } }), { path: 'tokens/light.json' });
    expect(r).toEqual({ ok: true, kind: 'dtcg', count: 2, warnings: [] });
    expect(ds.tokens.get('c-a')?.source).toBe('tokens/light.json');
  });

  it('reads a DTCG file as dark when its path says dark, and light otherwise', () => {
    const text = json({ c: color('#000') });
    const dark = createDataset();
    parseSource(dark, text, { path: 'Theme.DARK.json' });
    expect(dark.tokens.get('c')?.modes).toEqual({ dark: { lit: '#000' } });
    const light = createDataset();
    parseSource(light, text, { path: 'theme.json' });
    expect(light.tokens.get('c')?.modes).toEqual({ light: { lit: '#000' } });
  });

  it('lets an explicit mode override the path', () => {
    const ds = createDataset();
    parseSource(ds, json({ c: color('#000') }), { path: 'dark.json', mode: 'light' });
    expect(ds.tokens.get('c')?.modes).toEqual({ light: { lit: '#000' } });
  });

  it('ignores the mode for CSS, which names its own', () => {
    const ds = createDataset();
    parseSource(ds, ':root { --a: 1 } .dark { --a: 2 }', { path: 'dark.css', mode: 'light' });
    expect(ds.tokens.get('a')?.modes).toEqual({ light: { lit: '1' }, dark: { lit: '2' } });
  });

  it('strips Tokens Studio set names only when asked', () => {
    const text = json({ global: { color: { p: { value: '#fff', type: 'color' } } } });
    const stripped = createDataset();
    parseSource(stripped, text, { path: 'ts.json', stripSets: true });
    expect([...stripped.tokens.keys()]).toEqual(['color-p']);
    const kept = createDataset();
    parseSource(kept, text, { path: 'ts.json' });
    expect([...kept.tokens.keys()]).toEqual(['global-color-p']);
  });

  it('passes on what the parser warned about', () => {
    const r = parseSource(createDataset(), ':root { --A: 1; --a: 2 }', { path: 'a.css' });
    expect(r).toMatchObject({ ok: true, warnings: ["'--a' has the same id as '--A' (a) and was not merged."] });
  });

  it.each([['{nope', /^Invalid JSON/], ['', /^Empty input/], ['hello', /^Unrecognized format/]])('fails, without throwing, for %j', (text, pattern) => {
    const ds = createDataset();
    const r = parseSource(ds, text, { path: 'x' });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toMatch(pattern);
    expect(ds.tokens.size).toBe(0);
  });
});
