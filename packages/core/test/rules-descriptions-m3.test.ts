import { describe, expect, it } from 'vitest';
import { RULE_IDS, createDataset, parseFigmaVariables } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { RULE_FUNCTIONS } from '../src/rules/registry.js';
import { findings, fromJson, literal, withUsage } from './helpers/build.js';

describe('registry', () => {
  it('has a function for every rule, and nothing else', () => {
    expect(Object.keys(RULE_FUNCTIONS).sort()).toEqual([...RULE_IDS].sort());
  });
});

const semantic = (rows: [string, string, string?][], extra: Parameters<typeof literal>[4] = {}): Dataset => {
  const ds = createDataset();
  for (const [label, light, dark] of rows) literal(ds, label, light, dark, extra);
  return ds;
};

describe('desc-missing', () => {
  it('fires for a non-foundation token without a description', () => {
    const ds = semantic([['color/surface/base', '#fff']]);
    const f = findings(ds, 'desc-missing');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', id: 'color-surface-base', message: 'no description' });
  });

  it('stays quiet for foundation tokens and described tokens', () => {
    const ds = semantic([['color/gray/500', '#888']]);
    literal(ds, 'color/fg/base', '#111', undefined, { description: 'Body text' });
    expect(findings(ds, 'desc-missing')).toEqual([]);
  });

  it('counts an empty description as missing', () => {
    const ds = semantic([['color/surface/base', '#fff']], { description: '' });
    expect(findings(ds, 'desc-missing')).toHaveLength(1);
  });
});

describe('desc-intent', () => {
  const desc = (d: string, label = 'color/surface/base', value = '#fff'): Dataset => {
    const ds = createDataset();
    literal(ds, label, value, undefined, { description: d });
    return ds;
  };

  it('fires for a color description that names no usage word, quoting it', () => {
    const f = findings(desc('A nice blue'), 'desc-intent');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', message: '“A nice blue” doesn\'t name where it\'s used' });
  });

  it.each(['Page background', 'Text on surfaces', 'Used for the border of inputs', 'DIVIDER lines', 'Primary CTA', 'Focus ring'])('accepts %j', (d) => {
    expect(findings(desc(d), 'desc-intent')).toEqual([]);
  });

  it('only judges colors that have a description', () => {
    expect(findings(desc('A nice size', 'space/4', '16px'), 'desc-intent')).toEqual([]);
    expect(findings(semantic([['color/surface/base', '#fff']]), 'desc-intent')).toEqual([]);
  });
});

describe('scope-role', () => {
  const figma = (variables: { name: string; type: string; scopes?: string[]; value?: unknown }[]): Dataset => {
    const ds = createDataset();
    parseFigmaVariables(ds, { meta: {
      variableCollections: { c: { id: 'c', name: 'Semantic', modes: [{ modeId: 'm', name: 'Mode 1' }], defaultModeId: 'm' } },
      variables: Object.fromEntries(variables.map((v, i) => [`v${i}`, {
        id: `v${i}`, name: v.name, variableCollectionId: 'c', resolvedType: v.type, ...(v.scopes ? { scopes: v.scopes } : {}),
        valuesByMode: { m: v.value ?? (v.type === 'COLOR' ? { r: 1, g: 1, b: 1, a: 1 } : 8) },
      }])),
    } });
    return ds;
  };
  const colorVar = (name: string, scopes: string[]) => ({ name, type: 'COLOR', scopes });

  it('warns when a background token is not offered in a fill picker', () => {
    const f = findings(figma([colorVar('color/surface/base', ['TEXT_FILL'])]), 'scope-role');
    expect(f.map((x) => [x.severity, x.message])).toEqual([
      ['warn', "looks like a background token but isn't offered in FRAME_FILL or SHAPE_FILL pickers (scopes: TEXT_FILL)"],
      ['warn', 'a background token that is also offered in TEXT_FILL pickers'],
    ]);
  });

  it('warns for text and border roles with the right pickers', () => {
    const ds = figma([colorVar('color/fg/base', ['FRAME_FILL']), colorVar('color/border/base', [])]);
    const f = findings(ds, 'scope-role');
    expect(f.map((x) => x.message)).toEqual([
      "looks like a text/icon token but isn't offered in TEXT_FILL or SHAPE_FILL pickers (scopes: FRAME_FILL)",
      'a text/icon token that is also offered in FRAME_FILL pickers',
      "looks like a border token but isn't offered in STROKE_COLOR pickers (scopes: none)",
    ]);
  });

  it('is only info for ALL_SCOPES, and for ALL_FILLS on a color', () => {
    const f = findings(figma([colorVar('color/surface/base', ['ALL_SCOPES']), colorVar('color/fg/base', ['ALL_FILLS'])]), 'scope-role');
    expect(f.map((x) => [x.severity, x.message])).toEqual([
      ['info', 'scoped to ALL_SCOPES, so it is offered in every picker'],
      ['info', 'scoped to ALL_FILLS, so it is offered in every picker'],
    ]);
  });

  it('judges spacing and radius tokens', () => {
    const f = findings(figma([
      { name: 'space/4', type: 'FLOAT', scopes: ['CORNER_RADIUS'] },
      { name: 'radius/md', type: 'FLOAT', scopes: ['GAP'] },
    ]), 'scope-role');
    expect(f.map((x) => x.message)).toEqual([
      "looks like a spacing token but isn't offered in GAP or WIDTH_HEIGHT pickers (scopes: CORNER_RADIUS)",
      "looks like a radius token but isn't offered in CORNER_RADIUS pickers (scopes: GAP)",
    ]);
  });

  // The Figma parser only types a variable as a font family or weight when it carries that very scope, so
  // these two branches are reached by tokens that were typed some other way, built here by hand.
  it('judges font family and font weight tokens that were typed outside the Figma parser', () => {
    const ds = createDataset();
    literal(ds, 'font/family/base', 'Inter', undefined, { type: 'fontFamily', collection: 'Semantic' });
    literal(ds, 'font/weight/bold', '700', undefined, { type: 'fontWeight', collection: 'Semantic' });
    ds.tokens.get('font-family-base')!.scopes = ['TEXT_CONTENT'];
    ds.tokens.get('font-weight-bold')!.scopes = ['FONT_SIZE'];
    expect(findings(ds, 'scope-role').map((x) => x.message)).toEqual([
      "looks like a font family token but isn't offered in FONT_FAMILY pickers (scopes: TEXT_CONTENT)",
      "looks like a font weight token but isn't offered in FONT_WEIGHT pickers (scopes: FONT_SIZE)",
    ]);
  });

  it('stays quiet for correct scopes, foundation tokens and tokens without scopes', () => {
    const ds = figma([
      colorVar('color/surface/base', ['FRAME_FILL', 'SHAPE_FILL']), colorVar('color/fg/base', ['TEXT_FILL']),
      colorVar('color/border/base', ['STROKE_COLOR']), { name: 'space/4', type: 'FLOAT', scopes: ['GAP'] },
    ]);
    literal(ds, 'color/white', '#fff');
    literal(ds, 'color/gray/500', '#888');
    expect(findings(ds, 'scope-role')).toEqual([]);
  });

  it('ignores a color whose name gives it no role', () => {
    expect(findings(figma([colorVar('brand/primary', ['ALL_FILLS', 'TEXT_FILL'])]), 'scope-role')).toEqual([]);
  });
});

