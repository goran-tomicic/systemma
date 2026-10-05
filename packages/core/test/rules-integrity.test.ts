import { describe, expect, it } from 'vitest';
import { analyze, createDataset } from '../src/index.js';
import { addToken } from '../src/parse/add-token.js';
import { findings, fromCss, fromJson, literal, subjects, withUsage } from './helpers/build.js';

describe('broken-ref', () => {
  it('fires for an alias to a token that is not defined, naming the mode', () => {
    const ds = fromJson({ a: { $type: 'color', $value: '{nope}' } });
    const f = findings(ds, 'broken-ref');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', set: 'integrity', id: 'a', subject: 'a', message: "light: references nope, which isn't defined" });
  });

  it('fires for a broken ref inside a composite and for an embedded var()', () => {
    const ds = fromJson({ b: { $type: 'border', $value: { color: '{gone}', width: '1px', style: 'solid' } } });
    fromCss(':root { --s: 0 0 var(--missing) }', ds);
    expect(findings(ds, 'broken-ref').map((f) => f.message)).toEqual([
      "light: references gone, which isn't defined",
      "light: references missing, which isn't defined",
    ]);
  });

  it('reports each mode separately', () => {
    const ds = fromJson({ a: { $value: '{nope}' } });
    fromJson({ a: { $value: '{nope}' } }, { mode: 'dark', ds });
    expect(findings(ds, 'broken-ref')).toHaveLength(2);
  });

  it('stays quiet when every reference resolves', () => {
    const ds = fromJson({ base: { $value: '#fff' }, a: { $value: '{base}' }, b: { $value: 'var(--base)' } });
    expect(findings(ds, 'broken-ref')).toEqual([]);
  });
});

describe('cycle', () => {
  it('fires once per mode with the loop shown by labels', () => {
    const ds = fromJson({ a: { $value: '{b}' }, b: { $value: '{a}' } });
    const f = findings(ds, 'cycle');
    expect(subjects(f).sort()).toEqual(['a', 'b']);
    expect(f.find((x) => x.id === 'a')?.message).toBe('light: a › b › a');
    expect(f[0]).toMatchObject({ severity: 'error', set: 'integrity' });
  });

  it('fires for a self reference', () => {
    expect(findings(fromJson({ a: { $value: '{a}' } }), 'cycle').map((f) => f.message)).toEqual(['light: a › a']);
  });

  it('only checks modes the token has', () => {
    const ds = fromJson({ a: { $value: '{a}' } });
    expect(findings(ds, 'cycle').every((f) => f.message.startsWith('light:'))).toBe(true);
  });

  it('stays quiet for a chain without a loop', () => {
    expect(findings(fromJson({ a: { $value: '#fff' }, b: { $value: '{a}' }, c: { $value: '{b}' } }), 'cycle')).toEqual([]);
  });
});

describe('broken-usage', () => {
  it('fires for usage of an undefined token, with the property when there is one', () => {
    const ds = withUsage(fromJson({ a: { $value: '#fff' } }), [
      { component: 'Button', token: 'nope', prop: 'background' },
      { component: 'Card', token: 'gone' },
    ]);
    const f = findings(ds, 'broken-usage');
    expect(f.map((x) => x.message)).toEqual([
      "uses nope (background), which isn't defined",
      "uses gone, which isn't defined",
    ]);
    expect(f.map((x) => x.id)).toEqual([null, null]);
    expect(subjects(f)).toEqual(['Button', 'Card']);
  });

  it('adds a rename hint using the authored label of the new token', () => {
    const ds = fromJson({ 'Color/New': { $value: '#fff' } });
    ds.renames = { 'color-old': 'color-new' };
    withUsage(ds, [{ component: 'X', token: 'color-old' }]);
    expect(findings(ds, 'broken-usage')[0]?.message).toBe("uses color-old, which isn't defined — renamed to Color/New");
  });

  it('does not treat inherited object keys as renames', () => {
    const ds = createDataset();
    ds.renames = {};
    withUsage(ds, [{ component: 'X', token: 'constructor' }]);
    expect(findings(ds, 'broken-usage')[0]?.message).toBe("uses constructor, which isn't defined");
  });

  it('stays quiet when every used token exists', () => {
    const ds = withUsage(fromJson({ a: { $value: '#fff' } }), [{ component: 'X', token: 'a' }]);
    expect(findings(ds, 'broken-usage')).toEqual([]);
  });
});

