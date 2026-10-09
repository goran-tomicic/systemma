import { describe, expect, it } from 'vitest';
import { findings, fromCss, fromJson, withUsage } from './helpers/build.js';

const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });
const msgs = (fs: ReturnType<typeof findings>): string[] => fs.map((f) => `${f.subject}: ${f.message}`);

describe('alias-type-mismatch', () => {
  it('fires when a declared type differs from the type of what the alias points at', () => {
    const ds = fromJson({ c: color('#fff'), gap: { $type: 'dimension', $value: '{c}' } });
    const f = findings(ds, 'alias-type-mismatch');
    expect(msgs(f)).toEqual(['gap: light: declares $type dimension but refers to c, which is color']);
    expect(f[0]).toMatchObject({ severity: 'warn', set: 'dtcg', id: 'gap' });
  });
  it('reports each mode that does it', () => {
    const ds = fromJson({ c: color('#fff'), n: { $type: 'number', $value: 1 }, gap: { $type: 'dimension', $value: '{n}' } });
    fromJson({ gap: { $type: 'dimension', $value: '{c}' } }, { mode: 'dark', ds });
    expect(msgs(findings(ds, 'alias-type-mismatch'))).toEqual([
      'gap: light: declares $type dimension but refers to n, which is number',
      'gap: dark: declares $type dimension but refers to c, which is color',
    ]);
  });
  it('is quiet when the types agree, including through a group type', () => {
    const ds = fromJson({ g: { $type: 'color', a: { $value: '#fff' }, b: { $value: '{g.a}' } }, c: color('{g.a}') });
    expect(findings(ds, 'alias-type-mismatch')).toEqual([]);
  });
  it('is quiet when the token declares no type, since it takes its target\'s', () => {
    expect(findings(fromJson({ c: color('#fff'), x: { $value: '{c}' } }), 'alias-type-mismatch')).toEqual([]);
  });
  it('does not call a number behind a fontWeight a mismatch', () => {
    const ds = fromJson({ w: { $type: 'number', $value: 700 }, fw: { $type: 'fontWeight', $value: '{w}' } });
    expect(findings(ds, 'alias-type-mismatch')).toEqual([]);
  });
  it('leaves a missing target to broken-ref', () => {
    expect(findings(fromJson({ gap: { $type: 'dimension', $value: '{nope}' } }), 'alias-type-mismatch')).toEqual([]);
  });
  it('does not trust a target whose type was only guessed from its value', () => {
    const ds = fromJson({ guessed: { $value: '#ffffff' }, gap: { $type: 'dimension', $value: '{guessed}' } });
    expect(findings(ds, 'alias-type-mismatch')).toEqual([]);
  });
  it('only looks at DTCG tokens', () => {
    const ds = fromCss(':root { --c: #fff; --gap: var(--c); }');
    expect(findings(ds, 'alias-type-mismatch')).toEqual([]);
  });
});

describe('deprecated-no-reason', () => {
  it('fires for $deprecated: true', () => {
    const f = findings(fromJson({ old: color('#fff', { $deprecated: true }) }), 'deprecated-no-reason');
    expect(msgs(f)).toEqual(['old: is deprecated, with no explanation of why or what to use instead']);
    expect(f[0]).toMatchObject({ severity: 'info', set: 'dtcg', id: 'old' });
  });
  it('is quiet when there is an explanation, and when the token is not deprecated', () => {
    const ds = fromJson({
      a: color('#111', { $deprecated: 'use b' }),
      b: color('#222', { $deprecated: false }),
      c: color('#333'),
    });
    expect(findings(ds, 'deprecated-no-reason')).toEqual([]);
  });
});

describe('deprecated-in-use', () => {
  it('fires for a deprecated token that a component still uses', () => {
    const ds = withUsage(fromJson({ old: color('#fff', { $deprecated: 'use new' }) }), [
      { component: 'Card', prop: 'color', token: 'old' }, { component: 'Card', prop: 'border-color', token: 'old' }, { component: 'Badge', token: 'old' },
    ]);
    const f = findings(ds, 'deprecated-in-use');
    expect(msgs(f)).toEqual(['old: is deprecated (use new) but still used by 2 components (Badge, Card)']);
    expect(f[0]).toMatchObject({ severity: 'warn', set: 'integrity', id: 'old' });
  });
  it('fires for a deprecated token that a live token refers to', () => {
    const ds = fromJson({ old: color('#fff', { $deprecated: true }), live: color('{old}') });
    expect(msgs(findings(ds, 'deprecated-in-use'))).toEqual(['old: is deprecated but still used by 1 token (live)']);
  });
  it('names both, and cuts a long list', () => {
    const ds = withUsage(fromJson({ old: color('#fff', { $deprecated: true }), a: color('{old}'), b: color('{old}'), c: color('{old}'), d: color('{old}') }), [{ component: 'X', token: 'old' }]);
    expect(msgs(findings(ds, 'deprecated-in-use'))).toEqual(['old: is deprecated but still used by 1 component (X) and 4 tokens (a, b, c, …)']);
  });
  it('lets a deprecated token refer to a deprecated one, since both are on the way out', () => {
    const ds = fromJson({ old: color('#fff', { $deprecated: true }), older: color('{old}', { $deprecated: true }) });
    expect(findings(ds, 'deprecated-in-use')).toEqual([]);
  });
  it('is quiet for a deprecated token nothing uses, and for tokens that are not deprecated', () => {
    expect(findings(fromJson({ old: color('#fff', { $deprecated: true }), x: color('#000'), y: color('{x}') }), 'deprecated-in-use')).toEqual([]);
  });
  it('is quiet when $deprecated is false', () => {
    const ds = withUsage(fromJson({ x: color('#fff', { $deprecated: false }) }), [{ component: 'C', token: 'x' }]);
    expect(findings(ds, 'deprecated-in-use')).toEqual([]);
  });
});
