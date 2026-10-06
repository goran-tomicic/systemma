import {
  RULESETS, RULESET_IDS, RULE_IDS, createProfile, isKind,
} from '@systemma/core';
import type { AnalyzeOptions, ContrastPair, Kind, ProfileConfig, ProfileSpec, RuleId, RulesetId, Severity } from '@systemma/core';
import { InputError } from './errors.js';

export interface Config {
  sources: string[];
  // Directories or files to scan for token usage.
  usage: string[];
  // Where accepted findings are recorded, as written in the config (relative to the config file).
  baseline?: string;
  // Tokens Studio files nest tokens under set names; this drops them.
  stripSets: boolean;
  audit: AnalyzeOptions;
}

const TOP_LEVEL = ['sources', 'usage', 'baseline', 'profile', 'rulesets', 'rules', 'ignore', 'modeGapKinds', 'stripSets'] as const;
const SEVERITIES = ['error', 'warn', 'info'] as const;
const TIERS = ['foundation', 'palette', 'common'] as const;

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
const isRuleId = (s: string): s is RuleId => (RULE_IDS as readonly string[]).includes(s);
const isRulesetId = (s: string): s is RulesetId => (RULESET_IDS as readonly string[]).includes(s);

// Checks a parsed config strictly: an unknown key or a wrong type is an error, because a typo that is
// silently ignored looks exactly like a rule that is working.
export function parseConfig(json: unknown): Config {
  const errors: string[] = [];
  const fail = (path: string, message: string): void => { errors.push(`${path}: ${message}`); };
  if (!isRec(json)) throw new InputError(['config: expected a JSON object.']);

  for (const key of Object.keys(json)) {
    if (!(TOP_LEVEL as readonly string[]).includes(key)) fail(key, `unknown option. Known options: ${TOP_LEVEL.join(', ')}.`);
  }

  const config: Config = { sources: [], usage: [], stripSets: false, audit: {} };

  if ('sources' in json) {
    if (isStringArray(json['sources'])) config.sources = json['sources'];
    else fail('sources', 'expected a list of paths or globs.');
  }
  if ('baseline' in json) {
    if (typeof json['baseline'] === 'string' && json['baseline']) config.baseline = json['baseline'];
    else fail('baseline', 'expected the path of a baseline file.');
  }
  if ('usage' in json) {
    if (isStringArray(json['usage'])) config.usage = json['usage'];
    else fail('usage', 'expected a list of directories or files to scan.');
  }
  if ('stripSets' in json) {
    if (typeof json['stripSets'] === 'boolean') config.stripSets = json['stripSets'];
    else fail('stripSets', 'expected true or false.');
  }

  if ('profile' in json) {
    const profile = parseProfile(json['profile'], fail);
    if (profile !== undefined) config.audit.profile = profile;
  }

  if ('rulesets' in json) {
    const sets = json['rulesets'];
    if (!isRec(sets)) fail('rulesets', 'expected an object of ruleset id to true or false.');
    else {
      const enabled = new Set<RulesetId>(RULESETS.filter((s) => s.defaultOn).map((s) => s.id));
      for (const [id, on] of Object.entries(sets)) {
        if (!isRulesetId(id)) fail(`rulesets.${id}`, `unknown ruleset. Known: ${RULESET_IDS.join(', ')}.`);
        else if (typeof on !== 'boolean') fail(`rulesets.${id}`, 'expected true or false.');
        else if (on) enabled.add(id);
        else enabled.delete(id);
      }
      config.audit.enabledRulesets = enabled;
    }
  }

  if ('rules' in json) {
    const rules = json['rules'];
    if (!isRec(rules)) fail('rules', 'expected an object of rule id to a severity or an object.');
    else {
      const overrides: Partial<Record<RuleId, Severity | 'off'>> = {};
      for (const [id, entry] of Object.entries(rules)) {
        if (!isRuleId(id)) { fail(`rules.${id}`, 'unknown rule. See the README for the rule ids.'); continue; }
        const severity = (v: unknown, path: string): Severity | 'off' | undefined => {
          if (v === 'off' || (SEVERITIES as readonly unknown[]).includes(v)) return v as Severity | 'off';
          fail(path, `expected "off", "error", "warn" or "info".`);
          return undefined;
        };
        if (typeof entry === 'string') {
          const s = severity(entry, `rules.${id}`);
          if (s) overrides[id] = s;
        } else if (isRec(entry)) {
          for (const key of Object.keys(entry)) {
            if (key !== 'severity' && key !== 'pairs') fail(`rules.${id}.${key}`, 'unknown option. Known: severity, pairs.');
          }
          if ('severity' in entry) {
            const s = severity(entry['severity'], `rules.${id}.severity`);
            if (s) overrides[id] = s;
          }
          if ('pairs' in entry) {
            if (id !== 'contrast') fail(`rules.${id}.pairs`, 'only the contrast rule takes pairs.');
            else {
              const pairs = parsePairs(entry['pairs'], fail);
              if (pairs) config.audit.contrastPairs = pairs;
            }
          }
        } else fail(`rules.${id}`, 'expected a severity string or an object.');
      }
      if (Object.keys(overrides).length) config.audit.severityOverrides = overrides;
    }
  }

  if ('ignore' in json) {
    const ignore = json['ignore'];
    if (!isRec(ignore)) fail('ignore', 'expected an object of rule id to a list of globs.');
    else {
      const out: Partial<Record<RuleId, string[]>> = {};
      for (const [id, globs] of Object.entries(ignore)) {
        if (!isRuleId(id)) fail(`ignore.${id}`, 'unknown rule.');
        else if (!isStringArray(globs)) fail(`ignore.${id}`, 'expected a list of globs.');
        else out[id] = globs;
      }
      config.audit.ignore = out;
    }
  }

  if ('modeGapKinds' in json) {
    const kinds = json['modeGapKinds'];
    if (!Array.isArray(kinds) || !kinds.every((k) => typeof k === 'string' && isKind(k))) fail('modeGapKinds', 'expected a list of token kinds, such as ["color", "dimension"].');
    else config.audit.modeGapKinds = kinds as Kind[];
  }

  if (errors.length) throw new InputError(errors.map((e) => `config ${e}`));
  return config;
}