describe('mode-gap', () => {
  const pair = (): ReturnType<typeof createDataset> => {
    const ds = createDataset();
    literal(ds, 'color/white', '#fff'); // foundation, exempt
    literal(ds, 'color/surface/base', '#fff', '#000');
    return ds;
  };

  it('fires for a color above foundation with no dark value when others have one', () => {
    const ds = pair();
    literal(ds, 'color/fg/base', '#111');
    const f = findings(ds, 'mode-gap');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: 'color-fg-base', severity: 'warn', message: 'has a light value but no dark value' });
  });

  it('exempts foundation colors and non-color tokens', () => {
    const ds = pair();
    literal(ds, 'space/4', '16px');
    expect(findings(ds, 'mode-gap')).toEqual([]);
  });

  it('stays quiet when no color token has a dark value at all', () => {
    const ds = createDataset();
    literal(ds, 'color/surface/base', '#fff');
    literal(ds, 'color/fg/base', '#111');
    expect(findings(ds, 'mode-gap')).toEqual([]);
  });

  it('does not count a dark value on a non-color token as dark data', () => {
    const ds = createDataset();
    literal(ds, 'space/4', '16px', '12px');
    literal(ds, 'color/surface/base', '#fff');
    expect(findings(ds, 'mode-gap')).toEqual([]);
  });
});

describe('unused', () => {
  const build = (): ReturnType<typeof createDataset> => {
    const ds = createDataset();
    literal(ds, 'color/white', '#fff');
    addToken(ds, 'color/surface/base', 'light', { ref: 'color-white' });
    addToken(ds, 'color/fg/base', 'light', { lit: '#111' });
    addToken(ds, 'color/fg/muted', 'light', { ref: 'color-fg-base' });
    return ds;
  };

  it('fires for a non-foundation token with no usage and no dependents', () => {
    const ds = withUsage(build(), [{ component: 'X', token: 'color-surface-base' }]);
    const f = findings(ds, 'unused');
    expect(f.map((x) => x.id)).toEqual(['color-fg-muted']);
    expect(f[0]).toMatchObject({ severity: 'info', message: 'not referenced by usage data or other tokens' });
  });

  it('counts other tokens as references, and exempts foundation tokens', () => {
    const ds = withUsage(build(), [{ component: 'X', token: 'color-surface-base' }]);
    expect(findings(ds, 'unused').map((x) => x.id)).not.toContain('color-fg-base');
    expect(findings(ds, 'unused').map((x) => x.id)).not.toContain('color-white');
  });

  it('stays quiet when there is no usage data', () => {
    expect(findings(build(), 'unused')).toEqual([]);
  });
});

describe('audit wiring', () => {
  it('orders findings by ruleset, then by rule order within the set', () => {
    const ds = fromJson({ a: { $value: '{nope}' }, b: { $value: '{c}' }, c: { $value: '{b}' } });
    const rules = analyze(ds).findings.filter((f) => f.set === 'integrity').map((f) => f.rule);
    expect(rules.indexOf('broken-ref')).toBeLessThan(rules.indexOf('cycle'));
  });

  it('can silence one rule and recolor another', () => {
    const ds = fromJson({ a: { $value: '{nope}' }, b: { $value: '{b}' } });
    const a = analyze(ds, { severityOverrides: { cycle: 'off', 'broken-ref': 'info' } });
    expect(a.findings.filter((f) => f.rule === 'cycle')).toEqual([]);
    expect(a.findings.find((f) => f.rule === 'broken-ref')?.severity).toBe('info');
  });

  it('skips rulesets that are not enabled', () => {
    const ds = fromJson({ a: { $value: '{nope}' } });
    expect(analyze(ds, { enabledRulesets: new Set(['dtcg']) }).findings.some((f) => f.set === 'integrity')).toBe(false);
  });
});
