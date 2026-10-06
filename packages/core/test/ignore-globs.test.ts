import { describe, expect, it } from 'vitest';
import { analyze, createDataset, parseUsage } from '../src/index.js';
import type { AnalyzeOptions, Dataset, RuleId } from '../src/index.js';
import { compileGlob } from '../src/rules/glob.js';
import { fixturePath, readFixture, toGolden } from './helpers/golden.js';
import { findings, fromCss, fromJson, literal, withUsage } from './helpers/build.js';

describe('compileGlob', () => {
  it.each([
    ['color/palette/**', 'color/palette/brand/solid', true],
    ['color/palette/**', 'color/palette/brand', true],
    ['color/palette/**', 'color/surface/base', false],
    ['color/*', 'color/surface', true],
    ['color/*', 'color/surface/base', false],
    ['color/**/base', 'color/surface/base', true],
    ['color/**/base', 'color/a/b/base', true],
    ['color/**/base', 'color/base', true],
    ['color/**/base', 'colorbase', false],
    ['color/**/base', 'color/basement', false],
    ['**/base', 'base', true],
    ['**/base', 'a/b/base', true],
    ['**/base', 'database', false],
    ['tokens/**/*.json', 'tokens/a.json', true],
    ['tokens/**/*.json', 'tokens/x/y/a.json', true],
    ['tokens/**/*.json', 'other/a.json', false],
    ['a/**/**/b', 'a/b', true],
    ['color-palette-*', 'color-palette-brand-solid', true],
    ['*-solid', 'color-palette-brand-solid', true],
    ['**', 'anything/at/all', true],
    ['*', 'a/b', false],
    ['space/?', 'space/4', true],
    ['space/?', 'space/16', false],
    ['space/?', 'space//', false],
    ['COLOR/*', 'color/x', true],
    ['color/a.b', 'color/a.b', true],
    ['color/a.b', 'color/axb', false],
    ['a+b', 'a+b', true],
    ['a(b)', 'a(b)', true],
    ['[x]', '[x]', true],
    ['color/palette', 'color/palette/brand', false],
  ])('%s against %s -> %s', (pattern, text, expected) => {
    expect(compileGlob(pattern).test(text)).toBe(expected);
  });
});

const ds = (): Dataset => {
  const d = fromJson(JSON.parse(readFixture('ignore-globs', 'input.json')));
  parseUsage(d, JSON.parse(readFixture('ignore-globs', 'usage.json')));
  return d;
};
const ids = (rule: RuleId, opts: AnalyzeOptions = {}, d: Dataset = ds()): string[] => findings(d, rule, opts).map((f) => f.id ?? f.subject);

describe('ignore globs', () => {
  it('silence a rule for the tokens a pattern matches, by authored label', () => {
    const all = ids('unused');
    expect(all).toContain('color-palette-brand-solid');
    const some = ids('unused', { ignore: { unused: ['color/palette/**'] } });
    expect(some.filter((i) => i.startsWith('color-palette'))).toEqual([]);
    expect(some).toEqual(all.filter((i) => !i.startsWith('color-palette')));
  });

  it('apply only to the rule they are listed under', () => {
    const before = ids('desc-missing');
    expect(ids('desc-missing', { ignore: { unused: ['color/**'] } })).toEqual(before);
  });

  it('also match the canonical id', () => {
    const some = ids('unused', { ignore: { unused: ['color-palette-brand-*'] } });
    expect(some).not.toContain('color-palette-brand-solid');
    expect(some).toContain('color-palette-danger-solid');
  });

  it('match CSS labels without their leading dashes', () => {
    const css = fromCss(':root { --color-a: #fff; --color-b: var(--color-a); --other: #000; }');
    withUsage(css, [{ token: 'other' }]);
    expect(ids('unused', {}, css)).toEqual(['color-b']);
    expect(ids('unused', { ignore: { unused: ['color-*'] } }, css)).toEqual([]);
    expect(ids('unused', { ignore: { unused: ['--color-*'] } }, css)).toEqual(['color-b']);
  });

  it('match a finding that is not about a token by its subject', () => {
    expect(ids('broken-usage')).toEqual(['Page']);
    expect(ids('broken-usage', { ignore: { 'broken-usage': ['Page'] } })).toEqual([]);
    expect(ids('broken-usage', { ignore: { 'broken-usage': ['Other'] } })).toEqual(['Page']);
  });

  it('accept several patterns, and an empty list ignores nothing', () => {
    const none = ids('unused', { ignore: { unused: [] } });
    expect(none).toEqual(ids('unused'));
    const two = ids('unused', { ignore: { unused: ['color/palette/brand/*', 'legacy/*'] } });
    expect(two).not.toContain('color-palette-brand-subtle');
    expect(two).not.toContain('legacy-old-blue');
    expect(two).toContain('color-palette-danger-solid');
  });

  it('match ignoring case', () => {
    expect(ids('unused', { ignore: { unused: ['COLOR/PALETTE/**'] } })).not.toContain('color-palette-brand-solid');
  });

  it('leave other findings of the same token alone', () => {
    const d = createDataset();
    literal(d, 'color/surface/base', '#fff', '#000');
    literal(d, 'color/fg/base', '#111');
    const base = analyze(d, { profile: 'tiered' }).findings.filter((f) => f.id === 'color-fg-base').map((f) => f.rule);
    const ignored = analyze(d, { profile: 'tiered', ignore: { 'mode-gap': ['color/fg/*'] } }).findings.filter((f) => f.id === 'color-fg-base').map((f) => f.rule);
    expect(base).toContain('mode-gap');
    expect(ignored).toEqual(base.filter((r) => r !== 'mode-gap'));
  });

  it('combine with severity overrides, and an off rule stays off', () => {
    expect(findings(ds(), 'unused', { ignore: { unused: ['color/palette/**'] }, severityOverrides: { unused: 'error' } }).every((f) => f.severity === 'error')).toBe(true);
    expect(ids('unused', { ignore: { unused: ['color/palette/**'] }, severityOverrides: { unused: 'off' } })).toEqual([]);
  });

  it('keep the same findings in the same order, minus the ignored ones', () => {
    const all = analyze(ds(), { profile: 'tiered' }).findings;
    const some = analyze(ds(), { profile: 'tiered', ignore: { unused: ['color/palette/**'] } }).findings;
    expect(some).toEqual(all.filter((f) => !(f.rule === 'unused' && f.id?.startsWith('color-palette'))));
  });
});

describe('ignore-globs fixture', () => {
  it('shows findings with and without ignores', async () => {
    const scenarios: Record<string, AnalyzeOptions> = {
      none: {},
      palette: { ignore: { unused: ['color/palette/**'] } },
      several: { ignore: { unused: ['color/palette/**', 'legacy/*'], 'desc-missing': ['color/fg/*'], 'broken-usage': ['Page'] } },
    };
    const out = Object.fromEntries(Object.entries(scenarios).map(([name, opts]) => [
      name, analyze(ds(), { profile: 'tiered', ...opts }).findings.map((f) => `${f.rule}: ${f.id ?? f.subject}`),
    ]));
    await expect(toGolden(out)).toMatchFileSnapshot(fixturePath('ignore-globs', 'expected.json'));
  });
});
