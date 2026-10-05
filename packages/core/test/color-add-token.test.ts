import { describe, expect, it } from 'vitest';
import { createDataset } from '../src/model/dataset.js';
import { toRgba, unitRgbToHex } from '../src/model/color.js';
import { addToken } from '../src/parse/add-token.js';

describe('toRgba', () => {
  it.each([
    ['#fff', [255, 255, 255, 1]],
    ['#FFFF', [255, 255, 255, 1]],
    ['#0066ff', [0, 102, 255, 1]],
    ['#0066ff80', [0, 102, 255, 0.502]],
    ['#00000000', [0, 0, 0, 0]],
    ['transparent', [0, 0, 0, 0]],
    ['  TRANSPARENT ', [0, 0, 0, 0]],
    ['rgb(10, 20, 30)', [10, 20, 30, 1]],
    ['rgba(10, 20, 30, 0.5)', [10, 20, 30, 0.5]],
    ['rgb(10 20 30 / 50%)', [10, 20, 30, 0.5]],
    ['rgb(100% 0% 50%)', [255, 0, 127, 1]],
    ['rgb(1.4, 1.6, 2.5)', [1, 2, 3, 1]],
  ])('parses %j', (input, expected) => {
    expect(toRgba(input)).toEqual(expected);
  });

  it.each([
    '#12345', '#1', '#1234567', 'red', 'hsl(0 0% 0%)', 'oklch(0.5 0.1 200)', 'color(display-p3 1 0 0)',
    'rgb(1, 2)', 'rgb(a, b, c)', 'rgba(1, 2, 3, x)', '', 'var(--x)',
  ])('rejects %j', (input) => {
    expect(toRgba(input)).toBeNull();
  });
});

