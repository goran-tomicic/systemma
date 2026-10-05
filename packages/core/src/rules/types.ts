export type Severity = 'error' | 'warn' | 'info';

// Plain strings until the rule metadata lands; they become unions of the known ids then.
export type RulesetId = string;
export type RuleId = string;

export interface Finding {
  rule: RuleId;
  set: RulesetId;
  severity: Severity;
  id: string | null;       // token id when the finding is about a token
  subject: string;
  message: string;
}
