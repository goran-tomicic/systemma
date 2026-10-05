import type { Dataset, Kind } from '../model/types.js';

export type Severity = 'error' | 'warn' | 'info';
export type Confidence = 'high' | 'medium' | 'low';

export const RULESET_IDS = ['integrity', 'dtcg', 'structure', 'scales', 'tiered', 'wcag', 'wcag-aaa', 'descriptions', 'm3'] as const;
export type RulesetId = (typeof RULESET_IDS)[number];

export const RULE_IDS = [
  'broken-ref', 'cycle', 'broken-usage', 'id-collision', 'mode-gap', 'unused',
  'dtcg-name', 'dtcg-case', 'dtcg-untyped', 'dtcg-composite', 'dtcg-units',
  'mixed-separator', 'state-position', 'state-vocab', 'hue-in-semantic', 'sibling-gap', 'size-style',
  'base-unit', 'scale-order', 'duplicate-semantic',
  'tiered-palette', 'tiered-common', 'tiered-vocab', 'tiered-common-states', 'foundation-direct', 'pairing', 'missing-pair',
  'contrast', 'contrast-nontext', 'contrast-focus',
  'contrast-aaa',
  'desc-missing', 'desc-intent', 'scope-role', 'usage-role',
  'm3-type-role', 'm3-motion-names',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface Finding {
  rule: RuleId;
  set: RulesetId;
  severity: Severity;
  id: string | null;       // token id when the finding is about a token
  subject: string;
  message: string;
}

export interface RuleMeta {
  set: RulesetId;
  title: string;
  description: string;
  // The severity of the rule's main case. A few rules emit another severity in a documented
  // sub-case (see RULE_META); a severity override replaces all of them.
  defaultSeverity: Severity;
  source: { name: string; url?: string };
  // How well the source supports the rule: 'high' states it, 'medium' supports it in part,
  // 'low' means the rule is a heuristic that the source only motivates.
  confidence: Confidence;
}

export interface Ruleset {
  id: RulesetId;
  name: string;
  description: string;
  defaultOn: boolean;
  rules: readonly RuleId[];
  // Some rulesets only make sense for data that follows a naming scheme; they skip everything else.
  applies?(ds: Dataset): boolean;
}

// A foreground and background that must meet a contrast level. Tokens may be named as ids, slash or dot
// paths, {aliases} or var(--x).
export interface ContrastPair {
  foreground: string;
  background: string;
  // AA by default. AAA makes the contrast rule require the stricter ratio for this pair.
  level?: 'AA' | 'AAA';
  // Large text needs a lower ratio: 3:1 at AA and 4.5:1 at AAA.
  largeText?: boolean;
}

export interface AuditOptions {
  // When given, exactly these rulesets are candidates; otherwise the ones that are on by default.
  // A ruleset with an `applies` check still has to pass it.
  enabledRulesets?: ReadonlySet<RulesetId>;
  // Per-rule severity, or 'off' to silence a rule.
  severityOverrides?: Partial<Record<RuleId, Severity | 'off'>>;
  // The text pairs the contrast rules check. When given, only these pairs are checked; when omitted, the
  // pairs are inferred from token names. An empty list checks none.
  contrastPairs?: readonly ContrastPair[];
  // Which kinds of token the mode-gap rule expects to have a dark value. Colors by default.
  modeGapKinds?: readonly Kind[];
  // Per rule, globs for the tokens to leave alone. A pattern is matched against a token's authored label
  // (without a leading "--") and its canonical id; a finding that is not about a token is matched on its
  // subject. For example { unused: ['color/palette/**'] }.
  ignore?: Partial<Record<RuleId, readonly string[]>>;
}
