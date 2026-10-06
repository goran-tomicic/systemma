import { describe, expect, it } from 'vitest';
import { createDataset, parseTokensJson } from '@systemma/core';
import type { Dataset } from '@systemma/core';
import { CATEGORY_ORDER, buildRows, filterRows, shortLabel } from '../src/lib/tokens';
import { aliasIn, cubicNumbers, displayValue, flatten, isCssColor, isSafeCss, shadowString, summarizeComposite } from '../src/lib/values';
import { analyze } from '@systemma/core';

const build = (light: unknown, dark?: unknown): Dataset => {
  const ds = createDataset();
  parseTokensJson(ds, light, { mode: 'light' });
  if (dark) parseTokensJson(ds, dark, { mode: 'dark' });
  return ds;
};

describe('isSafeCss', () => {
  it.each(['Inter, sans-serif', '0px 2px 8px #0000001a', '"Open Sans"', '1px solid rgba(0, 0, 0, 0.2)'])('accepts %s', (s) => expect(isSafeCss(s)).toBe(true));
  it.each(['url(https://x.test/a.png)'.replace('(', '{'), 'a; b: c', 'x</style>', 'a\\b', 'x@import'])('refuses %s', (s) => expect(isSafeCss(s)).toBe(false));
});

describe('isCssColor', () => {
  it.each(['#fff', '#0066FF', '#00000080', 'rgb(1, 2, 3)', 'rgba(0, 0, 0, 0.5)', 'transparent'])('accepts %s', (v) => expect(isCssColor(v)).toBe(true));
  it('does not paint a value that still has a var() in it', () => expect(isCssColor('var(--a)')).toBe(false));
  it('does not paint text that is not a color', () => expect(isCssColor('16px')).toBe(false));
});

describe('cubicNumbers', () => {
  it('reads four numbers', () => expect(cubicNumbers('cubic-bezier(0.4, 0, 0.2, 1)')).toEqual([0.4, 0, 0.2, 1]));
  it.each(['ease', 'cubic-bezier(1, 2)', 'cubic-bezier(a, b, c, d)', undefined, 4])('refuses %j', (v) => expect(cubicNumbers(v)).toBeNull());
});

describe('shadows', () => {
  const layer = { offsetX: '0px', offsetY: '2px', blur: '8px', spread: '1px', color: '#000' };
  it('writes one layer as CSS, with defaults for what is missing', () => {
    expect(shadowString(layer)).toBe('0px 2px 8px 1px #000');
    expect(shadowString({ color: '#111' })).toBe('0px 0px 0px 0px #111');
    expect(shadowString({})).toBe('0px 0px 0px 0px transparent');
  });
  it('writes layers in order, with inset', () => {
    expect(shadowString([layer, { ...layer, inset: true }])).toBe('0px 2px 8px 1px #000, inset 0px 2px 8px 1px #000');
    expect(shadowString({ ...layer, inset: 'true' })).toMatch(/^inset /);
  });
  it('ignores what is not a layer', () => expect(shadowString(['x', 4, null, layer])).toBe('0px 2px 8px 1px #000'));
});

describe('summarizeComposite', () => {
  it('describes typography as family, weight and size over line height', () => {
    expect(summarizeComposite('typography', { fontFamily: '"Inter", sans-serif', fontWeight: '700', fontSize: '16px', lineHeight: '1.5' })).toBe('Inter 700 16px/1.5');
    expect(summarizeComposite('typography', { fontFamily: 'Inter' })).toBe('Inter ?');
  });
  it('describes a border, a transition and a shadow', () => {
    expect(summarizeComposite('border', { width: '1px', style: 'solid', color: '#000' })).toBe('1px solid #000');
    expect(summarizeComposite('transition', { duration: '150ms', timingFunction: 'ease' })).toBe('150ms ease');
    expect(summarizeComposite('shadow', [{ color: '#000' }, { color: '#111' }, { color: '#222' }])).toBe('0px 0px 0px 0px #000 +2');
  });
  it('falls back to a cut-off JSON for anything else', () => {
    expect(summarizeComposite('', { a: 1 })).toBe('{"a":1}');
    expect(summarizeComposite('gradient', { x: 'y'.repeat(200) })).toHaveLength(80);
  });
});

