import type { RuleFn } from './context.js';
import { DTCG_RULES } from './dtcg.js';
import { INTEGRITY_RULES } from './integrity.js';
import { SCALES_RULES } from './scales.js';
import { STRUCTURE_RULES } from './structure.js';
import type { RuleId } from './types.js';

// One entry per rule family. A rule without a function is skipped by audit().
export const RULE_FUNCTIONS: Readonly<Partial<Record<RuleId, RuleFn>>> = {
  ...INTEGRITY_RULES,
  ...DTCG_RULES,
  ...STRUCTURE_RULES,
  ...SCALES_RULES,
};
