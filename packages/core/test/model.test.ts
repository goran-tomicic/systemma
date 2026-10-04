import { describe, expect, it } from 'vitest';
import { canon, createDataset, parseValue, refsOf } from '../src/index.js';

describe('canon', () => {
  it.each([
    ['color/palette/brand/solid', 'color-palette-brand-solid'],
    ['--color-palette-brand-solid', 'color-palette-brand-solid'],
    ['Color.Gray.50', 'color-gray-50'],
    ['  spacing / 4  ', 'spacing-4'],
    ['a//b..c', 'a-b-c'],
    ['--', ''],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(canon(input)).toBe(expected);
  });

  it('strips only a leading double dash', () => {
    expect(canon('a--b')).toBe('a--b');
  });

  // Pins the known lossy-id behavior so the later fix shows up as an intentional diff.
  it('collapses distinct paths into one id', () => {
    expect(canon('a/b-c')).toBe(canon('a-b/c'));
    expect(canon('Color/Brand')).toBe(canon('color/brand'));
  });
});

describe('parseValue', () => {
  it.each([
    ['{color.gray.50}', { ref: 'color-gray-50' }],
    ['  {color.gray.50}  ', { ref: 'color-gray-50' }],
    ['{color.brand.DEFAULT}', { ref: 'color-brand' }],
    ['{color.brand.default}', { ref: 'color-brand' }],
    ['{color.brand.$root}', { ref: 'color-brand' }],
    ['var(--color-a)', { ref: 'color-a' }],
    ['var( --color-a )', { ref: 'color-a' }],
    ['var(--color-a, #fff)', { ref: 'color-a' }],
    ['#FFF', { lit: '#FFF' }],
    ['  12px ', { lit: '12px' }],
    ['calc(var(--a) * 2)', { lit: 'calc(var(--a) * 2)' }],
    ['{a} {b}', { lit: '{a} {b}' }],
    ['', { lit: '' }],
  ])('%j', (input, expected) => {
    expect(parseValue(input)).toEqual(expected);
  });

  it.each([
    [4, { lit: '4' }],
    [0, { lit: '0' }],
    [true, { lit: 'true' }],
    [null, { lit: 'null' }],
    [undefined, { lit: 'undefined' }],
  ])('stringifies non-string %j', (input, expected) => {
    expect(parseValue(input)).toEqual(expected);
  });
});

describe('refsOf', () => {
  it('returns nothing for empty values', () => {
    expect(refsOf(undefined)).toEqual([]);
    expect(refsOf(null)).toEqual([]);
  });

  it('returns the alias target', () => {
    expect(refsOf({ ref: 'color-a' })).toEqual(['color-a']);
  });

  it('ignores an empty alias target', () => {
    expect(refsOf({ ref: '' })).toEqual([]);
  });

  it('finds var() and brace refs inside a literal, deduplicated', () => {
    expect(refsOf({ lit: '0 0 4px var(--shadow-color), 1px {color.x.DEFAULT} var(--shadow-color, red)' }))
      .toEqual(['color-x', 'shadow-color']); // brace refs are collected before var()
  });

  it('returns nothing for a plain literal', () => {
    expect(refsOf({ lit: '#fff' })).toEqual([]);
  });

  it('walks nested composites', () => {
    const comp = {
      fontFamily: '{font.family.base}',
      layers: [{ color: '{color.shadow}', blur: '4px' }, { color: 'var(--color-alt)' }],
      n: 3,
    };
    expect(refsOf({ comp }).sort()).toEqual(['color-alt', 'color-shadow', 'font-family-base']);
  });
});

describe('createDataset', () => {
  it('starts empty', () => {
    const ds = createDataset('x');
    expect(ds.name).toBe('x');
    expect(ds.tokens.size).toBe(0);
    expect(ds.usage).toEqual([]);
  });

  it('falls back to a default name', () => {
    expect(createDataset().name).toBe('Untitled');
    expect(createDataset('').name).toBe('Untitled');
  });
});
