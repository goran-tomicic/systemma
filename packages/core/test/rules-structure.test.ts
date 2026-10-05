import { describe, expect, it } from 'vitest';
import { createDataset } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { findings, literal, subjects } from './helpers/build.js';

const build = (rows: [string, string, string?][]): Dataset => {
  const ds = createDataset();
  for (const [label, light, dark] of rows) literal(ds, label, light, dark);
  return ds;
};

describe('mixed-separator', () => {
  // Ids are canonical, so c/solid-hover and c/solid/hover would merge into one token; the rule can only see
  // a fused modifier whose id differs from the path form, such as solid-fg beside solid/hover. This is the
  // lossy-id limitation, and it is why the fused modifier in these cases is not a state spelled both ways.
  it('fires when a modifier is fused into the name while a sibling uses a path segment', () => {
    const ds = build([['color/solid/hover', '#111'], ['color/solid-fg', '#fff'], ['color/solid', '#000']]);
    const f = findings(ds, 'mixed-separator');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'color-solid-fg', message: "fuses 'fg' into the name, while a sibling uses 'solid/hover'" });
  });

  it('works for every fused state word, ignoring case', () => {
    const ds = build([['c/Solid/active', '#1'], ['c/Solid-FG', '#2'], ['c/solid-Disabled', '#3']]);
    const f = findings(ds, 'mixed-separator');
    expect(subjects(f)).toEqual(['c/Solid-FG', 'c/solid-Disabled']);
    // the sibling is matched and shown lowercased
    expect(f[1]?.message).toBe("fuses 'Disabled' into the name, while a sibling uses 'solid/active'");
  });

  it('cannot see a fused modifier that collapses into its path form', () => {
    const ds = build([['color/solid/hover', '#111'], ['color/solid-hover', '#222']]);
    expect(ds.tokens.size).toBe(1);
    expect(findings(ds, 'mixed-separator')).toEqual([]);
  });

  it('stays quiet when no sibling uses the segment form', () => {
    expect(findings(build([['c/solid-hover', '#1'], ['c/solid-fg', '#2'], ['c/solid', '#3']]), 'mixed-separator')).toEqual([]);
  });

  it('stays quiet for a sibling that is not a state word', () => {
    expect(findings(build([['c/solid/extra', '#1'], ['c/solid-hover', '#2']]), 'mixed-separator')).toEqual([]);
  });

  it('only looks at slash labels', () => {
    expect(findings(build([['c-solid-hover', '#1'], ['c-solid-fg', '#2'], ['c-solid-active', '#3']]), 'mixed-separator')).toEqual([]);
  });
});

describe('state-position', () => {
  it('fires when anything but fg follows a state word', () => {
    const f = findings(build([['btn/hover/bg', '#1'], ['btn/disabled/fg/extra', '#2']]), 'state-position');
    expect(f.map((x) => x.message)).toEqual(["state 'hover' is followed by 'bg'", "state 'disabled' is followed by 'fg-extra'"]);
    expect(f[0]).toMatchObject({ severity: 'info' });
  });

  it('judges the last state word when there are several', () => {
    const f = findings(build([['a/hover/active/x', '#1']]), 'state-position');
    expect(f[0]?.message).toBe("state 'active' is followed by 'x'");
  });

  it('stays quiet when the state is last or only fg follows', () => {
    expect(findings(build([['btn/bg/hover', '#1'], ['btn/solid/hover/fg', '#2'], ['btn/plain', '#3']]), 'state-position')).toEqual([]);
  });
});

describe('state-vocab', () => {
  it('flags the minority spelling of a state concept', () => {
    const ds = build([['a/hover', '1'], ['b/hover', '2'], ['c/hover', '3'], ['d/hovered', '4']]);
    const f = findings(ds, 'state-vocab');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'd-hovered', message: "uses 'hovered'; 'hover' is used by 3 tokens" });
  });

  it('uses the singular for one token, and breaks ties by the listed order', () => {
    const f = findings(build([['a/hover', '1'], ['b/hovered', '2']]), 'state-vocab');
    expect(f.map((x) => x.message)).toEqual(["uses 'hovered'; 'hover' is used by 1 token"]);
  });

  it('compares each concept on its own, covering pressed, active and down', () => {
    const ds = build([['a/pressed', '1'], ['b/pressed', '2'], ['c/active', '3'], ['d/down', '4'], ['e/focus', '5'], ['f/focused', '6']]);
    expect(findings(ds, 'state-vocab').map((x) => x.id)).toEqual(['c-active', 'd-down', 'f-focused']);
  });

  it('stays quiet when each concept has one spelling', () => {
    expect(findings(build([['a/hover', '1'], ['b/pressed', '2'], ['c/focus', '3'], ['d/selected', '4'], ['e/disabled', '5']]), 'state-vocab')).toEqual([]);
  });
});

