import type { Analysis, Category, Dataset, Severity, Tier, Token, TokenInfo } from '@systemma/core';
import { TIERS } from './tiers';

export const CATEGORY_ORDER: readonly Category[] = ['color', 'spacing', 'radius', 'border', 'typography', 'shadow', 'motion', 'other'];
export const CATEGORY_LABEL: Record<Category, string> = {
  color: 'Color', spacing: 'Spacing and size', radius: 'Radius', border: 'Border',
  typography: 'Typography', shadow: 'Shadow', motion: 'Motion', other: 'Other',
};

export interface TokenRow {
  token: Token;
  info: TokenInfo;
  counts: Record<Severity, number>;
}

export interface RowFilter {
  tier: Tier | 'all';
  category: Category | 'all';
  query: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Every token with its classification and how many findings it has, by category, then tier, then name.
export function buildRows(ds: Dataset, analysis: Analysis): TokenRow[] {
  const rows: TokenRow[] = [];
  for (const token of ds.tokens.values()) {
    const info = analysis.info.get(token.id);
    if (!info) continue;
    const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
    for (const f of analysis.byId.get(token.id) ?? []) counts[f.severity]++;
    rows.push({ token, info, counts });
  }
  const tierRank = (t: Tier): number => TIERS.indexOf(t);
  return rows.sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.info.category) - CATEGORY_ORDER.indexOf(b.info.category)
    || tierRank(a.info.tier) - tierRank(b.info.tier)
    || collator.compare(a.token.label, b.token.label));
}

export function filterRows(rows: readonly TokenRow[], filter: RowFilter): TokenRow[] {
  const q = filter.query.trim().toLowerCase();
  return rows.filter((r) => (filter.tier === 'all' || r.info.tier === filter.tier)
    && (filter.category === 'all' || r.info.category === filter.category)
    && (!q || `${r.token.label} ${r.token.id} ${r.token.description ?? ''}`.toLowerCase().includes(q)));
}

// A short name for a list: without a leading "--" or "color/", which most tokens in a list share.
export const shortLabel = (t: Token): string => t.label.replace(/^--/, '').replace(/^color[/-]/, '');
