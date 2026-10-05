import type { Dataset, TokenInfo, UsageRecord } from '../model/types.js';
import { refsOf } from '../model/value.js';
import { classify, FORTIS_PROFILE } from '../resolve/classify.js';
import type { Profile } from '../resolve/classify.js';
import type { Finding } from '../rules/types.js';

export interface Analysis {
  info: Map<string, TokenInfo>;
  // target id -> ids that reference it, through an alias, a composite or an embedded var()
  dependents: Map<string, Set<string>>;
  usageBy: Map<string, UsageRecord[]>;
  findings: Finding[];
  byId: Map<string, Finding[]>;
}

export interface AnalyzeOptions {
  profile?: Profile;
}

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

// Classifies every token and builds the reverse indexes. Nothing is written back to the dataset, so
// the same dataset can be analyzed again with another profile.
export function analyze(ds: Dataset, opts: AnalyzeOptions = {}): Analysis {
  const profile = opts.profile ?? FORTIS_PROFILE;
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

  const findings: Finding[] = [];
  return { info, dependents, usageBy, findings, byId: indexFindings(findings) };
}
