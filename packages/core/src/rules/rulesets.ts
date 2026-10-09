import { followsTieredScheme } from '../resolve/profile.js';
import type { Ruleset } from './types.js';

export const RULESETS: readonly Ruleset[] = [
  {
    id: 'integrity',
    name: 'Integrity',
    description: 'Aliases resolve, nothing loops, components use real tokens, names do not collide, and dark values exist where light ones do.',
    defaultOn: true,
    rules: ['broken-ref', 'cycle', 'broken-usage', 'id-collision', 'mode-gap', 'unused', 'hardcoded-value', 'deprecated-in-use'],
  },
  {
    id: 'dtcg',
    name: 'W3C DTCG 2025.10',
    description: 'Name characters, explicit types, composite sub-values, units and ranges.',
    defaultOn: true,
    rules: ['dtcg-name', 'dtcg-case', 'dtcg-untyped', 'dtcg-composite', 'dtcg-units', 'alias-type-mismatch', 'deprecated-no-reason'],
  },
  {
    id: 'structure',
    name: 'Structure and vocabulary',
    description: 'Consistent modifier separators and state words, complete role siblings, and no hue names in semantic tokens.',
    defaultOn: true,
    rules: ['mixed-separator', 'state-position', 'state-vocab', 'hue-in-semantic', 'sibling-gap', 'size-style'],
  },
  {
    id: 'scales',
    name: 'Scales',
    description: 'A base-unit grid, increasing steps, and roles that quietly resolve to the same colors.',
    defaultOn: true,
    rules: ['base-unit', 'scale-order', 'duplicate-semantic'],
  },
  {
    id: 'tiered',
    name: 'Tiered naming conventions',
    description: 'Tier structure, role and variant names, vocabulary and pairing rules of the tiered naming scheme.',
    defaultOn: true,
    rules: ['tiered-palette', 'tiered-common', 'tiered-vocab', 'tiered-common-states', 'foundation-direct', 'pairing', 'missing-pair'],
    // The same check that makes 'auto' choose the tiered profile.
    applies: followsTieredScheme,
  },
  {
    id: 'wcag',
    name: 'WCAG 2.2 AA',
    description: 'Text needs 4.5:1; UI components and focus indicators need 3:1.',
    defaultOn: true,
    rules: ['contrast', 'contrast-nontext', 'contrast-focus'],
  },
  {
    id: 'wcag-aaa',
    name: 'WCAG 2.2 AAA',
    description: 'Enhanced text contrast, 7:1.',
    defaultOn: false,
    rules: ['contrast-aaa'],
  },
  {
    id: 'descriptions',
    name: 'Descriptions and intended use',
    description: 'Semantic tokens say where they are used, Figma scopes match the role, and components use tokens in the role they were made for.',
    defaultOn: true,
    rules: ['desc-missing', 'desc-intent', 'scope-role', 'usage-role'],
  },
  {
    id: 'm3',
    name: 'Material 3 naming',
    description: 'Type roles (display, headline, title, body, label) and motion names (standard, emphasized and their accelerate and decelerate forms).',
    defaultOn: false,
    rules: ['m3-type-role', 'm3-motion-names'],
  },
];
