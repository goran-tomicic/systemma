import { describe, expect, it } from 'vitest';
import { analyze, createDataset } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { addToken } from '../src/parse/add-token.js';
import { findings, literal, subjects, withUsage } from './helpers/build.js';

// The tiered ruleset only runs when five palette or surface color tokens exist. The padding uses the five
// documented surfaces so it adds no findings of its own.
const padded = (rows: [string, string, string?][] = []): Dataset => {
  const ds = createDataset();
  for (const s of ['canvas', 'base', 'elevated', 'backdrop', 'emphasis']) literal(ds, `color/surface/${s}`, '#fff');
  for (const [label, light, dark] of rows) literal(ds, label, light, dark);
  return ds;
};

describe('applicability', () => {
  it('does not run on a dataset without five palette or surface colors', () => {
    const ds = createDataset();
    literal(ds, 'color/palette/foo/bogus', '#fff');
    expect(analyze(ds).findings.filter((f) => f.set === 'tiered')).toEqual([]);
    expect(findings(padded([['color/palette/foo/bogus', '#fff']]), 'tiered-palette')).toHaveLength(1);
  });
});

describe('tiered-palette', () => {
  it('fires for a palette id outside the documented pattern', () => {
    const f = findings(padded([['color/palette/foo/solid', '#fff'], ['color/palette/brand/solid/extra', '#fff']]), 'tiered-palette');
    expect(f.map((x) => x.id)).toEqual(['color-palette-foo-solid', 'color-palette-brand-solid-extra']);
    expect(f[0]).toMatchObject({ severity: 'warn', message: 'does not match palette/{role}/{variant}[/state]' });
  });

  it('accepts the documented roles, variants, states and -fg forms', () => {
    const ok = ['brand/solid', 'danger/subtle', 'success/border', 'warning/solid/hover', 'info/subtle/active', 'accent/border/disabled', 'discovery/solid/fg', 'premium/subtle/fg'];
    const ds = padded(ok.map((p): [string, string] => [`color/palette/${p}`, '#fff']));
    expect(findings(ds, 'tiered-palette')).toEqual([]);
  });

  it('does not accept hovered, pressed or focus as a state', () => {
    expect(findings(padded([['color/palette/brand/solid/hovered', '#fff']]), 'tiered-palette')).toHaveLength(1);
  });
});

describe('tiered-common', () => {
  it('fires for an undocumented surface, fg, border or bg variant', () => {
    const f = findings(padded([['color/fg/odd', '#111'], ['color/border/focus', '#111'], ['color/bg/hover', '#111']]), 'tiered-common');
    expect(subjects(f)).toEqual(['color/fg/odd', 'color/border/focus', 'color/bg/hover']);
    expect(f[0]).toMatchObject({ severity: 'warn', message: 'not a documented surface, fg, border or bg variant' });
  });

  it('adds the authored label of a rename target', () => {
    const ds = padded([['color/fg/odd', '#111'], ['Color/Fg/Base', '#222']]);
    ds.renames = { 'color-fg-odd': 'color-fg-base' };
    expect(findings(ds, 'tiered-common')[0]?.message).toBe('not a documented surface, fg, border or bg variant (renamed to Color/Fg/Base)');
  });

  it('accepts the documented set', () => {
    const ok = ['surface/canvas', 'surface/base', 'surface/elevated', 'surface/backdrop', 'surface/emphasis', 'fg/base', 'fg/muted', 'fg/subtle', 'fg/on-emphasis', 'fg/brand', 'fg/danger', 'fg/success', 'fg/warning', 'fg/info', 'border/base', 'border/muted', 'border/emphasis', 'bg/subtle', 'bg/muted', 'bg/emphasis'];
    const ds = createDataset();
    for (const p of ok) literal(ds, `color/${p}`, '#fff');
    expect(findings(ds, 'tiered-common')).toEqual([]);
  });
});

describe('tiered-vocab', () => {
  it('fires for default, light or dark used as a variant below the namespace', () => {
    const f = findings(padded([['color/palette/brand/default', '#fff'], ['color/surface/light', '#fff'], ['color/fg/dark', '#111']]), 'tiered-vocab');
    expect(f.map((x) => x.message)).toEqual(["uses 'default' as a variant name", "uses 'light' as a variant name", "uses 'dark' as a variant name"]);
  });

  it('ignores the first two segments, foundation colors and non-colors', () => {
    const ds = padded([['light/x', '#fff'], ['color/dark/500', '#000'], ['space/default', '4px']]);
    expect(findings(ds, 'tiered-vocab')).toEqual([]);
  });
});

