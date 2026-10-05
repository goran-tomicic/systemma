import { describe, expect, it } from 'vitest';
import { analyze, createDataset } from '../src/index.js';
import type { AnalyzeOptions, ContrastPair, Dataset } from '../src/index.js';
import { requiredRatio } from '../src/rules/contrast-pairs.js';
import { findings, literal } from './helpers/build.js';

// Ratios used below, from the built color math: #767676 on white 4.54, #8a8a8a 3.45, #999999 2.85,
// #6b6b6b 5.33, #595959 7.0 (just AAA), #666666 5.74.
const set = (rows: [string, string, string?][]): Dataset => {
  const ds = createDataset();
  for (const [label, light, dark] of rows) literal(ds, label, light, dark);
  return ds;
};
const run = (ds: Dataset, pairs: ContrastPair[] | undefined, rule: 'contrast' | 'contrast-aaa' = 'contrast', extra: AnalyzeOptions = {}) =>
  findings(ds, rule, { contrastPairs: pairs, ...(rule === 'contrast-aaa' ? { enabledRulesets: new Set(['wcag-aaa'] as const) } : {}), ...extra });

describe('requiredRatio', () => {
  it.each([
    ['AA', false, 4.5], ['AA', true, 3], ['AAA', false, 7], ['AAA', true, 4.5],
  ] as const)('%s, large text %s -> %s', (level, large, expected) => {
    expect(requiredRatio(level, large)).toBe(expected);
  });
});

describe('declared pairs', () => {
  const ds = (): Dataset => set([['color/brand/text', '#999999'], ['color/brand/bg', '#ffffff'], ['color/fg/base', '#999999'], ['color/surface/base', '#ffffff']]);

  it('check only the pairs given, not the ones inference would find', () => {
    const f = run(ds(), [{ foreground: 'color/brand/text', background: 'color/brand/bg' }]);
    expect(f.map((x) => x.id)).toEqual(['color-brand-text']);
    expect(run(ds(), undefined).map((x) => x.id)).toEqual(['color-fg-base']);
  });

  it('say what ratio they needed, while inferred findings keep the original wording', () => {
    const declared = run(ds(), [{ foreground: 'color/brand/text', background: 'color/brand/bg' }]);
    expect(declared[0]).toMatchObject({ severity: 'error', subject: 'color/brand/text', message: 'on color/brand/bg · 2.85:1 (light), needs 4.5:1' });
    expect(run(ds(), undefined)[0]?.message).toBe('on color/surface/base · 2.85:1 (light)');
  });

  it('accept ids, slash paths, dot paths and alias syntax for the tokens', () => {
    const forms: [string, string][] = [
      ['color-brand-text', 'color-brand-bg'], ['color.brand.text', 'color.brand.bg'],
      ['{color.brand.text}', '{color.brand.bg}'], ['--color-brand-text', 'var(--color-brand-bg)'],
    ];
    for (const [fg, bg] of forms) {
      expect(run(ds(), [{ foreground: fg, background: bg }])).toHaveLength(1);
    }
  });

  it('check an empty list as nothing at all', () => {
    expect(run(ds(), [])).toEqual([]);
  });

  it('check every mode', () => {
    const d = set([['a', '#000000', '#555555'], ['b', '#ffffff', '#000000']]);
    const f = run(d, [{ foreground: 'a', background: 'b' }]);
    expect(f.map((x) => x.message)).toEqual(['on b · 2.82:1 (dark), needs 4.5:1']);
  });

  it('report one finding per failing pair and mode, in declaration order', () => {
    const d = set([['t1', '#999999'], ['t2', '#999999'], ['bg', '#ffffff']]);
    const f = run(d, [{ foreground: 't2', background: 'bg' }, { foreground: 't1', background: 'bg' }]);
    expect(f.map((x) => x.id)).toEqual(['t2', 't1']);
  });

  it('are quiet at or above the required ratio, and for colors that cannot be judged', () => {
    const ok = set([['t', '#767676'], ['bg', '#ffffff']]);
    expect(run(ok, [{ foreground: 't', background: 'bg' }])).toEqual([]);
    const translucent = set([['t', '#cccccc'], ['bg', 'rgba(255,255,255,0.5)']]);
    expect(run(translucent, [{ foreground: 't', background: 'bg' }])).toEqual([]);
  });

  it('can be recolored or silenced like any other contrast finding', () => {
    const d = ds();
    const pair = [{ foreground: 'color/brand/text', background: 'color/brand/bg' }];
    expect(run(d, pair, 'contrast', { severityOverrides: { contrast: 'info' } })[0]?.severity).toBe('info');
    expect(run(d, pair, 'contrast', { severityOverrides: { contrast: 'off' } })).toEqual([]);
  });
});

