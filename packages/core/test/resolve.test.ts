import { describe, expect, it } from 'vitest';
import { createDataset, resolve } from '../src/index.js';
import type { Dataset, Mode, TokenValue } from '../src/index.js';
import { addToken } from './helpers/add.js';

type Modes = Partial<Record<Mode, TokenValue>>;
const lit = (s: string): TokenValue => ({ lit: s });
const ref = (s: string): TokenValue => ({ ref: s });
const comp = (c: unknown): TokenValue => ({ comp: c });

const dataset = (tokens: Record<string, Modes>): Dataset => {
  const ds = createDataset('t');
  for (const [id, modes] of Object.entries(tokens)) {
    if (!modes.light && !modes.dark) ds.tokens.set(id, { id, label: id, path: [id], modes: {}, type: '', source: '' });
    for (const mode of ['light', 'dark'] as const) {
      const v = modes[mode];
      if (v) addToken(ds, id, mode, v);
    }
  }
  return ds;
};

describe('literals and aliases', () => {
  const ds = dataset({
    base: { light: lit('#fff'), dark: lit('#000') },
    alias: { light: ref('base'), dark: ref('base') },
    alias2: { light: ref('alias') },
  });

  it('returns a literal with a one-element chain', () => {
    expect(resolve(ds, 'base', 'light')).toEqual({ value: '#fff', chain: ['base'] });
  });

  it('follows aliases and records the chain', () => {
    expect(resolve(ds, 'alias2', 'light')).toEqual({ value: '#fff', chain: ['alias2', 'alias', 'base'] });
  });

  it('resolves per mode', () => {
    expect(resolve(ds, 'alias', 'dark')).toEqual({ value: '#000', chain: ['alias', 'base'] });
  });
});

describe('errors', () => {
  it('reports a missing starting token', () => {
    expect(resolve(dataset({}), 'nope', 'light')).toEqual({ error: 'missing', chain: ['nope'] });
  });

  it('reports a missing alias target, with the chain so far', () => {
    const ds = dataset({ a: { light: ref('b') }, b: { light: ref('gone') } });
    expect(resolve(ds, 'a', 'light')).toEqual({ error: 'missing', chain: ['a', 'b', 'gone'] });
  });

  it('reports nomode when the starting token lacks the mode', () => {
    const ds = dataset({ a: { light: lit('1') } });
    expect(resolve(ds, 'a', 'dark')).toEqual({ error: 'nomode', chain: ['a'] });
  });

  it('does not fall back to light for the starting token even if light exists', () => {
    const ds = dataset({ a: { light: ref('b') }, b: { light: lit('1') } });
    expect(resolve(ds, 'a', 'dark')).toMatchObject({ error: 'nomode' });
  });

  it('reports nomode for a token with no values at all', () => {
    const ds = dataset({ a: {} });
    expect(resolve(ds, 'a', 'light')).toEqual({ error: 'nomode', chain: ['a'] });
  });

  it('detects a self reference', () => {
    expect(resolve(dataset({ a: { light: ref('a') } }), 'a', 'light')).toEqual({ error: 'cycle', chain: ['a', 'a'] });
  });

  it('detects a longer loop and shows where it closes', () => {
    const ds = dataset({ a: { light: ref('b') }, b: { light: ref('c') }, c: { light: ref('b') } });
    expect(resolve(ds, 'a', 'light')).toEqual({ error: 'cycle', chain: ['a', 'b', 'c', 'b'] });
  });
});

describe('mode fallback after the first hop', () => {
  const ds = dataset({
    surface: { light: ref('white'), dark: ref('white') },
    white: { light: lit('#fff') },
    onlylight: { light: ref('white') },
  });

  it('lets a mode-less primitive serve both modes', () => {
    expect(resolve(ds, 'surface', 'dark')).toEqual({ value: '#fff', chain: ['surface', 'white'] });
  });

  it('still fails when the target has neither the mode nor light', () => {
    const d = dataset({ a: { dark: ref('b') }, b: { dark: lit('x') } });
    expect(resolve(d, 'a', 'light')).toEqual({ error: 'nomode', chain: ['a'] });
    expect(resolve(dataset({ a: { dark: ref('b') }, b: {} }), 'a', 'dark')).toEqual({ error: 'nomode', chain: ['a', 'b'] });
  });

  it('prefers the target own value for the requested mode', () => {
    const d = dataset({ a: { dark: ref('b') }, b: { light: lit('L'), dark: lit('D') } });
    expect(resolve(d, 'a', 'dark')).toMatchObject({ value: 'D' });
  });
});

