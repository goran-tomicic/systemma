import type { RuleFn } from './context.js';
import { INTEGRITY_RULES } from './integrity.js';
import type { RuleId } from './types.js';

// One entry per rule family. A rule without a function is skipped by audit().
export const RULE_FUNCTIONS: Readonly<Partial<Record<RuleId, RuleFn>>> = {
  ...INTEGRITY_RULES,
};
