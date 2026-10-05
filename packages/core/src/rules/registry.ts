import type { RuleFn } from './context.js';
import { DESCRIPTION_RULES } from './descriptions.js';
import { DTCG_RULES } from './dtcg.js';
import { TIERED_RULES } from './tiered.js';
import { INTEGRITY_RULES } from './integrity.js';
import { M3_RULES } from './m3.js';
import { SCALES_RULES } from './scales.js';
import { STRUCTURE_RULES } from './structure.js';
import { WCAG_RULES } from './wcag.js';
import type { RuleId } from './types.js';

// One entry per rule family. A rule without a function is skipped by audit().
export const RULE_FUNCTIONS: Readonly<Partial<Record<RuleId, RuleFn>>> = {
  ...INTEGRITY_RULES,
  ...DTCG_RULES,
  ...STRUCTURE_RULES,
  ...SCALES_RULES,
  ...TIERED_RULES,
  ...WCAG_RULES,
  ...DESCRIPTION_RULES,
  ...M3_RULES,
};
