import { describe, expect, it } from 'vitest';
import { createDataset, scanCandidates, scanUsage } from '../src/index.js';
import type { FileLike } from '../src/index.js';
import { findLiterals } from '../src/scan/literals.js';
import { findings, fromJson } from './helpers/build.js';

const file = (path: string, text: string): FileLike => ({ path, size: text.length, text: () => Promise.resolve(text) });
const values = (text: string, script = false): string[] => findLiterals(text, script).map((l) => `${l.prop}=${l.value}`);

describe('findLiterals', () => {
  it('finds colors and lengths in CSS declarations', () => {
    expect(values('.a { color: #2563EB; padding: 16px 1.5rem; background: rgba(0, 0, 0, 0.5); }')).toEqual([
      'color=#2563EB', 'padding=16px', 'padding=1.5rem', 'background=rgba(0, 0, 0, 0.5)',
    ]);
  });
  it('finds them in a script style object', () => {
    expect(values("const s = { color: '#fff', marginTop: 8 + 'px', gap: '12px' };", true)).toEqual(['color=#fff', 'gap=12px']);
  });
  it('keeps the commas of a style file in the value, so every shadow layer counts', () => {
    expect(values('a { box-shadow: 0 1px 2px #000, 0 2px 4px #111 }')).toEqual(['box-shadow=#000', 'box-shadow=#111', 'box-shadow=1px', 'box-shadow=2px', 'box-shadow=2px', 'box-shadow=4px']);
  });
  it('does not read a decimal length as its fraction', () => {
    expect(values('a { margin: 0.5rem; width: 2.25px }')).toEqual(['margin=0.5rem', 'width=2.25px']);
  });
  it('does not read digits inside rgb() as lengths', () => {
    expect(values('a { color: rgb(10px, 2px, 3px) }')).toEqual(['color=rgb(10px, 2px, 3px)']);
  });
  it('leaves custom property definitions alone', () => {
    expect(values(':root { --brand: #fff; --gap: 8px; }')).toEqual([]);
  });
  it('leaves a var() and its fallback alone, but not the rest of the value', () => {
    expect(values('a { color: var(--fg, #111); margin: var(--s) 4px }')).toEqual(['margin=4px']);
  });
  it('reads 3, 4, 6 and 8 digit hex and nothing else after a hash', () => {
    expect(values('a { b: #abc; c: #abcd; d: #aabbcc; e: #aabbccdd; f: #abcde }')).toEqual(['b=#abc', 'c=#abcd', 'd=#aabbcc', 'e=#aabbccdd']);
  });
});

describe('scanUsage literals', () => {
  async function scan(files: FileLike[]) {
    const ds = createDataset('t');
    await scanUsage(await scanCandidates(files), new Set(), ds);
    return ds;
  }
  it('records each distinct raw value once per component and property', async () => {
    const ds = await scan([file('src/Button.css', '.a { color: #FFF; }\n.b { color: #fff; padding: 8px; }')]);
    expect(ds.literals?.map((l) => [l.component, l.prop, l.value, l.kind])).toEqual([
      ['src/Button', 'color', '#FFF', 'color'], ['src/Button', 'padding', '8px', 'length'],
    ]);
  });
  it('replaces what an earlier scan found', async () => {
    const ds = await scan([file('a.css', 'a { color: #fff }')]);
    await scanUsage(await scanCandidates([file('b.css', 'a { width: 4px }')]), new Set(), ds);
    expect(ds.literals?.map((l) => l.value)).toEqual(['4px']);
  });
});

describe('hardcoded-value', () => {
  const tokens = () => fromJson({
    color: { $type: 'color', white: { $value: '#ffffff' }, surface: { base: { $value: '{color.white}' } }, brand: { $value: '#2563eb' } },
    space: { $type: 'dimension', 4: { $value: '16px' }, rem: { $value: '1rem' } },
  });
  const withLiterals = (ds: ReturnType<typeof tokens>, ...l: [string, string, 'color' | 'length'][]) => {
    ds.literals = l.map(([prop, value, kind]) => ({ component: 'Card', file: 'Card.css', prop, value, kind }));
    return ds;
  };

  it('names the token that has the same color, however it is written', () => {
    const f = findings(withLiterals(tokens(), ['color', '#2563EB', 'color'], ['background', 'rgb(37, 99, 235)', 'color']), 'hardcoded-value');
    expect(f.map((x) => x.message)).toEqual([
      'color: #2563EB is the value of color/brand',
      'background: rgb(37, 99, 235) is the value of color/brand',
    ]);
    expect(f[0]).toMatchObject({ severity: 'warn', set: 'integrity', id: null, subject: 'Card' });
  });
  it('compares lengths by pixels, so 1rem equals 16px', () => {
    const f = findings(withLiterals(tokens(), ['padding', '1rem', 'length']), 'hardcoded-value');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/^padding: 1rem is the value of space\/(4|rem) \(and 1 more\)$/);
  });
  it('suggests a non-foundation token before a foundation one', () => {
    const f = findings(withLiterals(tokens(), ['color', '#fff', 'color']), 'hardcoded-value');
    expect(f[0]?.message).toBe('color: #fff is the value of color/surface/base (and 1 more)');
  });
  it('says nothing for a value no token has', () => {
    expect(findings(withLiterals(tokens(), ['color', '#123456', 'color'], ['gap', '7px', 'length']), 'hardcoded-value')).toEqual([]);
  });
  it('says nothing when no code was scanned', () => {
    expect(findings(tokens(), 'hardcoded-value')).toEqual([]);
  });
  it('does not mistake an opaque color for a translucent one', () => {
    const ds = fromJson({ c: { $type: 'color', glass: { $value: '#ffffff80' } } });
    expect(findings(withLiterals(ds, ['color', '#fff', 'color']), 'hardcoded-value')).toEqual([]);
    expect(findings(withLiterals(ds, ['color', 'rgba(255, 255, 255, 0.5)', 'color']), 'hardcoded-value')).toHaveLength(1);
  });
  it('can be ignored for a component', () => {
    const ds = withLiterals(tokens(), ['color', '#2563eb', 'color']);
    expect(findings(ds, 'hardcoded-value', { ignore: { 'hardcoded-value': ['Card'] } })).toEqual([]);
  });
});
