import type { RuleId, RuleMeta } from './types.js';

// Every source below was opened on 2026-10-05, except where a rule says otherwise. Where a source
// supports a rule only in part, the rule's confidence is lower than its ruleset's.
const SRC = {
  basic: { name: 'Basic correctness' },
  dtcg: { name: 'W3C Design Tokens Format Module 2025.10', url: 'https://www.designtokens.org/TR/2025.10/format/' },
  curtis: { name: 'Nathan Curtis, "Naming Tokens in Design Systems"', url: 'https://nathanacurtis.substack.com/p/naming-tokens-in-design-systems-9e86c7444676' },
  atlassian: { name: 'Atlassian Design System, Spacing', url: 'https://atlassian.design/foundations/spacing' },
  tiered: { name: 'Tiered naming scheme docs' },
  wcagMin: { name: 'WCAG 2.2 SC 1.4.3 Contrast (Minimum)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html' },
  wcagNonText: { name: 'WCAG 2.2 SC 1.4.11 Non-text Contrast', url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html' },
  wcagEnhanced: { name: 'WCAG 2.2 SC 1.4.6 Contrast (Enhanced)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html' },
  figmaScope: { name: 'Figma Plugin API, VariableScope', url: 'https://developers.figma.com/docs/plugins/api/VariableScope' },
  m3Type: { name: 'Material 3 Typography (Compose Multiplatform API reference)', url: 'https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-typography/' },
  // The duration steps are on the sibling Durations page (https://api.flutter.dev/flutter/material/Durations-class.html), also opened.
  m3Motion: { name: 'Material 3 easing and duration tokens (Flutter API reference)', url: 'https://api.flutter.dev/flutter/material/Easing-class.html' },
} as const;

export const RULE_META: Readonly<Record<RuleId, RuleMeta>> = {
  // integrity
  'broken-ref': { set: 'integrity', title: 'Broken alias', description: 'An alias, a reference inside a composite or a var() points at a token that is not defined.', defaultSeverity: 'error', source: SRC.basic, confidence: 'high' },
  cycle: { set: 'integrity', title: 'Alias cycle', description: 'Aliases loop back on themselves and never resolve.', defaultSeverity: 'error', source: SRC.basic, confidence: 'high' },
  'broken-usage': { set: 'integrity', title: 'Undefined token in use', description: 'A usage record names a token that is not defined. A rename hint is added when one is known.', defaultSeverity: 'error', source: SRC.basic, confidence: 'high' },
  // A collision drops the later token, so the graph does not hold everything the input said. Case-only
  // collisions are reported here too, and again by dtcg-case, which is the DTCG-specific wording.
  'id-collision': { set: 'integrity', title: 'Names collide', description: 'Two different names produce the same id, so only the first was kept and the other was not merged.', defaultSeverity: 'error', source: SRC.basic, confidence: 'high' },
  'mode-gap': { set: 'integrity', title: 'No dark value', description: 'Dark values exist elsewhere in the set, but not for this color token above the foundation tier.', defaultSeverity: 'warn', source: SRC.basic, confidence: 'high' },
  unused: { set: 'integrity', title: 'Unused semantic token', description: 'Nothing in the usage data or in other tokens refers to it. Partial usage data inflates this.', defaultSeverity: 'info', source: SRC.basic, confidence: 'high' },

  // dtcg. dtcg-name is an error for DTCG-format tokens and a warning for tokens from other formats.
  'dtcg-name': { set: 'dtcg', title: 'Invalid token name', description: 'A name segment starts with $ or contains {, } or ., which break alias syntax.', defaultSeverity: 'error', source: SRC.dtcg, confidence: 'high' },
  'dtcg-case': { set: 'dtcg', title: 'Names differ only by case', description: 'Labels that differ only by case collapse into one id.', defaultSeverity: 'warn', source: SRC.dtcg, confidence: 'high' },
  'dtcg-untyped': { set: 'dtcg', title: 'No explicit type', description: 'The format requires a declared or inherited type; tools must not guess it from the value.', defaultSeverity: 'warn', source: SRC.dtcg, confidence: 'high' },
  'dtcg-composite': { set: 'dtcg', title: 'Incomplete composite', description: 'A typography, shadow, border or transition value is missing required sub-values.', defaultSeverity: 'error', source: SRC.dtcg, confidence: 'high' },
  // dtcg-units drops to info for dimensions and durations that did not come from a DTCG file.
  'dtcg-units': { set: 'dtcg', title: 'Value outside the spec', description: 'Units or ranges the format cannot represent: dimension in px or rem, duration in ms or s, easing x within 0 to 1, weight within 1 to 1000.', defaultSeverity: 'warn', source: SRC.dtcg, confidence: 'high' },

  // structure. The article supports structured, consistently ordered levels in general, not these specific checks.
  'mixed-separator': { set: 'structure', title: 'Mixed modifier separators', description: 'Some modifiers are path segments while others are fused into the name.', defaultSeverity: 'warn', source: SRC.curtis, confidence: 'medium' },
  'state-position': { set: 'structure', title: 'State is not the last level', description: 'An interaction state is followed by another modifier. The article says mode is often last, not state, so this is a house convention.', defaultSeverity: 'info', source: SRC.curtis, confidence: 'low' },
  'state-vocab': { set: 'structure', title: 'Mixed state words', description: 'One state concept is spelled more than one way, such as hover and hovered.', defaultSeverity: 'warn', source: SRC.curtis, confidence: 'low' },
  'hue-in-semantic': { set: 'structure', title: 'Hue name in a semantic token', description: 'A semantic token names a color instead of a role.', defaultSeverity: 'warn', source: SRC.curtis, confidence: 'low' },
  'sibling-gap': { set: 'structure', title: 'Role is missing a variant', description: 'Most roles define a variant that this one does not.', defaultSeverity: 'warn', source: SRC.curtis, confidence: 'low' },
  'size-style': { set: 'structure', title: 'Mixed scale naming', description: 'Numeric steps and t-shirt sizes are mixed in one scale.', defaultSeverity: 'warn', source: SRC.curtis, confidence: 'low' },

  // scales. Atlassian documents an 8px base unit; the 4px alternative and the other two rules are not in the source.
  'base-unit': { set: 'scales', title: 'Off the base-unit grid', description: 'Most spacing values are multiples of the base unit; this one is not.', defaultSeverity: 'info', source: SRC.atlassian, confidence: 'medium' },
  'scale-order': { set: 'scales', title: 'Scale not increasing', description: 'A numbered step is not larger than the step before it.', defaultSeverity: 'warn', source: SRC.atlassian, confidence: 'low' },
  'duplicate-semantic': { set: 'scales', title: 'Identical resolved values', description: 'Different roles resolve to exactly the same colors, so they cannot be told apart.', defaultSeverity: 'info', source: SRC.atlassian, confidence: 'low' },

  // tiered
  'tiered-palette': { set: 'tiered', title: 'Off-pattern palette token', description: 'A palette token does not follow {role}-{solid|subtle|border}[-hover|active|disabled] or {solid|subtle}-fg.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  'tiered-common': { set: 'tiered', title: 'Unknown common token', description: 'A common token is outside the documented surface, fg, border and bg set.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  'tiered-vocab': { set: 'tiered', title: 'Avoided intensity word', description: 'default, light or dark is used as a variant name.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  'tiered-common-states': { set: 'tiered', title: 'State on a common token', description: 'Common tokens are static; states belong in the palette tier.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  'foundation-direct': { set: 'tiered', title: 'Foundation token used directly', description: 'A component uses a foundation color instead of going through the semantic layer.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  pairing: { set: 'tiered', title: 'Mismatched fg/bg pair', description: 'A component uses a solid background with subtle foreground text, or the reverse.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },
  'missing-pair': { set: 'tiered', title: 'Missing -fg partner', description: 'A solid or subtle token has no matching foreground token.', defaultSeverity: 'warn', source: SRC.tiered, confidence: 'high' },

  // wcag. contrast is an error below 3:1 and a warning from 3:1 to 4.5:1.
  contrast: { set: 'wcag', title: 'Low-contrast pair', description: 'Foreground on its intended background is below 4.5:1; below 3:1 is an error.', defaultSeverity: 'warn', source: SRC.wcagMin, confidence: 'high' },
  'contrast-nontext': { set: 'wcag', title: 'Border below 3:1', description: 'Fine for a decorative divider; fails 1.4.11 when the border identifies a control.', defaultSeverity: 'info', source: SRC.wcagNonText, confidence: 'high' },
  // 1.4.11 covers the visual information needed to identify a component state, which includes focus; it does not name focus rings.
  'contrast-focus': { set: 'wcag', title: 'Weak focus indicator', description: 'A color used for a focus style is below 3:1 against the surface.', defaultSeverity: 'warn', source: SRC.wcagNonText, confidence: 'medium' },
  'contrast-aaa': { set: 'wcag-aaa', title: 'Below AAA', description: 'Passes 4.5:1 but not 7:1.', defaultSeverity: 'info', source: SRC.wcagEnhanced, confidence: 'high' },

  // descriptions. DTCG defines $description as optional, so asking for one is practice, not a requirement.
  'desc-missing': { set: 'descriptions', title: 'No description', description: 'A semantic token has no description explaining its purpose.', defaultSeverity: 'info', source: SRC.dtcg, confidence: 'medium' },
  'desc-intent': { set: 'descriptions', title: 'Description does not say where it is used', description: 'A color description names no property, such as background, text or border.', defaultSeverity: 'info', source: SRC.dtcg, confidence: 'low' },
  // scope-role is a warning for scopes that omit the role or include its opposite, and info for broad scopes.
  'scope-role': { set: 'descriptions', title: 'Figma scope does not match the role', description: 'Scopes only filter pickers, so a mismatch offers the wrong token or hides the right one.', defaultSeverity: 'warn', source: SRC.figmaScope, confidence: 'medium' },
  'usage-role': { set: 'descriptions', title: 'Token used in the wrong role', description: 'A text token used as a background, a background token as a border, and so on. Extends the scope idea from design files to code.', defaultSeverity: 'warn', source: SRC.figmaScope, confidence: 'low' },

  // m3
  'm3-type-role': { set: 'm3', title: 'Type style without a role name', description: 'Material names type styles by role: display, headline, title, body, label.', defaultSeverity: 'info', source: SRC.m3Type, confidence: 'medium' },
  'm3-motion-names': { set: 'm3', title: 'Motion name off-vocabulary', description: 'A duration is not a short, medium or long step, or an easing is not standard, emphasized, accelerate, decelerate or linear.', defaultSeverity: 'info', source: SRC.m3Motion, confidence: 'medium' },
};
