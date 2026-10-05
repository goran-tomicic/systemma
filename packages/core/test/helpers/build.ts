import { analyze, createDataset, parseCss, parseTokensJson } from '../../src/index.js';
import type { AnalyzeOptions, Dataset, Finding, RuleId, UsageRecord } from '../../src/index.js';
import { addToken } from '../../src/parse/add-token.js';

// Small datasets for rule tests. Every helper returns the dataset so calls can be chained.
export function fromJson(json: unknown, opts: { mode?: 'light' | 'dark'; ds?: Dataset } = {}): Dataset {
  const ds = opts.ds ?? createDataset('t');
  parseTokensJson(ds, json, { mode: opts.mode ?? 'light', source: 't.json' });
  return ds;
}

export function fromCss(css: string, ds: Dataset = createDataset('t')): Dataset {
  parseCss(ds, css, 't.css');
  return ds;
}

export function withUsage(ds: Dataset, usage: Partial<UsageRecord>[]): Dataset {
  for (const u of usage) ds.usage.push({ component: 'C', file: 'c.tsx', prop: '', token: '', ...u });
  return ds;
}

// A token with literal values per mode, for cases the parsers cannot express (no format, odd labels).
export function literal(ds: Dataset, label: string, light: string | null, dark?: string, extra: Parameters<typeof addToken>[4] = {}): Dataset {
  if (light !== null) addToken(ds, label, 'light', { lit: light }, extra);
  if (dark !== undefined) addToken(ds, label, 'dark', { lit: dark }, extra);
  return ds;
}

export function findings(ds: Dataset, rule: RuleId, opts: AnalyzeOptions = {}): Finding[] {
  return analyze(ds, opts).findings.filter((f) => f.rule === rule);
}

export const subjects = (fs: Finding[]): string[] => fs.map((f) => f.subject);
