import type { Dataset } from '../model/types.js';
import { RULESETS } from './rulesets.js';
import type { AuditOptions, RuleId, Ruleset, Severity } from './types.js';

// Which rulesets run for this dataset, in their fixed order.
export function activeRulesets(ds: Dataset, opts: AuditOptions = {}): Ruleset[] {
  return RULESETS.filter((s) => {
    const on = opts.enabledRulesets ? opts.enabledRulesets.has(s.id) : s.defaultOn;
    return on && (!s.applies || s.applies(ds));
  });
}

// The severity to report for a finding, or null when the rule is switched off.
export function severityFor(rule: RuleId, emitted: Severity, opts: AuditOptions = {}): Severity | null {
  const override = opts.severityOverrides?.[rule];
  if (override === undefined) return emitted;
  return override === 'off' ? null : override;
}