describe('levels and large text', () => {
  const d = (fg: string): Dataset => set([['t', fg], ['bg', '#ffffff']]);
  const pair = (extra: Partial<ContrastPair>): ContrastPair[] => [{ foreground: 't', background: 'bg', ...extra }];

  it('hold large text to 3:1 at AA, so 3.45 passes where normal text fails', () => {
    expect(run(d('#8a8a8a'), pair({}))).toHaveLength(1);
    expect(run(d('#8a8a8a'), pair({ largeText: true }))).toEqual([]);
    expect(run(d('#999999'), pair({ largeText: true }))[0]).toMatchObject({ severity: 'error', message: 'on bg · 2.85:1 (light), needs 3:1' });
  });

  it('hold a declared AAA pair to 7:1 in the contrast rule', () => {
    const f = run(d('#767676'), pair({ level: 'AAA' }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', message: 'on bg · 4.54:1 (light), needs 7:1' });
    expect(run(d('#595959'), pair({ level: 'AAA' }))).toEqual([]);
  });

  it('hold large AAA text to 4.5:1', () => {
    expect(run(d('#8a8a8a'), pair({ level: 'AAA', largeText: true }))).toHaveLength(1);
    expect(run(d('#767676'), pair({ level: 'AAA', largeText: true }))).toEqual([]);
  });

  it('treat AA as the default level', () => {
    expect(run(d('#767676'), pair({}))).toEqual(run(d('#767676'), pair({ level: 'AA' })));
  });
});

describe('contrast-aaa with declared pairs', () => {
  const d = (fg: string): Dataset => set([['t', fg], ['bg', '#ffffff']]);

  it('reports an AA pair that passes AA but not AAA, saying what AAA needs', () => {
    const f = run(d('#767676'), [{ foreground: 't', background: 'bg' }], 'contrast-aaa');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', set: 'wcag-aaa', message: 'on bg · 4.54:1 (light), AAA needs 7:1' });
  });

  it('uses the large text range of 3 to 4.5', () => {
    const pairs = [{ foreground: 't', background: 'bg', largeText: true }];
    expect(run(d('#8a8a8a'), pairs, 'contrast-aaa')).toHaveLength(1);
    expect(run(d('#767676'), pairs, 'contrast-aaa')).toEqual([]);
  });

  it('skips a declared AAA pair, which the contrast rule already holds to AAA', () => {
    expect(run(d('#767676'), [{ foreground: 't', background: 'bg', level: 'AAA' }], 'contrast-aaa')).toEqual([]);
  });

  it('stays quiet for a pair below AA (that is the contrast rule) or at AAA', () => {
    const pairs = [{ foreground: 't', background: 'bg' }];
    expect(run(d('#999999'), pairs, 'contrast-aaa')).toEqual([]);
    expect(run(d('#595959'), pairs, 'contrast-aaa')).toEqual([]);
  });
});

describe('pairs that name undefined tokens', () => {
  it('produce a warning instead of being skipped, so a typo is not silent', () => {
    const d = set([['t', '#999999'], ['bg', '#ffffff']]);
    const f = run(d, [{ foreground: 't', background: 'bg-typo' }, { foreground: 'nope', background: 'bg' }]);
    expect(f.map((x) => [x.severity, x.id, x.subject, x.message])).toEqual([
      ['warn', null, 't on bg-typo', "declared pair names bg-typo, which isn't defined"],
      ['warn', null, 'nope on bg', "declared pair names nope, which isn't defined"],
    ]);
  });

  it('still check the pairs that are fine', () => {
    const d = set([['t', '#999999'], ['bg', '#ffffff']]);
    const f = run(d, [{ foreground: 'x', background: 'bg' }, { foreground: 't', background: 'bg' }]);
    expect(f.map((x) => x.id)).toEqual([null, 't']);
  });
});

describe('through analyze', () => {
  it('passes the pairs to the audit', () => {
    const d = set([['t', '#999999'], ['bg', '#ffffff']]);
    const a = analyze(d, { contrastPairs: [{ foreground: 't', background: 'bg' }] });
    expect(a.findings.filter((f) => f.rule === 'contrast')).toHaveLength(1);
    expect(analyze(d).findings.filter((f) => f.rule === 'contrast')).toEqual([]);
  });
});