describe('embedded var()', () => {
  const ds = dataset({
    c: { light: lit('red'), dark: lit('blue') },
    chain: { light: ref('c') },
    shadow: { light: lit('0 0 4px var(--c), 0 1px var(--c)'), dark: lit('0 0 4px var(--c)') },
    fallback: { light: lit('1px solid var(--missing, #ccc)') },
    unresolved: { light: lit('1px solid var(--missing)') },
    padded: { light: lit('var( --missing ,  10px  )') },
    viaalias: { light: lit('x var(--chain)') },
    nested: { light: lit('a var(--shadow)') },
    compositevar: { light: lit('a var(--comp)') },
    comp: { light: comp({ k: 'v' }) },
    self: { light: lit('1 var(--self)') },
    nestedfallback: { light: lit('var(--missing, var(--c))') },
  });

  it('substitutes the resolved value in the same mode', () => {
    expect(resolve(ds, 'shadow', 'light')).toMatchObject({ value: '0 0 4px red, 0 1px red' });
    expect(resolve(ds, 'shadow', 'dark')).toMatchObject({ value: '0 0 4px blue' });
  });

  it('uses the fallback when the token is missing, trimmed', () => {
    expect(resolve(ds, 'fallback', 'light')).toMatchObject({ value: '1px solid #ccc' });
    expect(resolve(ds, 'padded', 'light')).toMatchObject({ value: '10px' });
  });

  it('leaves an unresolvable var() as written', () => {
    expect(resolve(ds, 'unresolved', 'light')).toMatchObject({ value: '1px solid var(--missing)' });
  });

  it('resolves through aliases and nested literals', () => {
    expect(resolve(ds, 'viaalias', 'light')).toMatchObject({ value: 'x red' });
    expect(resolve(ds, 'nested', 'light')).toMatchObject({ value: 'a 0 0 4px red, 0 1px red' });
  });

  it('does not substitute a composite, so the fallback or original text remains', () => {
    expect(resolve(ds, 'compositevar', 'light')).toMatchObject({ value: 'a var(--comp)' });
  });

  // Pins today's behavior: a var() that refers to its own token is cut off at the depth limit, not reported
  // as a cycle, so the text repeats once per level (9 times) before the last var() is left as written.
  it('bounds a self-referencing var() without reporting a cycle', () => {
    expect(resolve(ds, 'self', 'light')).toEqual({ value: '1 1 1 1 1 1 1 1 1 var(--self)', chain: ['self'] });
  });

  // Pins today's behavior: the fallback pattern stops at the first ")", so a nested var() in a fallback is cut short.
  it('cuts a nested var() fallback at the first closing paren', () => {
    expect(resolve(ds, 'nestedfallback', 'light')).toMatchObject({ value: 'var(--c)' });
  });
});

describe('composites', () => {
  const ds = dataset({
    red: { light: lit('#f00'), dark: lit('#a00') },
    size: { light: lit('16px') },
    font: { light: comp({ family: 'Inter', size: '{size}' }) },
    brace: { light: comp({ color: '{red}', width: '1px', style: 'solid' }) },
    alias: { light: ref('brace') },
    nested: { light: comp({ layers: [{ color: '{red}' }, { color: '{red}', blur: '{size}' }], font: '{font}' }) },
    unknown: { light: comp({ color: '{nope}', other: 4, flag: true, nothing: null }) },
    group: { light: comp({ color: '{red.DEFAULT}' }) },
    loop: { light: comp({ self: '{loop}' }) },
  });

  it('replaces brace refs with resolved values', () => {
    expect(resolve(ds, 'brace', 'light')).toEqual({
      composite: { color: '#f00', width: '1px', style: 'solid' },
      raw: { color: '{red}', width: '1px', style: 'solid' },
      chain: ['brace'],
    });
  });

  it('resolves refs in the requested mode', () => {
    expect(resolve(ds, 'brace', 'dark')).toEqual({ error: 'nomode', chain: ['brace'] });
    const d = dataset({ red: { light: lit('L'), dark: lit('D') }, b: { light: comp({ c: '{red}' }), dark: comp({ c: '{red}' }) } });
    expect(resolve(d, 'b', 'dark')).toMatchObject({ composite: { c: 'D' } });
  });

  it('follows an alias to a composite', () => {
    expect(resolve(ds, 'alias', 'light')).toEqual({
      composite: { color: '#f00', width: '1px', style: 'solid' },
      raw: { color: '{red}', width: '1px', style: 'solid' },
      chain: ['alias', 'brace'],
    });
  });

  it('resolves refs inside arrays and nested composites', () => {
    expect(resolve(ds, 'nested', 'light')).toMatchObject({
      composite: {
        layers: [{ color: '#f00' }, { color: '#f00', blur: '16px' }],
        font: { family: 'Inter', size: '16px' },
      },
    });
  });

  it('leaves unresolvable refs and non-string leaves as they are', () => {
    expect(resolve(ds, 'unknown', 'light')).toMatchObject({ composite: { color: '{nope}', other: 4, flag: true, nothing: null } });
  });

  it('strips DEFAULT from a group ref', () => {
    expect(resolve(ds, 'group', 'light')).toMatchObject({ composite: { color: '#f00' } });
  });

  it('bounds a composite that refers to itself', () => {
    expect(resolve(ds, 'loop', 'light')).toMatchObject({ composite: { self: { self: expect.anything() } } });
  });

  it('only resolves refs up to a nesting depth of 8', () => {
    const nest = (levels: number, leaf: unknown): unknown => (levels === 0 ? leaf : { n: nest(levels - 1, leaf) });
    const d = dataset({ red: { light: lit('#f00') }, shallow: { light: comp(nest(7, '{red}')) }, deep: { light: comp(nest(9, '{red}')) } });
    const leafOf = (r: unknown): unknown => { let x = (r as { composite: unknown }).composite; while (x && typeof x === 'object') x = (x as { n: unknown }).n; return x; };
    expect(leafOf(resolve(d, 'shallow', 'light'))).toBe('#f00');
    expect(leafOf(resolve(d, 'deep', 'light'))).toBe('{red}');
  });
});
