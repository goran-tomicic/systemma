import type { Dataset, Tier } from '../model/types.js';

// Tier and group depend on how a team names its tokens. A profile carries those naming rules; the
// collection-name and literal-versus-alias fallbacks in classify() are shared by every profile.
export interface Profile {
  id: string;
  // Decide a tier from the id alone. Return undefined to fall through to collection names and values.
  tierOfId(id: string): Tier | undefined;
  // Name the group within a tier, from the id segments. Empty or undefined becomes 'other'.
  groupOfColor(tier: Tier, segments: string[]): string | undefined;
}

// Plain data for a profile, so a config file can supply one. Patterns are regular expression sources
// matched against the canonical id.
export interface ProfileConfig {
  id: string;
  // The first tier with a matching pattern wins, tried as foundation, then palette, then common.
  tiers?: Partial<Record<Tier, readonly string[]>>;
  // For color tokens, the 0-based hyphen segment of the id that names the group, per tier.
  groupSegment?: Partial<Record<Tier, number>>;
}

export type ProfileSpec = Profile | ProfileConfig | 'auto' | 'tiered' | 'generic';

// The scheme with a foundation, a common and a palette tier: raw colors, semantic surface/fg/border/bg
// colors, and color-palette-<role>-<variant> roles. Its id rules and group names are specific to it.
export const TIERED_PROFILE: Profile = {
  id: 'tiered',
  tierOfId(id) {
    if (/^color-(white|black|transparent)$/.test(id) || /^color-[a-z]+-\d+$/.test(id)) return 'foundation';
    if (id.startsWith('color-palette-')) return 'palette';
    if (/^color-(surface|fg|border|bg)-/.test(id)) return 'common';
    return undefined;
  },
  groupOfColor(tier, seg) {
    if (tier === 'foundation') return seg.length > 2 ? seg[1] : 'utility';
    if (tier === 'palette') return seg[0] === 'color' && seg[1] === 'palette' ? seg[2] : seg[1] || seg[0];
    return seg.length > 1 ? seg[1] : seg[0];
  },
};

// No naming assumptions: the tier comes from collection names or from whether a token is a raw value
// or an alias, and a color's group is its first segment after an optional leading "color".
export const GENERIC_PROFILE: Profile = {
  id: 'generic',
  tierOfId: () => undefined,
  groupOfColor(_tier, seg) {
    const rest = /^colou?rs?$/.test(seg[0] ?? '') ? seg.slice(1) : seg;
    return rest.length > 1 ? rest[0] : undefined;
  },
};

// Five color tokens in the scheme's palette or surface namespaces is enough to say the data follows it.
export function followsTieredScheme(ds: Dataset): boolean {
  let n = 0;
  for (const id of ds.tokens.keys()) if (/^color-(palette|surface)-/.test(id) && ++n >= 5) return true;
  return false;
}

const TIER_ORDER: readonly Tier[] = ['foundation', 'palette', 'common'];

// Builds a profile from data. A pattern that is not a valid regular expression throws, naming the
// pattern, because a bad config should fail loudly instead of silently classifying nothing.
export function createProfile(config: ProfileConfig): Profile {
  const compiled = TIER_ORDER.map((tier): [Tier, RegExp[]] => [
    tier,
    (config.tiers?.[tier] ?? []).map((source) => {
      try {
        return new RegExp(source);
      } catch {
        throw new Error(`Profile "${config.id}": "${source}" is not a valid regular expression (tier ${tier}).`);
      }
    }),
  ]);
  return {
    id: config.id,
    tierOfId(id) {
      for (const [tier, patterns] of compiled) if (patterns.some((p) => p.test(id))) return tier;
      return undefined;
    },
    groupOfColor(tier, seg) {
      const index = config.groupSegment?.[tier];
      return index === undefined ? GENERIC_PROFILE.groupOfColor(tier, seg) : seg[index];
    },
  };
}

export const PROFILES: Readonly<Record<'tiered' | 'generic', Profile>> = { tiered: TIERED_PROFILE, generic: GENERIC_PROFILE };

// The profile 'auto' picks: the tiered one for data that follows its scheme, the generic one otherwise.
export const chooseProfile = (ds: Dataset): Profile => (followsTieredScheme(ds) ? TIERED_PROFILE : GENERIC_PROFILE);

export function resolveProfile(spec: ProfileSpec | undefined, ds: Dataset): Profile {
  if (spec === undefined || spec === 'auto') return chooseProfile(ds);
  if (spec === 'tiered' || spec === 'generic') return PROFILES[spec];
  return 'tierOfId' in spec ? spec : createProfile(spec);
}
