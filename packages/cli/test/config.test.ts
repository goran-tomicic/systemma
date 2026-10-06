import { describe, expect, it } from 'vitest';
import { RULESETS } from '@systemma/core';
import { parseConfig } from '../src/config.js';
import { InputError } from '../src/errors.js';

const errorsOf = (json: unknown): string[] => {
  try {
    parseConfig(json);
  } catch (e) {
    if (e instanceof InputError) return e.messages;
    throw e;
  }
  return [];
};

describe('parseConfig', () => {
  it('accepts an empty config', () => {
    expect(parseConfig({})).toEqual({ sources: [], usage: [], stripSets: false, audit: {} });
  });

  it('reads the spec sketch', () => {
    const c = parseConfig({
      sources: ['tokens/**/*.json', 'src/**/*.css'],
      profile: 'tiered',
      rulesets: { 'wcag-aaa': true, m3: false },
      rules: {
        contrast: { severity: 'error', pairs: [{ foreground: 'color/fg/base', background: 'color/surface/base', level: 'AA' }] },
        'desc-missing': 'off',
      },
      ignore: { unused: ['color/palette/**'] },
    });
    expect(c.sources).toEqual(['tokens/**/*.json', 'src/**/*.css']);
    expect(c.audit.profile).toBe('tiered');
    expect(c.audit.severityOverrides).toEqual({ contrast: 'error', 'desc-missing': 'off' });
    expect(c.audit.contrastPairs).toEqual([{ foreground: 'color/fg/base', background: 'color/surface/base', level: 'AA' }]);
    expect(c.audit.ignore).toEqual({ unused: ['color/palette/**'] });
  });

  it('applies rulesets on top of the defaults, not instead of them', () => {
    const enabled = [...(parseConfig({ rulesets: { 'wcag-aaa': true, m3: false } }).audit.enabledRulesets ?? [])];
    const defaults = RULESETS.filter((s) => s.defaultOn).map((s) => s.id);
    expect(enabled.sort()).toEqual([...defaults, 'wcag-aaa'].sort());
    expect([...(parseConfig({ rulesets: { dtcg: false } }).audit.enabledRulesets ?? [])]).not.toContain('dtcg');
  });

  it('leaves the rulesets alone when none are configured', () => {
    expect(parseConfig({}).audit.enabledRulesets).toBeUndefined();
  });

  it('accepts a profile given as data, and checks its patterns now', () => {
    const profile = { id: 'acme', tiers: { palette: ['^action-'] }, groupSegment: { palette: 1 } };
    expect(parseConfig({ profile }).audit.profile).toEqual(profile);
    expect(errorsOf({ profile: { id: 'x', tiers: { common: ['(unclosed'] } } })[0]).toMatch(/profile: Profile "x": "\(unclosed" is not a valid regular expression/);
  });

  it('reads the baseline path as written', () => {
    expect(parseConfig({ baseline: 'tokens/systemma.baseline.json' }).baseline).toBe('tokens/systemma.baseline.json');
    expect(parseConfig({}).baseline).toBeUndefined();
  });

  it('reads usage inputs', () => {
    expect(parseConfig({ usage: ['src', 'lib/app.tsx'] }).usage).toEqual(['src', 'lib/app.tsx']);
  });

  it('accepts modeGapKinds, stripSets and a severity per rule', () => {
    const c = parseConfig({ modeGapKinds: ['color', 'dimension'], stripSets: true, rules: { 'mode-gap': 'info' } });
    expect(c.audit.modeGapKinds).toEqual(['color', 'dimension']);
    expect(c.stripSets).toBe(true);
    expect(c.audit.severityOverrides).toEqual({ 'mode-gap': 'info' });
  });

  it.each([
    [{ colour: 1 }, ['config colour: unknown option. Known options: sources, usage, baseline, profile, rulesets, rules, ignore, modeGapKinds, stripSets.']],
    [{ baseline: 4 }, ['config baseline: expected the path of a baseline file.']],
    [{ baseline: '' }, ['config baseline: expected the path of a baseline file.']],
    [{ sources: 'tokens' }, ['config sources: expected a list of paths or globs.']],
    [{ sources: [1] }, ['config sources: expected a list of paths or globs.']],
    [{ usage: 'src' }, ['config usage: expected a list of directories or files to scan.']],
    [{ usage: [1] }, ['config usage: expected a list of directories or files to scan.']],
    [{ stripSets: 'yes' }, ['config stripSets: expected true or false.']],
    [{ profile: 'fancy' }, ['config profile: expected "auto", "tiered", "generic" or a profile object.']],
    [{ profile: { tiers: {} } }, ['config profile.id: expected a name for the profile.']],
    [{ profile: { id: 'x', nope: 1 } }, ['config profile.nope: unknown option. Known: id, tiers, groupSegment.']],
    [{ profile: { id: 'x', tiers: { top: ['a'] } } }, ['config profile.tiers.top: unknown tier. Known: foundation, palette, common.']],
    [{ profile: { id: 'x', tiers: { common: 'a' } } }, ['config profile.tiers.common: expected a list of regular expression patterns.']],
    [{ profile: { id: 'x', groupSegment: { common: -1 } } }, ['config profile.groupSegment.common: expected a whole number from 0.']],
    [{ rulesets: { nope: true } }, [expect.stringMatching(/^config rulesets\.nope: unknown ruleset\. Known: integrity/)]],
    [{ rulesets: { dtcg: 'on' } }, ['config rulesets.dtcg: expected true or false.']],
    [{ rulesets: [] }, ['config rulesets: expected an object of ruleset id to true or false.']],
    [{ rules: { nope: 'off' } }, ['config rules.nope: unknown rule. See the README for the rule ids.']],
    [{ rules: { cycle: 'loud' } }, ['config rules.cycle: expected "off", "error", "warn" or "info".']],
    [{ rules: { cycle: { severity: 'x' } } }, ['config rules.cycle.severity: expected "off", "error", "warn" or "info".']],
    [{ rules: { cycle: { level: 1 } } }, ['config rules.cycle.level: unknown option. Known: severity, pairs.']],
    [{ rules: { cycle: 4 } }, ['config rules.cycle: expected a severity string or an object.']],
    [{ rules: { cycle: { pairs: [] } } }, ['config rules.cycle.pairs: only the contrast rule takes pairs.']],
    [{ rules: { contrast: { pairs: 'x' } } }, ['config rules.contrast.pairs: expected a list of pairs.']],
    [{ rules: { contrast: { pairs: [{ foreground: 'a' }] } } }, ['config rules.contrast.pairs[0].background: expected a token name.']],
    [{ rules: { contrast: { pairs: [{ foreground: 'a', background: 'b', level: 'A' }] } } }, ['config rules.contrast.pairs[0].level: expected "AA" or "AAA".']],
    [{ rules: { contrast: { pairs: [{ foreground: 'a', background: 'b', largeText: 'yes' }] } } }, ['config rules.contrast.pairs[0].largeText: expected true or false.']],
    [{ rules: { contrast: { pairs: [{ foreground: 'a', background: 'b', size: 1 }] } } }, ['config rules.contrast.pairs[0].size: unknown option. Known: foreground, background, level, largeText.']],
    [{ ignore: { nope: ['a'] } }, ['config ignore.nope: unknown rule.']],
    [{ ignore: { unused: 'a' } }, ['config ignore.unused: expected a list of globs.']],
    [{ modeGapKinds: ['colour'] }, ['config modeGapKinds: expected a list of token kinds, such as ["color", "dimension"].']],
  ])('rejects %j', (json, messages) => {
    expect(errorsOf(json)).toEqual(messages);
  });

  it('rejects a config that is not an object', () => {
    for (const bad of [null, [], 'x', 4]) expect(errorsOf(bad)).toEqual(['config: expected a JSON object.']);
  });

  it('reports every problem at once, not just the first', () => {
    expect(errorsOf({ colour: 1, sources: 4, rules: { nope: 'off' } })).toHaveLength(3);
  });
});
