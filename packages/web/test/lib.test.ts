import { describe, expect, it } from 'vitest';
import { analyze } from '@systemma/core';
import type { Finding } from '@systemma/core';
import { EXAMPLE_SOURCES } from '../src/lib/example';
import { countBySeverity, filterFindings, groupByRule } from '../src/lib/findings';
import { loadSources } from '../src/lib/sources';
import type { SourceEntry } from '../src/lib/sources';
import { TIERS, tierCounts } from '../src/lib/tiers';

const entry = (id: number, name: string, text: string, extra: Partial<SourceEntry> = {}): SourceEntry => ({ id, name, text, ...extra });
const color = (v: string) => ({ $type: 'color', $value: v });
const json = (v: unknown): string => JSON.stringify(v);

describe('loadSources', () => {
  it('parses each source into one dataset and says what each was', () => {
    const { ds, sources } = loadSources([
      entry(1, 'a.json', json({ c: { a: color('#fff') } })),
      entry(2, 'b.css', ':root { --space-4: 4px; }'),
      entry(3, 'u.json', json([{ component: 'B', token: 'c/a' }])),
    ], { stripSets: false });
    expect(sources.map((s) => [s.kind, s.count, s.error])).toEqual([['dtcg', 1, null], ['css', 1, null], ['usage', 1, null]]);
    expect([...ds.tokens.keys()]).toEqual(['c-a', 'space-4']);
    expect(ds.usage).toHaveLength(1);
  });

  it('keeps a source that cannot be used, with the reason, and carries on with the rest', () => {
    const { ds, sources } = loadSources([entry(1, 'bad.json', '{nope'), entry(2, 'ok.json', json({ c: color('#fff') }))], { stripSets: false });
    expect(sources[0]).toMatchObject({ kind: null, count: 0 });
    expect(sources[0]?.error).toMatch(/^Invalid JSON/);
    expect(sources[1]?.error).toBeNull();
    expect(ds.tokens.size).toBe(1);
  });

  it('shows a file that could not be read as an error without trying to parse it', () => {
    const { sources } = loadSources([entry(1, 'x.json', '', { readError: 'Could not read this file (denied).' })], { stripSets: false });
    expect(sources[0]).toMatchObject({ kind: null, error: 'Could not read this file (denied).' });
  });

  it('lets the first source keep a name two sources define differently, and passes on the warning', () => {
    const { ds, sources } = loadSources([
      entry(1, 'one.json', json({ 'a-b': { c: color('#111') } })),
      entry(2, 'two.json', json({ a: { 'b-c': color('#222') } })),
    ], { stripSets: false });
    expect(ds.tokens.get('a-b-c')?.modes.light).toEqual({ lit: '#111' });
    expect(sources[1]?.warnings).toEqual(["'a/b-c' has the same id as 'a-b/c' (a-b-c) and was not merged."]);
  });

  it('reads a DTCG source as dark from its name, and lets a chosen mode win', () => {
    const text = json({ c: color('#000') });
    expect(loadSources([entry(1, 'dark.json', text)], { stripSets: false }).ds.tokens.get('c')?.modes).toEqual({ dark: { lit: '#000' } });
    expect(loadSources([entry(1, 'dark.json', text, { mode: 'light' })], { stripSets: false }).ds.tokens.get('c')?.modes).toEqual({ light: { lit: '#000' } });
    expect(loadSources([entry(1, 'x.json', text, { mode: 'dark' })], { stripSets: false }).ds.tokens.get('c')?.modes).toEqual({ dark: { lit: '#000' } });
  });

  it('drops Tokens Studio set names only when asked', () => {
    const text = json({ global: { color: { p: { value: '#fff', type: 'color' } } } });
    expect([...loadSources([entry(1, 't.json', text)], { stripSets: true }).ds.tokens.keys()]).toEqual(['color-p']);
    expect([...loadSources([entry(1, 't.json', text)], { stripSets: false }).ds.tokens.keys()]).toEqual(['global-color-p']);
  });

  it('is empty for no sources', () => {
    const { ds, sources } = loadSources([], { stripSets: false });
    expect(ds.tokens.size + sources.length).toBe(0);
  });
});

