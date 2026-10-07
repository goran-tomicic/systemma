import type { Dataset, DiffChange, Mode } from '@systemma/core';

export type ModeFilter = Mode | 'all';

export const labelOf = (ds: Dataset, id: string): string => ds.tokens.get(id)?.label ?? id;

// The value changes in one mode, or all of them, whose token name or either value contains the text.
export function filterChanges(changes: readonly DiffChange[], ds: Dataset, mode: ModeFilter, query: string): DiffChange[] {
  const q = query.trim().toLowerCase();
  return changes.filter((c) => (mode === 'all' || c.mode === mode)
    && (!q || `${labelOf(ds, c.id)} ${c.id} ${c.a} ${c.b}`.toLowerCase().includes(q)));
}
