import { describe, expect, it } from 'vitest';
import {
  GENERIC_PROFILE, PROFILES, TIERED_PROFILE, analyze, chooseProfile, classify, createDataset, createProfile, resolveProfile,
} from '../src/index.js';
import type { Dataset, Profile, ProfileConfig, TokenValue } from '../src/index.js';
import { followsTieredScheme } from '../src/resolve/profile.js';
import { addToken } from '../src/parse/add-token.js';
import { fixturePath, readFixture, toGolden } from './helpers/golden.js';
import { fromCss } from './helpers/build.js';

const lit = (s: string): TokenValue => ({ lit: s });
const ref = (s: string): TokenValue => ({ ref: s });

const withIds = (ids: string[]): Dataset => {
  const ds = createDataset();
  for (const id of ids) addToken(ds, id, 'light', lit('#fff'));
  return ds;
};
const FIVE = ['color-surface-a', 'color-surface-b', 'color-palette-a-solid', 'color-palette-b-solid', 'color-palette-c-solid'];

describe('generic profile', () => {
  it('has no id rules, so tier comes from collections and from literal versus alias', () => {
    const ds = createDataset();
    const raw = addToken(ds, 'color-surface-base', 'light', lit('#fff'));
    const alias = addToken(ds, 'surface-card', 'light', ref('color-surface-base'));
    const grouped = addToken(ds, 'brand-500', 'light', lit('#06f'), { collection: 'Palette' });
    expect(classify(raw, ds, GENERIC_PROFILE).tier).toBe('foundation');
    expect(classify(alias, ds, GENERIC_PROFILE).tier).toBe('common');
    expect(classify(grouped, ds, GENERIC_PROFILE).tier).toBe('palette');
    expect(GENERIC_PROFILE.tierOfId('color-palette-brand-solid')).toBeUndefined();
  });

  it.each([
    [['color', 'brand', '500'], 'brand'],
    [['colour', 'brand', '500'], 'brand'],
    [['colors', 'brand', '500'], 'brand'],
    [['brand', '500'], 'brand'],
    [['action', 'primary', 'hover'], 'action'],
    [['color', 'primary'], undefined],
    [['primary'], undefined],
    [['colorful', 'x'], 'colorful'],
  ])('names the group of %j as %s', (seg, group) => {
    expect(GENERIC_PROFILE.groupOfColor('common', seg)).toBe(group);
  });

  it('reports a color with no usable group as "other"', () => {
    const ds = createDataset();
    expect(classify(addToken(ds, 'primary', 'light', lit('#06f')), ds, GENERIC_PROFILE).group).toBe('other');
  });

  it('leaves non-color groups to the category', () => {
    const ds = createDataset();
    expect(classify(addToken(ds, 'space-4', 'light', lit('16px')), ds, GENERIC_PROFILE).group).toBe('spacing');
  });
});

describe('choosing a profile', () => {
  it('picks the tiered profile at five palette or surface color tokens, and the generic one below', () => {
    expect(chooseProfile(withIds(FIVE))).toBe(TIERED_PROFILE);
    expect(chooseProfile(withIds(FIVE.slice(1)))).toBe(GENERIC_PROFILE);
    expect(followsTieredScheme(withIds(FIVE))).toBe(true);
    expect(followsTieredScheme(createDataset())).toBe(false);
  });

  it('counts only the palette and surface namespaces', () => {
    expect(chooseProfile(withIds(['color-fg-a', 'color-fg-b', 'color-border-a', 'color-bg-a', 'color-gray-5']))).toBe(GENERIC_PROFILE);
  });

  it('is what classify uses when no profile is given', () => {
    const tiered = withIds(FIVE);
    const t = tiered.tokens.get('color-surface-a')!;
    expect(classify(t, tiered)).toEqual(classify(t, tiered, TIERED_PROFILE));
    const other = withIds(['color-surface-a']);
    const o = other.tokens.get('color-surface-a')!;
    expect(classify(o, other)).toEqual(classify(o, other, GENERIC_PROFILE));
  });
});

describe('resolveProfile', () => {
  const ds = withIds(FIVE);

  it('maps the names and treats undefined as auto', () => {
    expect(resolveProfile('tiered', createDataset())).toBe(TIERED_PROFILE);
    expect(resolveProfile('generic', ds)).toBe(GENERIC_PROFILE);
    expect(resolveProfile('auto', ds)).toBe(TIERED_PROFILE);
    expect(resolveProfile(undefined, createDataset())).toBe(GENERIC_PROFILE);
    expect(PROFILES.tiered).toBe(TIERED_PROFILE);
  });

  it('passes a profile object through and builds one from a config', () => {
    const own: Profile = { id: 'own', tierOfId: () => 'palette', groupOfColor: () => 'g' };
    expect(resolveProfile(own, ds)).toBe(own);
    const built = resolveProfile({ id: 'cfg', tiers: { palette: ['^p-'] } }, ds);
    expect(built.id).toBe('cfg');
    expect(built.tierOfId('p-1')).toBe('palette');
  });
});

