import type { Analysis } from '../analyze/types.js';
import type { Dataset, Token } from '../model/types.js';
import type { RuleId, Severity } from './types.js';

export interface RuleContext {
  ds: Dataset;
  tokens: Token[];
  analysis: Analysis;
  // The authored label for an id, or the id itself when the token is not defined.
  label(id: string): string;
  add(rule: RuleId, severity: Severity, id: string | null, subject: string, message: string): void;
}

export type RuleFn = (ctx: RuleContext) => void;