describe('hue-in-semantic', () => {
  it('fires for a hue name in a common or palette color token', () => {
    const ds = build([['color/surface/blue', '#00f'], ['color/palette/red/solid', '#f00']]);
    const f = findings(ds, 'hue-in-semantic');
    expect(f.map((x) => x.message)).toEqual(["names the hue 'blue'", "names the hue 'red'"]);
  });

  it('stays quiet for foundation colors, non-colors and role names', () => {
    const ds = build([['color/blue/500', '#00f'], ['space/blue', '4px'], ['color/surface/base', '#fff']]);
    expect(findings(ds, 'hue-in-semantic')).toEqual([]);
  });

  it('does not match a hue inside a longer word', () => {
    expect(findings(build([['color/surface/reddish', '#fff']]), 'hue-in-semantic')).toEqual([]);
  });
});

describe('sibling-gap', () => {
  const palette = (roles: Record<string, string[]>): Dataset =>
    build(Object.entries(roles).flatMap(([r, vs]) => vs.map((v): [string, string] => [`color/palette/${r}/${v}`, '#fff'])));

  it('fires for a role missing a variant that at least half the roles define', () => {
    const ds = palette({ brand: ['solid', 'subtle', 'border'], danger: ['solid', 'subtle', 'border'], info: ['solid', 'subtle'] });
    const f = findings(ds, 'sibling-gap');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: null, subject: 'palette/info', message: "missing 'border' (defined for 2 of 3 roles)" });
  });

  it('needs three roles', () => {
    expect(findings(palette({ brand: ['solid', 'border'], danger: ['solid'] }), 'sibling-gap')).toEqual([]);
  });

  it('stays quiet when the variant is in a minority of roles', () => {
    const ds = palette({ brand: ['solid', 'extra'], danger: ['solid'], info: ['solid'], warn: ['solid'] });
    expect(findings(ds, 'sibling-gap')).toEqual([]);
  });

  it('treats fused and path forms as the same variant, because ids are canonical', () => {
    const ds = palette({ a: ['solid-fg'], b: ['solid-fg'], c: ['solid/fg'] });
    expect(findings(ds, 'sibling-gap')).toEqual([]);
  });
});

describe('size-style', () => {
  it('fires on the minority style in a literal foundation group of three or more', () => {
    const ds = build([['size/xs', '4px'], ['size/sm', '8px'], ['size/md', '12px'], ['size/1', '16px']]);
    const f = findings(ds, 'size-style');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'size-1', message: 'numeric step in a group that mostly uses t-shirt sizes (size)' });
  });

  it('flags the t-shirt steps when numbers are the majority, and the t-shirt side on a tie', () => {
    const maj = build([['size/1', '4px'], ['size/2', '8px'], ['size/3', '12px'], ['size/md', '16px']]);
    expect(findings(maj, 'size-style').map((f) => f.message)).toEqual(["t-shirt step in a group that mostly uses numbers (size)"]);
    const tie = build([['size/1', '4px'], ['size/2', '8px'], ['size/sm', '12px'], ['size/md', '16px']]);
    expect(findings(tie, 'size-style').map((f) => f.id)).toEqual(['size-sm', 'size-md']);
  });

  it('stays quiet under three tokens, or when only one style is used', () => {
    expect(findings(build([['size/xs', '4px'], ['size/1', '8px']]), 'size-style')).toEqual([]);
    expect(findings(build([['size/1', '4px'], ['size/2', '8px'], ['size/3', '12px']]), 'size-style')).toEqual([]);
  });

  it('ignores colors and non-literal tokens', () => {
    const ds = build([['c/xs', '#111'], ['c/sm', '#222'], ['c/md', '#333'], ['c/1', '#444']]);
    expect(findings(ds, 'size-style')).toEqual([]);
  });
});
