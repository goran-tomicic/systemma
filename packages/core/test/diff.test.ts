import { describe, expect, it } from 'vitest';
import { createDataset, diff } from '../src/index.js';
import type { Dataset, Mode, TokenValue } from '../src/index.js';
import { sameValue } from '../src/analyze/diff.js';
import { addToken } from '../src/parse/add-token.js';

type Spec = Record<string, Partial<Record<Mode, TokenValue>>>;
const lit = (s: string): TokenValue => ({ lit: s });
const ref = (s: string): TokenValue => ({ ref: s });
const comp = (c: unknown): TokenValue => ({ comp: c });

const dataset = (spec: Spec): Dataset => {
  const ds = createDataset();
  for (const [id, modes] of Object.entries(spec)) for (const m of ['light', 'dark'] as const) { const v = modes[m]; if (v) addToken(ds, id, m, v); }
  return ds;
};

describe('sameValue', () => {
  it.each([
    ['#fff', '#FFFFFF'], ['#fff', 'rgb(255, 255, 255)'], ['#ffffff', 'rgb(255 255 254)'], ['#000', 'rgba(0, 0, 0, 1)'],
    ['rgba(0,0,0,0.5)', 'rgba(0, 0, 0, 0.505)'], ['16px', '16PX'], ['0 1px  2px #000 ', '0 1px 2px #000'], ['', ''],
    ['Inter, sans-serif', 'inter,sans-serif'],
  ])('%j equals %j', (a, b) => {
    expect(sameValue(a, b)).toBe(true);
  });

  it.each([
    ['#fff', '#fefcfc'], ['#fff', 'rgb(255, 255, 253)'], ['rgba(0,0,0,0.5)', 'rgba(0, 0, 0, 0.52)'], ['#fff', '#fff0'],
    ['16px', '1rem'], ['a', 'b'],
  ])('%j differs from %j', (a, b) => {
    expect(sameValue(a, b)).toBe(false);
  });

  it('compares missing values only to missing values', () => {
    expect(sameValue(undefined, undefined)).toBe(true);
    expect(sameValue(undefined, '')).toBe(false);
    expect(sameValue('', undefined)).toBe(false);
  });

  it('allows one channel step but not two', () => {
    expect(sameValue('rgb(10, 10, 10)', 'rgb(11, 9, 10)')).toBe(true);
    expect(sameValue('rgb(10, 10, 10)', 'rgb(12, 10, 10)')).toBe(false);
  });
});

describe('diff', () => {
  it('reports tokens present on one side only, in dataset order', () => {
    const a = dataset({ x: { light: lit('1') }, y: { light: lit('1') }, z: { light: lit('1') } });
    const b = dataset({ z: { light: lit('1') }, q: { light: lit('1') }, p: { light: lit('1') } });
    expect(diff(a, b)).toEqual({ onlyA: ['x', 'y'], onlyB: ['q', 'p'], changed: [] });
  });

  it('reports nothing for identical datasets', () => {
    const a = dataset({ x: { light: lit('#fff'), dark: lit('#000') } });
    expect(diff(a, dataset({ x: { light: lit('#fff'), dark: lit('#000') } }))).toEqual({ onlyA: [], onlyB: [], changed: [] });
  });

  it('reports a change per mode with the resolved values', () => {
    const a = dataset({ x: { light: lit('#fff'), dark: lit('#000') } });
    const b = dataset({ x: { light: lit('#fff'), dark: lit('#111') } });
    expect(diff(a, b).changed).toEqual([{ id: 'x', mode: 'dark', a: '#000', b: '#111' }]);
  });

  it('reports light before dark for the same token', () => {
    const a = dataset({ x: { light: lit('1'), dark: lit('1') } });
    const b = dataset({ x: { light: lit('2'), dark: lit('2') } });
    expect(diff(a, b).changed.map((c) => c.mode)).toEqual(['light', 'dark']);
  });

  it('ignores differences that only affect formatting', () => {
    const a = dataset({ x: { light: lit('#fff') }, y: { light: lit('0 1px 2px #000') } });
    const b = dataset({ x: { light: lit('rgb(255, 255, 255)') }, y: { light: lit('0 1px  2px #000') } });
    expect(diff(a, b).changed).toEqual([]);
  });

  it('compares resolved values, so a change in a target shows on its aliases', () => {
    const a = dataset({ base: { light: lit('#fff') }, alias: { light: ref('base') } });
    const b = dataset({ base: { light: lit('#eee') }, alias: { light: ref('base') } });
    expect(diff(a, b).changed.map((c) => c.id)).toEqual(['base', 'alias']);
  });

  it('sees through an alias that changes to a literal with the same value', () => {
    const a = dataset({ base: { light: lit('#fff') }, x: { light: ref('base') } });
    const b = dataset({ base: { light: lit('#fff') }, x: { light: lit('#ffffff') } });
    expect(diff(a, b).changed).toEqual([]);
  });

  it('shows a dash when one side has no value for the mode', () => {
    const a = dataset({ x: { light: lit('1'), dark: lit('2') } });
    const b = dataset({ x: { light: lit('1') } });
    expect(diff(a, b).changed).toEqual([{ id: 'x', mode: 'dark', a: '2', b: '—' }]);
    expect(diff(b, a).changed).toEqual([{ id: 'x', mode: 'dark', a: '—', b: '2' }]);
  });

  it('skips a mode that neither side can resolve', () => {
    const a = dataset({ x: { light: lit('1') } });
    const b = dataset({ x: { light: lit('1') } });
    expect(diff(a, b).changed).toEqual([]);
  });

  it('treats an unresolvable alias as no value', () => {
    const a = dataset({ x: { light: ref('gone') } });
    const b = dataset({ x: { light: lit('1') } });
    expect(diff(a, b).changed).toEqual([{ id: 'x', mode: 'light', a: '—', b: '1' }]);
  });

  it('compares composites by their resolved JSON', () => {
    const a = dataset({ red: { light: lit('#f00') }, b: { light: comp({ color: '{red}', width: '1px' }) } });
    const same = dataset({ red: { light: lit('#f00') }, b: { light: comp({ color: '{red}', width: '1px' }) } });
    const moved = dataset({ red: { light: lit('#00f') }, b: { light: comp({ color: '{red}', width: '1px' }) } });
    expect(diff(a, same).changed).toEqual([]);
    expect(diff(a, moved).changed.map((c) => c.id)).toEqual(['red', 'b']);
    const c = diff(a, moved).changed.find((x) => x.id === 'b');
    expect(c?.a).toBe('{"color":"#f00","width":"1px"}');
  });

  it('does not change either dataset', () => {
    const a = dataset({ x: { light: lit('1') } });
    const b = dataset({ x: { light: lit('2') } });
    const snap = JSON.stringify([...a.tokens]) + JSON.stringify([...b.tokens]);
    diff(a, b);
    expect(JSON.stringify([...a.tokens]) + JSON.stringify([...b.tokens])).toBe(snap);
  });
});
