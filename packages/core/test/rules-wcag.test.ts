import { describe, expect, it } from 'vitest';
import { createDataset } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { addToken } from '../src/parse/add-token.js';
import { findings, literal, withUsage } from './helpers/build.js';

const set = (rows: [string, string, string?][]): Dataset => {
  const ds = createDataset();
  for (const [label, light, dark] of rows) literal(ds, label, light, dark);
  return ds;
};
const ALL = { enabledRulesets: new Set(['wcag', 'wcag-aaa'] as const) };

describe('contrast', () => {
  it('fires for color-fg-* below 4.5:1 on the base surface, as a warning from 3 to 4.5', () => {
    const f = findings(set([['color/surface/base', '#ffffff'], ['color/fg/muted', '#8a8a8a']]), 'contrast');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'color-fg-muted', subject: 'color/fg/muted', message: 'on color/surface/base · 3.45:1 (light)' });
  });

  it('is an error below 3:1', () => {
    const f = findings(set([['color/surface/base', '#ffffff'], ['color/fg/faint', '#cccccc']]), 'contrast');
    expect(f[0]).toMatchObject({ severity: 'error', message: 'on color/surface/base · 1.61:1 (light)' });
  });

  it('checks each mode separately', () => {
    const f = findings(set([['color/surface/base', '#fff', '#000'], ['color/fg/base', '#000', '#111']]), 'contrast');
    expect(f.map((x) => x.message)).toEqual(['on color/surface/base · 1.11:1 (dark)']);
  });

  it('checks palette solid and subtle against their -fg, and on-emphasis against the emphasis surface', () => {
    const f = findings(set([
      ['color/palette/brand/solid', '#00f'], ['color/palette/brand/solid-fg', '#222'],
      ['color/surface/emphasis', '#111'], ['color/fg/on-emphasis', '#222'],
      ['color/surface/base', '#fff'],
    ]), 'contrast');
    expect(f.map((x) => x.subject)).toEqual(['color/palette/brand/solid-fg', 'color/fg/on-emphasis']);
    expect(f[1]?.message.startsWith('on color/surface/emphasis')).toBe(true);
  });

  it('stays quiet at or above 4.5:1', () => {
    expect(findings(set([['color/surface/base', '#fff'], ['color/fg/base', '#767676']]), 'contrast')).toEqual([]);
  });

  it('flattens a translucent foreground over the background', () => {
    const solid = findings(set([['color/surface/base', '#fff'], ['color/fg/base', '#000']]), 'contrast');
    const faded = findings(set([['color/surface/base', '#fff'], ['color/fg/base', 'rgba(0,0,0,0.4)']]), 'contrast');
    expect(solid).toEqual([]);
    expect(faded).toHaveLength(1);
  });

  it('skips a translucent background and colors that are not sRGB', () => {
    expect(findings(set([['color/surface/base', 'rgba(255,255,255,0.5)'], ['color/fg/base', '#ccc']]), 'contrast')).toEqual([]);
    expect(findings(set([['color/surface/base', '#fff'], ['color/fg/base', 'oklch(0.9 0 0)']]), 'contrast')).toEqual([]);
  });

  it('needs both tokens of a pair to exist', () => {
    expect(findings(set([['color/fg/base', '#ccc']]), 'contrast')).toEqual([]);
  });

  it('follows aliases', () => {
    const ds = set([['color/surface/base', '#fff'], ['color/gray/300', '#ccc']]);
    addToken(ds, 'color/fg/base', 'light', { ref: 'color-gray-300' });
    expect(findings(ds, 'contrast')).toHaveLength(1);
  });
});

describe('contrast-aaa', () => {
  it('fires between 4.5:1 and 7:1, and only when its ruleset is enabled', () => {
    const ds = set([['color/surface/base', '#fff'], ['color/fg/base', '#6b6b6b']]);
    expect(findings(ds, 'contrast-aaa')).toEqual([]);
    const f = findings(ds, 'contrast-aaa', ALL);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', set: 'wcag-aaa', message: 'on color/surface/base · 5.33:1 (light)' });
  });

  it('stays quiet below 4.5 (that is contrast) and from 7 up', () => {
    expect(findings(set([['color/surface/base', '#fff'], ['color/fg/base', '#999']]), 'contrast-aaa', ALL)).toEqual([]);
    expect(findings(set([['color/surface/base', '#fff'], ['color/fg/base', '#222']]), 'contrast-aaa', ALL)).toEqual([]);
  });
});

describe('contrast-nontext', () => {
  it('fires for a border below 3:1 on the base surface', () => {
    const f = findings(set([['color/surface/base', '#fff'], ['color/border/base', '#dddddd']]), 'contrast-nontext');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', id: 'color-border-base', message: '1.36:1 against color/surface/base (light)' });
  });

  it('covers palette borders and their states, per mode', () => {
    const f = findings(set([
      ['color/surface/base', '#fff', '#000'],
      ['color/palette/brand/border', '#eee', '#111'],
      ['color/palette/brand/border/hover', '#000', '#fff'],
    ]), 'contrast-nontext');
    expect(f.map((x) => [x.id, x.message])).toEqual([
      ['color-palette-brand-border', '1.16:1 against color/surface/base (light)'],
      ['color-palette-brand-border', '1.11:1 against color/surface/base (dark)'],
    ]);
  });

  it('stays quiet at 3:1 or more, and without a base surface', () => {
    expect(findings(set([['color/surface/base', '#fff'], ['color/border/base', '#767676']]), 'contrast-nontext')).toEqual([]);
    expect(findings(set([['color/border/base', '#eee']]), 'contrast-nontext')).toEqual([]);
  });
});

describe('contrast-focus', () => {
  const base = (): Dataset => set([['color/surface/base', '#fff'], ['color/palette/brand/border', '#dddddd'], ['space/4', '16px']]);

  it('fires for a color used in a focus property that is below 3:1', () => {
    const ds = withUsage(base(), [{ component: 'Input', token: 'color-palette-brand-border', prop: 'focus-ring' }]);
    const f = findings(ds, 'contrast-focus');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'color-palette-brand-border', subject: 'Input', message: 'focus indicator color/palette/brand/border is 1.36:1 against color/surface/base (light)' });
  });

  it('reports a component and token once per mode, however often it is used', () => {
    const ds = withUsage(base(), [
      { component: 'Input', token: 'color-palette-brand-border', prop: 'focus-ring' },
      { component: 'Input', token: 'color-palette-brand-border', prop: 'Focus-color' },
    ]);
    expect(findings(ds, 'contrast-focus')).toHaveLength(1);
  });

  it('stays quiet for non-focus properties, non-colors, undefined tokens and strong contrast', () => {
    const ds = withUsage(base(), [
      { component: 'A', token: 'color-palette-brand-border', prop: 'border-color' },
      { component: 'B', token: 'space-4', prop: 'focus-offset' },
      { component: 'C', token: 'nope', prop: 'focus-ring' },
    ]);
    literal(ds, 'color/palette/brand/solid', '#000');
    withUsage(ds, [{ component: 'D', token: 'color-palette-brand-solid', prop: 'focus-ring' }]);
    expect(findings(ds, 'contrast-focus')).toEqual([]);
  });

  it('needs a base surface', () => {
    const ds = withUsage(set([['color/palette/brand/border', '#eee']]), [{ component: 'I', token: 'color-palette-brand-border', prop: 'focus-ring' }]);
    expect(findings(ds, 'contrast-focus')).toEqual([]);
  });
});