describe('createProfile', () => {
  const config: ProfileConfig = {
    id: 'acme',
    tiers: { foundation: ['^raw-'], palette: ['^role-', '-palette$'], common: ['^sys-', '^raw-ambiguous'] },
    groupSegment: { common: 1 },
  };
  const profile = createProfile(config);

  it('matches tier patterns against the id, trying foundation, then palette, then common', () => {
    expect(profile.tierOfId('raw-blue')).toBe('foundation');
    expect(profile.tierOfId('role-primary')).toBe('palette');
    expect(profile.tierOfId('blue-palette')).toBe('palette');
    expect(profile.tierOfId('sys-surface')).toBe('common');
    expect(profile.tierOfId('raw-ambiguous')).toBe('foundation');
  });

  it('has no opinion when nothing matches, so the shared fallbacks decide', () => {
    expect(profile.tierOfId('other')).toBeUndefined();
    expect(createProfile({ id: 'empty' }).tierOfId('anything')).toBeUndefined();
  });

  it('names a group from the configured segment, else like the generic profile', () => {
    expect(profile.groupOfColor('common', ['sys', 'surface', 'base'])).toBe('surface');
    expect(profile.groupOfColor('common', ['sys'])).toBeUndefined();
    expect(profile.groupOfColor('foundation', ['color', 'brand', '500'])).toBe('brand');
  });

  it('throws a clear error for a pattern that is not a valid regular expression', () => {
    expect(() => createProfile({ id: 'bad', tiers: { common: ['(unclosed'] } })).toThrow(/Profile "bad": "\(unclosed" is not a valid regular expression \(tier common\)/);
  });

  it('can classify through a whole analysis', () => {
    const ds = createDataset();
    addToken(ds, 'sys-surface-base', 'light', lit('#fff'));
    const a = analyze(ds, { profile: config });
    expect(a.info.get('sys-surface-base')).toMatchObject({ tier: 'common', group: 'surface' });
  });
});

describe('analyze profile option', () => {
  const tiered = (): Dataset => withIds([...FIVE, 'color-fg-base']);
  const plain = (): Dataset => fromCss(':root { --brand-500: #06f; --color-surface-base: #fff; }');

  it('defaults to auto: tiered data classifies as before, other data generically', () => {
    expect(analyze(tiered()).info).toEqual(analyze(tiered(), { profile: 'tiered' }).info);
    expect(analyze(plain()).info).toEqual(analyze(plain(), { profile: 'generic' }).info);
    expect(analyze(plain()).info.get('color-surface-base')?.tier).toBe('foundation');
    expect(analyze(plain(), { profile: 'tiered' }).info.get('color-surface-base')?.tier).toBe('common');
  });

  it('accepts a profile object', () => {
    const own: Profile = { id: 'own', tierOfId: () => 'palette', groupOfColor: () => 'mine' };
    expect(analyze(plain(), { profile: own }).info.get('brand-500')).toMatchObject({ tier: 'palette', group: 'mine' });
  });

  // Under the tiered profile the surface and fg colors are semantic tokens, so lacking a dark value is a gap.
  // Under the generic profile they are raw values (they are literals), and raw values are exempt.
  it('changes what the tier-based rules see', () => {
    const gaps = (profile: 'tiered' | 'generic'): string[] => {
      const ds = fromCss(':root { --color-surface-base: #fff; --color-fg-base: #111; --brand-500: #00f; }\n[data-theme="dark"] { --brand-500: #000; }');
      return analyze(ds, { profile }).findings.filter((f) => f.rule === 'mode-gap').map((f) => f.id ?? '');
    };
    expect(gaps('tiered')).toEqual(['color-surface-base', 'color-fg-base']);
    expect(gaps('generic')).toEqual([]);
  });
});

describe('profile-generic fixture', () => {
  it('shows the same stylesheet under each profile', async () => {
    const ds = fromCss(readFixture('profile-generic', 'input.css'));
    const info = (profile: 'tiered' | 'generic') => Object.fromEntries([...analyze(ds, { profile }).info].map(([id, i]) => [id, `${i.tier} / ${i.group} / ${i.kind}`]));
    const rules = (profile: 'tiered' | 'generic') => {
      const counts: Record<string, number> = {};
      for (const f of analyze(ds, { profile }).findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
      return counts;
    };
    await expect(toGolden({
      auto: chooseProfile(ds).id,
      generic: { info: info('generic'), findings: rules('generic') },
      tiered: { info: info('tiered'), findings: rules('tiered') },
    })).toMatchFileSnapshot(fixturePath('profile-generic', 'expected.json'));
  });
});