describe('tiered-common-states', () => {
  it('fires for a state word on a common color', () => {
    const f = findings(padded([['color/surface/hover', '#eee'], ['color/fg/pressed', '#111']]), 'tiered-common-states');
    expect(f.map((x) => x.message)).toEqual(["has the state 'hover'", "has the state 'pressed'"]);
  });

  it('stays quiet for states in the palette tier and for stateless common colors', () => {
    expect(findings(padded([['color/palette/brand/solid/hover', '#fff'], ['color/fg/base', '#111']]), 'tiered-common-states')).toEqual([]);
  });
});

describe('foundation-direct', () => {
  it('fires when usage names a foundation color, with the property', () => {
    const ds = withUsage(padded([['color/gray/500', '#888']]), [
      { component: 'Card', token: 'color-gray-500', prop: 'border-color' },
      { component: 'Tag', token: 'color-gray-500' },
    ]);
    const f = findings(ds, 'foundation-direct');
    expect(f.map((x) => x.message)).toEqual(['uses foundation token color/gray/500 (border-color)', 'uses foundation token color/gray/500']);
    expect(f[0]).toMatchObject({ id: 'color-gray-500', subject: 'Card', severity: 'warn' });
  });

  it('stays quiet for semantic colors, non-colors and undefined tokens', () => {
    const ds = withUsage(padded([['space/4', '16px']]), [
      { component: 'A', token: 'color-surface-canvas' }, { component: 'B', token: 'space-4' }, { component: 'C', token: 'nope' },
    ]);
    expect(findings(ds, 'foundation-direct')).toEqual([]);
  });
});

describe('pairing', () => {
  const use = (component: string, ...tokens: string[]) => tokens.map((token) => ({ component, token }));

  it('fires for a solid background with subtle-fg text, and the reverse', () => {
    const ds = withUsage(padded(), [
      ...use('A', 'color-palette-brand-solid', 'color-palette-brand-subtle-fg'),
      ...use('B', 'color-palette-danger-subtle', 'color-palette-danger-solid-fg'),
    ]);
    const f = findings(ds, 'pairing');
    expect(f.map((x) => [x.subject, x.message])).toEqual([
      ['A', 'brand: solid background paired with subtle-fg'],
      ['B', 'danger: subtle background paired with solid-fg'],
    ]);
    expect(f[0]).toMatchObject({ id: null, severity: 'warn' });
  });

  it('reports both directions when a component does both', () => {
    const ds = withUsage(padded(), use('A', 'color-palette-brand-solid', 'color-palette-brand-subtle', 'color-palette-brand-subtle-fg', 'color-palette-brand-solid-fg'));
    expect(findings(ds, 'pairing')).toHaveLength(2);
  });

  it('stays quiet for matching pairs, for different roles, and across components', () => {
    const ds = withUsage(padded(), [
      ...use('A', 'color-palette-brand-solid', 'color-palette-brand-solid-fg'),
      ...use('B', 'color-palette-brand-solid', 'color-palette-danger-subtle-fg'),
      ...use('C', 'color-palette-brand-solid'), ...use('D', 'color-palette-brand-subtle-fg'),
    ]);
    expect(findings(ds, 'pairing')).toEqual([]);
  });
});

describe('missing-pair', () => {
  it('fires for a solid or subtle token without its -fg partner', () => {
    const ds = padded([['color/palette/brand/solid', '#00f'], ['color/palette/brand/solid/fg', '#fff'], ['color/palette/brand/subtle', '#eef']]);
    const f = findings(ds, 'missing-pair');
    expect(f.map((x) => [x.id, x.message])).toEqual([['color-palette-brand-subtle', 'no subtle-fg partner defined']]);
    expect(f[0]?.severity).toBe('warn');
  });

  it('does not ask for a partner for states or borders', () => {
    const ds = padded([['color/palette/brand/solid/hover', '#00f'], ['color/palette/brand/border', '#00f']]);
    expect(findings(ds, 'missing-pair')).toEqual([]);
  });
});

describe('rename hints', () => {
  it('fall back to the raw id when the rename target is not a defined token', () => {
    const ds = padded([['color/fg/odd', '#111']]);
    ds.renames = { 'color-fg-odd': 'color-fg-gone' };
    addToken(ds, 'color/fg/base', 'light', { lit: '#222' });
    expect(findings(ds, 'tiered-common')[0]?.message).toContain('renamed to color-fg-gone');
  });
});
