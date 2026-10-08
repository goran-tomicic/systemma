import { describe, expect, it } from 'vitest';
import { RULE_IDS, RULE_META, RULESET_IDS, RULESETS, createDataset } from '../src/index.js';
import type { AuditOptions, Dataset, RuleId, RulesetId } from '../src/index.js';
import { activeRulesets, severityFor } from '../src/rules/options.js';
import { addToken } from './helpers/add.js';

describe('ids', () => {
  it('lists 38 unique rules and 9 unique rulesets', () => {
    expect(RULE_IDS).toHaveLength(38);
    expect(new Set(RULE_IDS).size).toBe(38);
    expect(RULESET_IDS).toHaveLength(9);
    expect(new Set(RULESET_IDS).size).toBe(9);
  });
});

describe('rulesets', () => {
  it('keeps the established order', () => {
    expect(RULESETS.map((s) => s.id)).toEqual(['integrity', 'dtcg', 'structure', 'scales', 'tiered', 'wcag', 'wcag-aaa', 'descriptions', 'm3']);
    expect(RULESETS.map((s) => s.id)).toEqual([...RULESET_IDS]);
  });

  it('turns on everything except AAA contrast and Material 3', () => {
    expect(RULESETS.filter((s) => !s.defaultOn).map((s) => s.id)).toEqual(['wcag-aaa', 'm3']);
  });

  it('puts every rule in exactly one ruleset, and lists no rule twice', () => {
    const all = RULESETS.flatMap((s) => [...s.rules]);
    expect(all).toHaveLength(RULE_IDS.length);
    expect([...all].sort()).toEqual([...RULE_IDS].sort());
  });

  it('has a name and a description for every ruleset', () => {
    for (const s of RULESETS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('only gives the tiered ruleset an applicability check', () => {
    expect(RULESETS.filter((s) => s.applies).map((s) => s.id)).toEqual(['tiered']);
  });
});

describe('rule metadata', () => {
  const entries = RULE_IDS.map((id) => [id, RULE_META[id]] as const);

  it('has an entry for every rule and nothing else', () => {
    expect(Object.keys(RULE_META).sort()).toEqual([...RULE_IDS].sort());
  });

  it('agrees with the rulesets about which set a rule belongs to', () => {
    for (const s of RULESETS) for (const r of s.rules) expect(RULE_META[r].set).toBe(s.id);
  });

  it.each(entries)('%s has a title, a description, a severity, a source and a confidence', (_id, m) => {
    expect(m.title.trim().length).toBeGreaterThan(0);
    expect(m.description.trim().length).toBeGreaterThan(0);
    expect(['error', 'warn', 'info']).toContain(m.defaultSeverity);
    expect(['high', 'medium', 'low']).toContain(m.confidence);
    expect(m.source.name.trim().length).toBeGreaterThan(0);
  });

  it('uses https URLs where a source has one', () => {
    for (const [, m] of entries) if (m.source.url) expect(new URL(m.source.url).protocol).toBe('https:');
  });

  // These two sources are not published pages: basic correctness, and the naming scheme's own docs.
  it('has a URL for every source except those two', () => {
    const without = [...new Set(entries.filter(([, m]) => !m.source.url).map(([, m]) => m.set))].sort();
    expect(without).toEqual(['integrity', 'tiered']);
  });

  it('does not rate a rule high unless its source states it', () => {
    const high = entries.filter(([, m]) => m.confidence === 'high').map(([id]) => id);
    for (const id of high) expect(['integrity', 'dtcg', 'tiered', 'wcag', 'wcag-aaa']).toContain(RULE_META[id].set);
  });

  it('pins the default severity of each rule', () => {
    const bySeverity = (sev: string): string[] => entries.filter(([, m]) => m.defaultSeverity === sev).map(([id]) => id).sort();
    expect(bySeverity('error')).toEqual(['broken-ref', 'broken-usage', 'cycle', 'dtcg-composite', 'dtcg-name', 'id-collision']);
    expect(bySeverity('info')).toEqual([
      'base-unit', 'contrast-aaa', 'contrast-nontext', 'desc-intent', 'desc-missing', 'duplicate-semantic',
      'm3-motion-names', 'm3-type-role', 'state-position', 'unused',
    ]);
    expect(bySeverity('warn')).toHaveLength(38 - 6 - 10);
  });

  it('shares one source object across rules that cite the same page', () => {
    expect(RULE_META['dtcg-name'].source).toBe(RULE_META['dtcg-units'].source);
    expect(RULE_META['contrast-nontext'].source).toBe(RULE_META['contrast-focus'].source);
  });
});

const withTokens = (ids: string[]): Dataset => {
  const ds = createDataset();
  for (const id of ids) addToken(ds, id, 'light', { lit: '#fff' });
  return ds;
};
const names = (ds: Dataset, opts?: AuditOptions): RulesetId[] => activeRulesets(ds, opts).map((s) => s.id);

describe('activeRulesets', () => {
  const plain = withTokens(['a', 'b']);
  const tiered = withTokens(['color-palette-brand-solid', 'color-palette-brand-subtle', 'color-palette-danger-solid', 'color-surface-base', 'color-surface-elevated']);

  it('runs the default rulesets that apply, in order', () => {
    expect(names(plain)).toEqual(['integrity', 'dtcg', 'structure', 'scales', 'wcag', 'descriptions']);
    expect(names(tiered)).toEqual(['integrity', 'dtcg', 'structure', 'scales', 'tiered', 'wcag', 'descriptions']);
  });

  it('needs five palette or surface color tokens for the tiered ruleset', () => {
    const four = withTokens(['color-palette-a-solid', 'color-palette-b-solid', 'color-surface-base', 'color-surface-elevated']);
    expect(names(four)).not.toContain('tiered');
    expect(names(withTokens(['color-surface-a', 'color-surface-b', 'color-surface-c', 'color-surface-d', 'color-surface-e']))).toContain('tiered');
  });

  it('counts only palette and surface ids, not other color namespaces', () => {
    expect(names(withTokens(['color-fg-a', 'color-fg-b', 'color-fg-c', 'color-border-a', 'color-bg-a']))).not.toContain('tiered');
  });

  it('uses exactly the enabled set when one is given, replacing the defaults', () => {
    expect(names(plain, { enabledRulesets: new Set<RulesetId>(['m3']) })).toEqual(['m3']);
    expect(names(plain, { enabledRulesets: new Set<RulesetId>(['wcag-aaa', 'integrity']) })).toEqual(['integrity', 'wcag-aaa']);
    expect(names(plain, { enabledRulesets: new Set<RulesetId>() })).toEqual([]);
  });

  it('can switch a default ruleset off by leaving it out', () => {
    expect(names(plain, { enabledRulesets: new Set(RULESETS.map((s) => s.id).filter((id) => id !== 'dtcg')) })).not.toContain('dtcg');
  });

  it('still applies the applicability check to an enabled ruleset', () => {
    expect(names(plain, { enabledRulesets: new Set<RulesetId>(['tiered']) })).toEqual([]);
    expect(names(tiered, { enabledRulesets: new Set<RulesetId>(['tiered']) })).toEqual(['tiered']);
  });

  it('does not change the options it is given', () => {
    const enabled = new Set<RulesetId>(['m3']);
    const opts: AuditOptions = { enabledRulesets: enabled, severityOverrides: { cycle: 'off' } };
    activeRulesets(plain, opts);
    expect([...enabled]).toEqual(['m3']);
    expect(opts.severityOverrides).toEqual({ cycle: 'off' });
  });
});

describe('severityFor', () => {
  const rule: RuleId = 'contrast';

  it('keeps the emitted severity when there is no override', () => {
    expect(severityFor(rule, 'error')).toBe('error');
    expect(severityFor(rule, 'warn', {})).toBe('warn');
    expect(severityFor(rule, 'warn', { severityOverrides: {} })).toBe('warn');
    expect(severityFor(rule, 'info', { severityOverrides: { cycle: 'off' } })).toBe('info');
  });

  it('replaces the emitted severity with the override, whatever it was', () => {
    expect(severityFor(rule, 'error', { severityOverrides: { contrast: 'info' } })).toBe('info');
    expect(severityFor(rule, 'warn', { severityOverrides: { contrast: 'error' } })).toBe('error');
    expect(severityFor(rule, 'info', { severityOverrides: { contrast: 'warn' } })).toBe('warn');
  });

  it('returns null for a rule that is off', () => {
    expect(severityFor(rule, 'error', { severityOverrides: { contrast: 'off' } })).toBeNull();
  });

  it('only affects the rule it names', () => {
    expect(severityFor('cycle', 'error', { severityOverrides: { contrast: 'off' } })).toBe('error');
  });
});