describe('displayValue', () => {
  const ds = build({ a: { $type: 'color', $value: '#fff' }, b: { $type: 'color', $value: '{a}' }, c: { $type: 'color', $value: '{nope}' }, d: { $type: 'color', $value: '{e}' }, e: { $type: 'color', $value: '{d}' },
    t: { $type: 'border', $value: { width: '1px', style: 'solid', color: '{a}' } } });

  it('shows a value, following aliases', () => expect(displayValue(ds, 'b', 'light', 'color')).toEqual({ text: '#fff', kind: 'value' }));
  it('shows a composite in a few words, with its references resolved', () => expect(displayValue(ds, 't', 'light', 'border')).toEqual({ text: '1px solid #fff', kind: 'composite' }));
  it('says when a mode has no value', () => expect(displayValue(ds, 'a', 'dark', 'color')).toEqual({ text: 'no dark value', kind: 'missing', error: 'nomode' }));
  it('says when an alias points nowhere, or loops', () => {
    expect(displayValue(ds, 'c', 'light', 'color')).toMatchObject({ text: 'missing', kind: 'missing', error: 'missing' });
    expect(displayValue(ds, 'd', 'light', 'color')).toMatchObject({ text: 'cycle', error: 'cycle' });
  });
});

describe('flatten and aliasIn', () => {
  it('lists every leaf with its path', () => {
    expect(flatten({ a: 1, b: { c: 'x', d: [2, { e: 3 }] } })).toEqual([['a', 1], ['b.c', 'x'], ['b.d[0]', 2], ['b.d[1].e', 3]]);
    expect(flatten('x')).toEqual([['', 'x']]);
  });
  it('reads an alias written inside a composite as a canonical id', () => {
    expect(aliasIn('{color.brand.500}')).toBe('color-brand-500');
    expect(aliasIn('{Color/Brand.DEFAULT}')).toBe('color-brand');
    expect(aliasIn('{color.brand.$root}')).toBe('color-brand');
  });
  it.each(['#fff', '{a} {b}', 4, null, undefined, 'var(--a)'])('does not read %j as an alias', (v) => expect(aliasIn(v)).toBeNull());
});

describe('token rows', () => {
  const ds = build({
    space: { $type: 'dimension', 10: { $value: '40px' }, 2: { $value: '8px' } },
    color: { $type: 'color', white: { $value: '#fff', $description: 'Page background' }, surface: { base: { $value: '{color.white}' } } },
    radius: { $type: 'dimension', md: { $value: '4px' } },
    nope: { $type: 'color', $value: '{missing}' },
  });
  const analysis = analyze(ds, { profile: 'tiered' });
  const rows = buildRows(ds, analysis);

  it('sorts by category, then tier, then name with numbers in order', () => {
    const cats = rows.map((r) => r.info.category);
    expect(cats).toEqual([...cats].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)));
    expect(rows.filter((r) => r.info.category === 'spacing').map((r) => r.token.id)).toEqual(['space-2', 'space-10']);
    const tiers = rows.filter((r) => r.info.category === 'color').map((r) => r.info.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => ['foundation', 'common', 'palette'].indexOf(a) - ['foundation', 'common', 'palette'].indexOf(b)));
  });

  it('counts each token\'s findings by severity', () => {
    expect(rows.find((r) => r.token.id === 'nope')?.counts.error).toBe(1);
    expect(rows.find((r) => r.token.id === 'color-white')?.counts).toEqual({ error: 0, warn: 0, info: 0 });
  });

  it('filters by tier, category and text', () => {
    const f = (tier: 'all' | 'foundation' | 'common', category: 'all' | 'color' | 'spacing', query = '') => filterRows(rows, { tier, category, query }).map((r) => r.token.id);
    expect(f('all', 'all')).toHaveLength(rows.length);
    expect(f('common', 'all')).toContain('color-surface-base');
    expect(f('all', 'spacing')).toEqual(['space-2', 'space-10']);
    expect(f('all', 'all', 'PAGE BACKGROUND')).toEqual(['color-white']);
    expect(f('all', 'all', 'surface/base')).toEqual(['color-surface-base']);
    expect(f('foundation', 'spacing', 'zzz')).toEqual([]);
  });

  it('shortens a name by the prefixes a list shares', () => {
    expect(shortLabel({ label: '--color-brand' } as never)).toBe('brand');
    expect(shortLabel({ label: 'color/surface/base' } as never)).toBe('surface/base');
    expect(shortLabel({ label: 'space/4' } as never)).toBe('space/4');
  });
});