describe('unitRgbToHex', () => {
  it('writes opaque colors as uppercase hex', () => {
    expect(unitRgbToHex({ r: 0, g: 0.4, b: 1 })).toBe('#0066FF');
    expect(unitRgbToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#FFFFFF');
    expect(unitRgbToHex({ r: 1, g: 1, b: 1, a: 0.9995 })).toBe('#FFFFFF');
  });

  it('writes translucent colors as rgba()', () => {
    expect(unitRgbToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    expect(unitRgbToHex({ r: 0, g: 0, b: 0, a: 0.123 })).toBe('rgba(0, 0, 0, 0.12)');
  });
});

describe('addToken', () => {
  it('creates a token keyed by canonical id, keeping the authored label and path', () => {
    const ds = createDataset();
    const t = addToken(ds, 'Color/Brand', 'light', { lit: '#fff' }, { type: 'color', source: 'a.json', format: 'dtcg', declared: true, description: 'Brand' });
    expect(ds.tokens.get('color-brand')).toBe(t);
    expect(t).toMatchObject({
      id: 'color-brand', label: 'Color/Brand', path: ['Color', 'Brand'], type: 'color', source: 'a.json', format: 'dtcg',
      declaredType: true, description: 'Brand', collection: '', modes: { light: { lit: '#fff' } },
    });
  });

  it('derives the path from the label, and takes one when it is given', () => {
    const ds = createDataset();
    expect(addToken(ds, '--space-4', 'light', { lit: '4px' })?.path).toEqual(['space-4']);
    expect(addToken(ds, 'a/b/c', 'light', { lit: '1' })?.path).toEqual(['a', 'b', 'c']);
    expect(addToken(ds, 'x.y', 'light', { lit: '1' }, { path: ['x', 'y'] })?.path).toEqual(['x', 'y']);
  });

  it('adds a second mode to the same token', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', { lit: '1' });
    addToken(ds, 'a', 'dark', { lit: '2' });
    expect(ds.tokens.size).toBe(1);
    expect(ds.tokens.get('a')?.modes).toEqual({ light: { lit: '1' }, dark: { lit: '2' } });
    expect(ds.tokens.get('a')?.collisions).toBeUndefined();
  });

  it('lets the same name overwrite its own value for a mode', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', { lit: '1' });
    addToken(ds, 'a', 'light', { lit: '2' });
    expect(ds.tokens.get('a')?.modes.light).toEqual({ lit: '2' });
  });

  it('keeps the first token and records a different name that derives the same id', () => {
    const ds = createDataset();
    const first = addToken(ds, 'a/b-c', 'light', { lit: '1' }, { source: 'one.json', format: 'dtcg' });
    const second = addToken(ds, 'a-b/c', 'light', { lit: '2' }, { source: 'two.json', format: 'dtcg' });
    expect(second).toBeNull();
    expect(ds.tokens.size).toBe(1);
    expect(first?.modes.light).toEqual({ lit: '1' });
    expect(first?.collisions).toEqual([{ label: 'a-b/c', path: ['a-b', 'c'], source: 'two.json', mode: 'light' }]);
    expect(first?.caseVariants).toBeUndefined();
  });

  it('does not let a collision change the kept token in any other way', () => {
    const ds = createDataset();
    addToken(ds, 'a/b-c', 'light', { lit: '1' }, { format: 'dtcg', type: 'color', description: 'first', collection: 'One' });
    addToken(ds, 'a-b/c', 'dark', { lit: '2' }, { format: 'dtcg', type: 'number', description: 'second', declared: true });
    expect(ds.tokens.get('a-b-c')).toMatchObject({ type: 'color', description: 'first', modes: { light: { lit: '1' } } });
    expect(ds.tokens.get('a-b-c')?.modes.dark).toBeUndefined();
    expect(ds.tokens.get('a-b-c')?.declaredType).toBeUndefined();
  });

  it('records a name that differs only by case as a collision and a case variant, once each per mode', () => {
    const ds = createDataset();
    addToken(ds, 'Color/Brand', 'light', { lit: '1' });
    addToken(ds, 'color/brand', 'light', { lit: '2' });
    addToken(ds, 'color/brand', 'dark', { lit: '3' });
    const t = ds.tokens.get('color-brand');
    expect(t?.caseVariants).toEqual(['color/brand']);
    expect(t?.collisions?.map((c) => [c.label, c.mode])).toEqual([['color/brand', 'light'], ['color/brand', 'dark']]);
    expect(t?.modes).toEqual({ light: { lit: '1' } });
  });

  it('merges the same token described in two formats, since that is meant to combine', () => {
    const ds = createDataset();
    addToken(ds, 'color/brand', 'light', { lit: '#fff' }, { format: 'dtcg' });
    const css = addToken(ds, '--color-brand', 'dark', { lit: '#000' }, { format: 'css' });
    expect(css).not.toBeNull();
    expect(ds.tokens.get('color-brand')?.modes).toEqual({ light: { lit: '#fff' }, dark: { lit: '#000' } });
    expect(ds.tokens.get('color-brand')?.collisions).toBeUndefined();
  });

  it('treats the same name in two collections as two tokens', () => {
    const ds = createDataset();
    addToken(ds, 'color/bg', 'light', { lit: '#fff' }, { format: 'figma', collection: 'Semantic' });
    const other = addToken(ds, 'color/bg', 'light', { lit: '#eee' }, { format: 'figma', collection: 'Legacy' });
    expect(other).toBeNull();
    expect(ds.tokens.get('color-bg')?.modes.light).toEqual({ lit: '#fff' });
    expect(ds.tokens.get('color-bg')?.collisions).toEqual([{ label: 'color/bg', path: ['color', 'bg'], source: '', mode: 'light', collection: 'Legacy' }]);
  });

  it('keeps the same name in the same collection as one token, whatever the mode', () => {
    const ds = createDataset();
    addToken(ds, 'color/bg', 'light', { lit: '#fff' }, { format: 'figma', collection: 'Semantic' });
    expect(addToken(ds, 'color/bg', 'dark', { lit: '#000' }, { format: 'figma', collection: 'Semantic' })).not.toBeNull();
  });

  it('keeps the first format, type and collection, but takes the latest description', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', { lit: '1' }, { format: 'css', type: 'color', collection: 'One', description: 'first' });
    const t = addToken(ds, 'a', 'dark', { lit: '2' }, { format: 'css', type: 'number', description: 'second' });
    expect(t).toMatchObject({ format: 'css', type: 'color', collection: 'One', description: 'second' });
  });

  it('does not clear a description when none is given', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', { lit: '1' }, { description: 'kept' });
    expect(addToken(ds, 'a', 'dark', { lit: '2' })?.description).toBe('kept');
  });
});