describe('the example', () => {
  const { ds, sources } = loadSources(EXAMPLE_SOURCES.map((s, i) => entry(i + 1, s.name, s.text)), { stripSets: false });

  it('loads cleanly, with every source recognized', () => {
    expect(sources.map((s) => s.kind)).toEqual(['dtcg', 'dtcg', 'css', 'usage']);
    expect(sources.every((s) => s.error === null && s.warnings.length === 0)).toBe(true);
  });

  it('has findings of every severity, so the audit view has something to show', () => {
    const counts = countBySeverity(analyze(ds).findings);
    expect(counts.error).toBeGreaterThan(0);
    expect(counts.warn).toBeGreaterThan(0);
    expect(counts.info).toBeGreaterThan(0);
  });

  it('has tokens in all three tiers', () => {
    const counts = tierCounts(analyze(ds));
    for (const t of TIERS) expect(counts[t]).toBeGreaterThan(0);
  });
});

const f = (rule: Finding['rule'], severity: Finding['severity'], subject: string, message = 'm'): Finding =>
  ({ rule, set: 'integrity', severity, id: subject, subject, message });

describe('groupByRule', () => {
  it('groups findings by rule, with counts per severity', () => {
    const groups = groupByRule([f('unused', 'info', 'a'), f('unused', 'info', 'b'), f('cycle', 'error', 'c')]);
    expect(groups.map((g) => [g.rule, g.findings.length])).toEqual([['cycle', 1], ['unused', 2]]);
    expect(groups[1]?.counts).toEqual({ error: 0, warn: 0, info: 2 });
  });

  it('puts groups holding errors first, then warnings, then info, each in ruleset order', () => {
    const groups = groupByRule([
      f('unused', 'info', 'a'), f('mode-gap', 'warn', 'b'), f('broken-ref', 'error', 'c'), f('cycle', 'error', 'd'), f('dtcg-name', 'warn', 'e'),
    ]);
    expect(groups.map((g) => g.rule)).toEqual(['broken-ref', 'cycle', 'mode-gap', 'dtcg-name', 'unused']);
  });

  it('files a rule under its most severe finding', () => {
    expect(groupByRule([f('contrast', 'warn', 'a'), f('contrast', 'error', 'b'), f('unused', 'warn', 'c')]).map((g) => g.rule)).toEqual(['contrast', 'unused']);
  });

  it('carries the rule metadata', () => {
    expect(groupByRule([f('contrast', 'error', 'a')])[0]?.meta.source.url).toMatch(/^https:\/\/www\.w3\.org\//);
  });

  it('is empty for no findings', () => {
    expect(groupByRule([])).toEqual([]);
  });
});

describe('filterFindings', () => {
  const all = [f('cycle', 'error', 'Color/Brand', 'loops'), f('unused', 'info', 'space/4', 'not used'), f('mode-gap', 'warn', 'color/fg', 'no dark value')];

  it('filters by severity', () => {
    expect(filterFindings(all, 'error', '').map((x) => x.rule)).toEqual(['cycle']);
    expect(filterFindings(all, 'all', '')).toHaveLength(3);
  });

  it('filters by text in the token, message, rule or id, ignoring case', () => {
    expect(filterFindings(all, 'all', 'BRAND').map((x) => x.rule)).toEqual(['cycle']);
    expect(filterFindings(all, 'all', 'dark').map((x) => x.rule)).toEqual(['mode-gap']);
    expect(filterFindings(all, 'all', 'unused').map((x) => x.rule)).toEqual(['unused']);
    expect(filterFindings(all, 'all', '  space/4 ').map((x) => x.rule)).toEqual(['unused']);
  });

  it('combines both, and can match nothing', () => {
    expect(filterFindings(all, 'warn', 'color')).toHaveLength(1);
    expect(filterFindings(all, 'error', 'color/fg')).toEqual([]);
  });
});
