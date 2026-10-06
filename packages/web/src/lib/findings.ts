import { RULESETS, RULE_META } from '@systemma/core';
import type { Finding, RuleId, RuleMeta, Severity } from '@systemma/core';

export type SeverityFilter = Severity | 'all';

export interface RuleGroup {
  rule: RuleId;
  meta: RuleMeta;
  findings: Finding[];
  counts: Record<Severity, number>;
}

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

// Groups findings by the rule that raised them, in ruleset order, and puts the groups holding errors first.
export function groupByRule(findings: readonly Finding[]): RuleGroup[] {
  const byRule = new Map<RuleId, Finding[]>();
  for (const f of findings) {
    const list = byRule.get(f.rule);
    if (list) list.push(f);
    else byRule.set(f.rule, [f]);
  }
  const position = new Map<RuleId, number>(RULESETS.flatMap((s) => s.rules).map((r, i) => [r, i]));
  const groups = [...byRule].map(([rule, list]): RuleGroup => {
    const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
    for (const f of list) counts[f.severity]++;
    return { rule, meta: RULE_META[rule], findings: list, counts };
  });
  const worst = (g: RuleGroup): number => (g.counts.error ? ORDER.error : g.counts.warn ? ORDER.warn : ORDER.info);
  return groups.sort((a, b) => worst(a) - worst(b) || (position.get(a.rule) ?? 0) - (position.get(b.rule) ?? 0));
}

export function filterFindings(findings: readonly Finding[], severity: SeverityFilter, query: string): Finding[] {
  const q = query.trim().toLowerCase();
  return findings.filter((f) => (severity === 'all' || f.severity === severity)
    && (!q || `${f.subject} ${f.message} ${f.rule} ${f.id ?? ''}`.toLowerCase().includes(q)));
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export const SEVERITY_LABEL: Record<Severity, string> = { error: 'error', warn: 'warning', info: 'info' };