function parseProfile(value: unknown, fail: (path: string, message: string) => void): ProfileSpec | undefined {
  if (value === 'auto' || value === 'tiered' || value === 'generic') return value;
  if (!isRec(value)) { fail('profile', 'expected "auto", "tiered", "generic" or a profile object.'); return undefined; }
  const config: ProfileConfig = { id: '' };
  if (typeof value['id'] !== 'string' || !value['id']) fail('profile.id', 'expected a name for the profile.');
  else config.id = value['id'];
  let ok = config.id !== '';
  for (const key of Object.keys(value)) {
    if (!['id', 'tiers', 'groupSegment'].includes(key)) { fail(`profile.${key}`, 'unknown option. Known: id, tiers, groupSegment.'); ok = false; }
  }
  if ('tiers' in value) {
    const tiers = value['tiers'];
    if (!isRec(tiers)) { fail('profile.tiers', 'expected an object of tier to a list of patterns.'); ok = false; }
    else {
      const out: Partial<Record<(typeof TIERS)[number], string[]>> = {};
      for (const [tier, patterns] of Object.entries(tiers)) {
        if (!(TIERS as readonly string[]).includes(tier)) { fail(`profile.tiers.${tier}`, `unknown tier. Known: ${TIERS.join(', ')}.`); ok = false; }
        else if (!isStringArray(patterns)) { fail(`profile.tiers.${tier}`, 'expected a list of regular expression patterns.'); ok = false; }
        else out[tier as (typeof TIERS)[number]] = patterns;
      }
      config.tiers = out;
    }
  }
  if ('groupSegment' in value) {
    const seg = value['groupSegment'];
    if (!isRec(seg)) { fail('profile.groupSegment', 'expected an object of tier to a segment number.'); ok = false; }
    else {
      const out: Partial<Record<(typeof TIERS)[number], number>> = {};
      for (const [tier, n] of Object.entries(seg)) {
        if (!(TIERS as readonly string[]).includes(tier)) { fail(`profile.groupSegment.${tier}`, `unknown tier. Known: ${TIERS.join(', ')}.`); ok = false; }
        else if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) { fail(`profile.groupSegment.${tier}`, 'expected a whole number from 0.'); ok = false; }
        else out[tier as (typeof TIERS)[number]] = n;
      }
      config.groupSegment = out;
    }
  }
  if (!ok) return undefined;
  try {
    createProfile(config); // surfaces an invalid pattern now, with its message, instead of during the run
  } catch (e) {
    fail('profile', e instanceof Error ? e.message : String(e));
    return undefined;
  }
  return config;
}

function parsePairs(value: unknown, fail: (path: string, message: string) => void): ContrastPair[] | undefined {
  if (!Array.isArray(value)) { fail('rules.contrast.pairs', 'expected a list of pairs.'); return undefined; }
  const pairs: ContrastPair[] = [];
  let ok = true;
  value.forEach((p: unknown, i) => {
    const path = `rules.contrast.pairs[${i}]`;
    if (!isRec(p)) { fail(path, 'expected an object with foreground and background.'); ok = false; return; }
    for (const key of Object.keys(p)) {
      if (!['foreground', 'background', 'level', 'largeText'].includes(key)) { fail(`${path}.${key}`, 'unknown option. Known: foreground, background, level, largeText.'); ok = false; }
    }
    const { foreground, background, level, largeText } = p;
    if (typeof foreground !== 'string' || !foreground) { fail(`${path}.foreground`, 'expected a token name.'); ok = false; }
    if (typeof background !== 'string' || !background) { fail(`${path}.background`, 'expected a token name.'); ok = false; }
    if (level !== undefined && level !== 'AA' && level !== 'AAA') { fail(`${path}.level`, 'expected "AA" or "AAA".'); ok = false; }
    if (largeText !== undefined && typeof largeText !== 'boolean') { fail(`${path}.largeText`, 'expected true or false.'); ok = false; }
    if (ok && typeof foreground === 'string' && typeof background === 'string') {
      pairs.push({ foreground, background, ...(level === 'AA' || level === 'AAA' ? { level } : {}), ...(typeof largeText === 'boolean' ? { largeText } : {}) });
    }
  });
  return ok ? pairs : undefined;
}
