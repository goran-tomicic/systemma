import type { Dataset, TokenInfo, UsageRecord } from '../model/types.js';
import { audit } from '../rules/audit.js';
import { refsOf } from '../model/value.js';
import { classify, TIERED_PROFILE } from '../resolve/classify.js';
import type { Finding } from '../rules/types.js';
import type { Analysis, AnalyzeOptions } from './types.js';

export function indexFindings(findings: Finding[]): Map<string, Finding[]> {
  const byId = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!f.id) continue;
    const list = byId.get(f.id);
    if (list) list.push(f);
    else byId.set(f.id, [f]);
  }
  return byId;
}

// Classifies every token, builds the reverse indexes and runs the audit. Nothing is written back to the
// dataset, so the same dataset can be analyzed again with another profile or rule options.
export function analyze(ds: Dataset, opts: AnalyzeOptions = {}): Analysis {
  const profile = opts.profile ?? TIERED_PROFILE;
  const info = new Map<string, TokenInfo>();
  const dependents = new Map<string, Set<string>>();
  const usageBy = new Map<string, UsageRecord[]>();

  for (const t of ds.tokens.values()) info.set(t.id, classify(t, ds, profile));

  for (const t of ds.tokens.values()) {
    for (const value of Object.values(t.modes)) {
      for (const target of refsOf(value)) {
        const set = dependents.get(target);
        if (set) set.add(t.id);
        else dependents.set(target, new Set([t.id]));
      }
    }
  }

  for (const u of ds.usage) {
    const list = usageBy.get(u.token);
    if (list) list.push(u);
    else usageBy.set(u.token, [u]);
  }

  const analysis: Analysis = { info, dependents, usageBy, findings: [], byId: new Map() };
  analysis.findings = audit(ds, analysis, opts);
  analysis.byId = indexFindings(analysis.findings);
  return analysis;
}
