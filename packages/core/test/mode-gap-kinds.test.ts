import { describe, expect, it } from 'vitest';
import { analyze, createDataset } from '../src/index.js';
import type { AnalyzeOptions, Dataset, Kind } from '../src/index.js';
import { fixturePath, readFixture, toGolden } from './helpers/golden.js';
import { findings, fromJson } from './helpers/build.js';

const fixture = (): Dataset => {
  const ds = createDataset('t');
  fromJson(JSON.parse(readFixture('mode-gap-kinds', 'light.json')), { ds });
  fromJson(JSON.parse(readFixture('mode-gap-kinds', 'dark.json')), { ds, mode: 'dark' });
  return ds;
};
const gaps = (ds: Dataset, modeGapKinds?: Kind[], extra: AnalyzeOptions = {}): string[] =>
  findings(ds, 'mode-gap', { ...(modeGapKinds ? { modeGapKinds } : {}), ...extra }).map((f) => f.id ?? '');

describe('mode-gap kinds', () => {
  it('looks at colors only by default, as before', () => {
    expect(gaps(fixture())).toEqual(['color-border']);
  });

  it('can watch other kinds as well', () => {
    expect(gaps(fixture(), ['color', 'dimension'])).toEqual(['color-border', 'size-gutter']);
  });

  it('can watch a kind without watching colors', () => {
    expect(gaps(fixture(), ['dimension'])).toEqual(['size-gutter']);
  });

  it('checks each kind on its own, only once a token of that kind has a dark value', () => {
    expect(gaps(fixture(), ['fontWeight'])).toEqual([]);
    expect(gaps(fixture(), ['color', 'fontWeight'])).toEqual(['color-border']);
    const ds = fixture();
    ds.tokens.get('font-body')!.modes.dark = { lit: '300' };
    expect(gaps(ds, ['color', 'fontWeight'])).toEqual(['color-border', 'font-strong']);
  });

  it('does not let a dark value of an unwatched kind switch the rule on', () => {
    const ds = fixture();
    ds.tokens.get('size-content')!.modes = { light: { ref: 'size-base' } };
    expect(gaps(ds, ['dimension'])).toEqual([]);
  });

  it('checks nothing for an empty list', () => {
    expect(gaps(fixture(), [])).toEqual([]);
  });

  it('still exempts foundation tokens', () => {
    expect(gaps(fixture(), ['color', 'dimension', 'fontWeight'])).not.toContain('size-base');
    expect(gaps(fixture(), ['color', 'dimension', 'fontWeight'])).not.toContain('color-white');
  });

  it('keeps the same message whichever kind it is about', () => {
    const f = findings(fixture(), 'mode-gap', { modeGapKinds: ['dimension'] });
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'size-gutter', message: 'has a light value but no dark value' });
  });

  it('is passed through analyze', () => {
    expect(analyze(fixture(), { profile: 'tiered', modeGapKinds: ['dimension'] }).findings.some((f) => f.rule === 'mode-gap' && f.id === 'size-gutter')).toBe(true);
  });
});

describe('mode-gap-kinds fixture', () => {
  it('shows the default and a widened list on the same tokens', async () => {
    const ds = fixture();
    const kinds: Record<string, Kind[] | undefined> = { default: undefined, colorAndDimension: ['color', 'dimension'], everything: ['color', 'dimension', 'fontWeight'] };
    const out = Object.fromEntries(Object.entries(kinds).map(([name, k]) => [name, gaps(ds, k)]));
    await expect(toGolden(out)).toMatchFileSnapshot(fixturePath('mode-gap-kinds', 'expected.json'));
  });
});