describe('usage-role', () => {
  const base = (): Dataset => semantic([['color/fg/base', '#111'], ['color/surface/base', '#fff'], ['color/border/base', '#ccc'], ['space/4', '16px']]);

  it('fires when a token is used in a property of another role', () => {
    const ds = withUsage(base(), [
      { component: 'Card', token: 'color-fg-base', prop: 'background-color' },
      { component: 'Card', token: 'color-surface-base', prop: 'border-color' },
      { component: 'Card', token: 'color-border-base', prop: 'color' },
    ]);
    const f = findings(ds, 'usage-role');
    expect(f.map((x) => x.message)).toEqual([
      "color/fg/base is a text/icon token, used as background via 'background-color'",
      "color/surface/base is a background token, used as border via 'border-color'",
      "color/border/base is a border token, used as text/icon via 'color'",
    ]);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'color-fg-base', subject: 'Card' });
  });

  it('stays quiet when roles agree, or either side has no role', () => {
    const ds = withUsage(base(), [
      { component: 'A', token: 'color-fg-base', prop: 'color' },
      { component: 'B', token: 'color-surface-base', prop: 'background' },
      { component: 'C', token: 'color-border-base', prop: 'outline-color' },
      { component: 'D', token: 'color-fg-base', prop: 'box-shadow' },
      { component: 'E', token: 'color-fg-base', prop: 'padding' },
      { component: 'F', token: 'space-4', prop: 'background' },
      { component: 'G', token: 'nope', prop: 'background' },
      { component: 'H', token: 'color-fg-base' },
    ]);
    expect(findings(ds, 'usage-role')).toEqual([]);
  });
});

describe('m3-type-role', () => {
  const type = (name: string) => fromJson({ typography: { $type: 'typography', [name]: { $value: { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 } } } });
  const m3 = { enabledRulesets: new Set(['m3'] as const) };

  it('fires for a type style whose name has no role, only when the m3 ruleset is enabled', () => {
    expect(findings(type('fancy'), 'm3-type-role')).toEqual([]);
    const f = findings(type('fancy'), 'm3-type-role', m3);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', set: 'm3', message: 'no display, headline, title, body or label in the name' });
  });

  it('stays quiet when the id names a role', () => {
    for (const n of ['body', 'display-large', 'headline', 'title-sm', 'label']) expect(findings(type(n), 'm3-type-role', m3)).toEqual([]);
  });

  it('only judges typography tokens', () => {
    expect(findings(semantic([['size/fancy', '16px']]), 'm3-type-role', m3)).toEqual([]);
  });
});

describe('m3-motion-names', () => {
  const m3 = { enabledRulesets: new Set(['m3'] as const) };
  const motion = (rows: [string, string][]): Dataset => semantic(rows.map(([l, v]): [string, string] => [l, v]));

  it('fires for a duration that is not a short, medium or long step', () => {
    const f = findings(motion([['motion/quick', '100ms'], ['motion/short2', '100ms'], ['motion/long', '500ms']]), 'm3-motion-names', m3);
    expect(f.map((x) => [x.id, x.message])).toEqual([['motion-quick', 'not a short/medium/long step']]);
    expect(f[0]).toMatchObject({ severity: 'info', set: 'm3' });
  });

  it('fires for an easing outside the standard vocabulary', () => {
    const f = findings(motion([['ease/snappy', 'cubic-bezier(0.1, 0, 0.2, 1)'], ['ease/standard', 'cubic-bezier(0.2, 0, 0, 1)'], ['ease/emphasized-decelerate', 'cubic-bezier(0.05, 0.7, 0.1, 1)'], ['ease/linear', 'linear(0, 1)']]), 'm3-motion-names', m3);
    expect(f.map((x) => [x.id, x.message])).toEqual([['ease-snappy', 'not a standard/emphasized easing name']]);
  });

  it('stays quiet for other kinds, and when the ruleset is off', () => {
    expect(findings(motion([['size/quick', '16px']]), 'm3-motion-names', m3)).toEqual([]);
    expect(findings(motion([['motion/quick', '100ms']]), 'm3-motion-names')).toEqual([]);
  });
});
