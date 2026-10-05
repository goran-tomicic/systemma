import type { Analysis } from '../analyze/types.js';
import type { Dataset } from '../model/types.js';
import type { RuleContext } from './context.js';
import { compileGlob, matchesAny } from './glob.js';
import { RULE_META } from './meta.js';
import { activeRulesets, severityFor } from './options.js';
import { RULE_FUNCTIONS } from './registry.js';
import type { AuditOptions, Finding } from './types.js';

// Runs the active rulesets in order, each rule in its listed order, and returns the findings in the
// order they were raised. A rule set to 'off' still runs but its findings are dropped.
export function audit(ds: Dataset, analysis: Analysis, opts: AuditOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const ignored = new Map<string, RegExp[]>(Object.entries(opts.ignore ?? {}).map(([rule, globs]) => [rule, (globs ?? []).map(compileGlob)]));
  const ctx: RuleContext = {
    ds,
    tokens: [...ds.tokens.values()],
    analysis,
    options: opts,
    label: (id) => ds.tokens.get(id)?.label ?? id,
    add(rule, emitted, id, subject, message) {
      const severity = severityFor(rule, emitted, opts);
      const patterns = ignored.get(rule);
      if (patterns?.length) {
        const label = id === null ? undefined : ds.tokens.get(id)?.label.replace(/^--/, '');
        if (matchesAny(patterns, ...(id === null ? [subject] : label === undefined ? [id] : [label, id]))) return;
      }
      if (severity) findings.push({ rule, set: RULE_META[rule].set, severity, id, subject, message });
    },
  };
  for (const set of activeRulesets(ds, opts)) {
    for (const rule of set.rules) RULE_FUNCTIONS[rule]?.(ctx);
  }
  return findings;
}
