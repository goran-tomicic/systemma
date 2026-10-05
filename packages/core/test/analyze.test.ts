import { describe, expect, it } from 'vitest';
import { analyze, createDataset } from '../src/index.js';
import type { Dataset, Finding, Profile, TokenValue } from '../src/index.js';
import { indexFindings } from '../src/analyze/analyze.js';
import { addToken } from '../src/parse/add-token.js';

const lit = (s: string): TokenValue => ({ lit: s });
const ref = (s: string): TokenValue => ({ ref: s });

function sample(): Dataset {
  const ds = createDataset('t');
  addToken(ds, 'color/white', 'light', lit('#fff'));
  addToken(ds, 'color/gray/900', 'light', lit('#111'));
  addToken(ds, 'color/surface/base', 'light', ref('color-white'));
  addToken(ds, 'color/surface/base', 'dark', ref('color-gray-900'));
  addToken(ds, 'color/fg/base', 'light', ref('color-gray-900'));
  addToken(ds, 'shadow/card', 'light', lit('0 1px 2px var(--color-gray-900)'));
  addToken(ds, 'border/default', 'light', { comp: { color: '{color.fg.base}', width: '1px', style: 'solid' } });
  addToken(ds, 'space/4', 'light', lit('16px'));
  ds.usage.push(
    { component: 'Card', file: 'card.tsx', prop: 'background', token: 'color-surface-base' },
    { component: 'Card', file: 'card.tsx', prop: 'color', token: 'color-fg-base' },
    { component: 'Page', file: 'page.tsx', prop: 'background', token: 'color-surface-base' },
  );
  return ds;
}

describe('analyze info', () => {
  const a = analyze(sample());

  it('classifies every token', () => {
    expect([...a.info.keys()]).toEqual([...sample().tokens.keys()]);
    expect(a.info.get('color-white')).toEqual({ tier: 'foundation', group: 'utility', kind: 'color', category: 'color' });
    expect(a.info.get('color-surface-base')).toMatchObject({ tier: 'common', group: 'surface', kind: 'color' });
    expect(a.info.get('space-4')).toMatchObject({ kind: 'dimension', category: 'spacing' });
  });

  it('uses the profile it is given', () => {
    const profile: Profile = { id: 'flat', tierOfId: () => 'palette', groupOfColor: () => 'all' };
    const b = analyze(sample(), { profile });
    expect(b.info.get('color-white')).toMatchObject({ tier: 'palette', group: 'all' });
  });
});

describe('analyze dependents', () => {
  const a = analyze(sample());
  const of = (id: string): string[] => [...(a.dependents.get(id) ?? [])].sort();

  it('records aliases across every mode', () => {
    expect(of('color-white')).toEqual(['color-surface-base']);
    expect(of('color-gray-900')).toEqual(['color-fg-base', 'color-surface-base', 'shadow-card']);
  });

  it('records references inside composites and embedded var()', () => {
    expect(of('color-fg-base')).toEqual(['border-default']);
    expect(a.dependents.get('color-gray-900')?.has('shadow-card')).toBe(true);
  });

  it('has no entry for tokens nothing refers to', () => {
    expect(a.dependents.has('space-4')).toBe(false);
    expect(a.dependents.has('border-default')).toBe(false);
  });

  it('records references to tokens that do not exist', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', ref('ghost'));
    expect([...(analyze(ds).dependents.get('ghost') ?? [])]).toEqual(['a']);
  });

  it('records a self reference', () => {
    const ds = createDataset();
    addToken(ds, 'a', 'light', ref('a'));
    expect([...(analyze(ds).dependents.get('a') ?? [])]).toEqual(['a']);
  });

  it('lists each dependent once even if several modes reference the same token', () => {
    const ds = createDataset();
    addToken(ds, 'base', 'light', lit('1'));
    addToken(ds, 'a', 'light', ref('base'));
    addToken(ds, 'a', 'dark', ref('base'));
    expect(analyze(ds).dependents.get('base')?.size).toBe(1);
  });
});

describe('analyze usage', () => {
  const a = analyze(sample());

  it('groups usage by token, keeping order', () => {
    expect(a.usageBy.get('color-surface-base')?.map((u) => u.component)).toEqual(['Card', 'Page']);
    expect(a.usageBy.get('color-fg-base')).toHaveLength(1);
    expect(a.usageBy.has('color-white')).toBe(false);
  });

  it('keeps usage of tokens that are not defined', () => {
    const ds = sample();
    ds.usage.push({ component: 'X', file: 'x', prop: 'p', token: 'nope' });
    expect(analyze(ds).usageBy.get('nope')).toHaveLength(1);
  });
});

describe('analyze result', () => {
  it('has no findings until rules are wired in', () => {
    const a = analyze(sample());
    expect(a.findings).toEqual([]);
    expect(a.byId.size).toBe(0);
  });

  it('handles an empty dataset', () => {
    const a = analyze(createDataset());
    expect(a.info.size + a.dependents.size + a.usageBy.size + a.findings.length).toBe(0);
  });

  it('does not change the dataset', () => {
    const ds = sample();
    const before = JSON.stringify([...ds.tokens.entries()]) + JSON.stringify(ds.usage);
    const keys = Object.keys(ds);
    analyze(ds);
    expect(JSON.stringify([...ds.tokens.entries()]) + JSON.stringify(ds.usage)).toBe(before);
    expect(Object.keys(ds)).toEqual(keys);
  });

  it('gives equal results when run twice, and independent objects', () => {
    const ds = sample();
    const a = analyze(ds);
    const b = analyze(ds);
    expect(b.info).toEqual(a.info);
    expect(b.dependents).toEqual(a.dependents);
    expect(b.info).not.toBe(a.info);
  });
});

describe('indexFindings', () => {
  const f = (id: string | null, message: string): Finding => ({ rule: 'unused', set: 'integrity', severity: 'warn', id, subject: 'x', message });

  it('groups findings by token id, in order, and skips findings without one', () => {
    const idx = indexFindings([f('a', '1'), f(null, '2'), f('b', '3'), f('a', '4')]);
    expect([...idx.keys()]).toEqual(['a', 'b']);
    expect(idx.get('a')?.map((x) => x.message)).toEqual(['1', '4']);
  });
});
