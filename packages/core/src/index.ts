// Public entry point. Modules are exported here as they are ported.
export type {
  Category, Dataset, Kind, Mode, Tier, Token, TokenInfo, TokenValue, UsageRecord,
} from './model/types.js';
export { canon } from './model/ids.js';
export { toRgba } from './model/color.js';
export { toMs, toPx } from './model/units.js';
export { parseValue, refsOf } from './model/value.js';
export { createDataset } from './model/dataset.js';

export type { RGB, RGBA, Simulation } from './a11y/types.js';
export { contrastRatio, flatten } from './a11y/contrast.js';
export { apcaLc } from './a11y/apca.js';
export { simulate } from './a11y/cvd.js';
export { deltaE76 } from './a11y/lab.js';

export type { ParseResult } from './parse/types.js';
export type { JsonOptions } from './parse/dtcg.js';
export { parseTokensJson } from './parse/dtcg.js';
export { parseCss } from './parse/css.js';
export { parseFigmaVariables } from './parse/figma.js';
export { parseUsage } from './parse/usage.js';
export type { SourceKind, SourceOptions, SourceResult } from './parse/source.js';
export { parseSource } from './parse/source.js';
export type { Detected, DetectedKind } from './parse/detect.js';
export { detectFormat } from './parse/detect.js';

export type { Resolution, ResolveError } from './resolve/resolve.js';
export { resolve } from './resolve/resolve.js';

export type { Profile, ProfileConfig, ProfileSpec } from './resolve/profile.js';
export { chooseProfile, createProfile, GENERIC_PROFILE, PROFILES, resolveProfile, TIERED_PROFILE } from './resolve/profile.js';
export { classify } from './resolve/classify.js';
export { categoryOf, inferKind, isKind } from './resolve/kinds.js';

export type { AuditOptions, Confidence, ContrastPair, Finding, RuleId, RuleMeta, Ruleset, RulesetId, Severity } from './rules/types.js';
export { RULE_IDS, RULESET_IDS } from './rules/types.js';
export { RULESETS } from './rules/rulesets.js';
export { activeRulesets } from './rules/options.js';
export { RULE_META } from './rules/meta.js';
export type { Analysis, AnalyzeOptions } from './analyze/types.js';
export { analyze } from './analyze/analyze.js';
export { audit } from './rules/audit.js';
export type { DiffChange, DiffResult } from './analyze/diff.js';
export { diff } from './analyze/diff.js';

export type { Candidate, FileLike, Progress, ScanCandidates, ScanSummary } from './scan/types.js';
export { componentNameFromPath } from './scan/component-name.js';
export { scanCandidates } from './scan/candidates.js';
export { scanUsage } from './scan/usage.js';
export { compileGlob } from './rules/glob.js';
export { roleOfToken } from './rules/helpers.js';
