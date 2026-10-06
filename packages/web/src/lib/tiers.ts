import type { Analysis, Tier } from '@systemma/core';

export const TIERS: readonly Tier[] = ['foundation', 'common', 'palette'];

export const TIER_LABEL: Record<Tier, string> = {
  foundation: 'Foundation',
  common: 'Common',
  palette: 'Palette',
};

export function tierCounts(analysis: Analysis): Record<Tier, number> {
  const counts: Record<Tier, number> = { foundation: 0, common: 0, palette: 0 };
  for (const info of analysis.info.values()) counts[info.tier]++;
  return counts;
}
