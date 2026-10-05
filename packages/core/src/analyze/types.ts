import type { TokenInfo, UsageRecord } from '../model/types.js';
import type { ProfileSpec } from '../resolve/profile.js';
import type { AuditOptions, Finding } from '../rules/types.js';

export interface Analysis {
  info: Map<string, TokenInfo>;
  // target id -> ids that reference it, through an alias, a composite or an embedded var()
  dependents: Map<string, Set<string>>;
  usageBy: Map<string, UsageRecord[]>;
  findings: Finding[];
  byId: Map<string, Finding[]>;
}

export interface AnalyzeOptions extends AuditOptions {
  // 'auto' (the default) picks the tiered profile for data that follows that scheme, else the generic one.
  profile?: ProfileSpec;
}
