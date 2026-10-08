import { createDataset, parseSource } from '@systemma/core';
import type { Dataset, LiteralUse, Mode, ScanSummary, SourceKind, UsageRecord } from '@systemma/core';

// A piece of text the person gave the app: a file they dropped, or something they pasted.
// Which set a source belongs to: the tokens being looked at, or the tokens they are compared against.
export type SourceSet = 'base' | 'compare';

// What a folder scan found in code. It is kept as found, not as text, so the scan runs once.
export interface ScanData {
  usage: UsageRecord[];
  literals: LiteralUse[];
  summary: ScanSummary;
}

export interface SourceEntry {
  id: number;
  set: SourceSet;
  name: string;
  text: string;
  // For a DTCG file: the mode to read it as. Without one, the name decides ("dark" in it means dark).
  mode?: Mode;
  // Set when the file could not be read at all.
  readError?: string;
  // Set for the entry that holds a folder scan's usage; it has no text.
  scan?: ScanData;
}

export interface LoadedSource extends SourceEntry {
  kind: SourceKind | 'scan' | null;
  count: number;
  warnings: string[];
  // Why the text could not be used, if it could not.
  error: string | null;
}

export interface Loaded {
  ds: Dataset;
  sources: LoadedSource[];
}

// Parses every source, in the order they were added, into one dataset. The first source to define a name keeps
// it, as on the command line. A source that cannot be used is kept in the list with its error, so the person can
// see what went wrong and remove it.
export function loadSources(entries: readonly SourceEntry[], opts: { stripSets: boolean; name?: string }): Loaded {
  const ds = createDataset(opts.name ?? 'Token set');
  const sources = entries.map((entry): LoadedSource => {
    if (entry.scan) {
      ds.usage.push(...entry.scan.usage);
      (ds.literals ??= []).push(...entry.scan.literals);
      const warnings = entry.scan.usage.length ? [] : ['No use of any token was found in the scanned code. Is it the right folder?'];
      return { ...entry, kind: 'scan', count: entry.scan.usage.length, warnings, error: null };
    }
    if (entry.readError) return { ...entry, kind: null, count: 0, warnings: [], error: entry.readError };
    const r = parseSource(ds, entry.text, { path: entry.name, stripSets: opts.stripSets, ...(entry.mode ? { mode: entry.mode } : {}) });
    return r.ok ? { ...entry, kind: r.kind, count: r.count, warnings: r.warnings, error: null } : { ...entry, kind: null, count: 0, warnings: [], error: r.message };
  });
  return { ds, sources };
}

export const KIND_LABEL: Record<SourceKind | 'scan', string> = {
  scan: 'Repo scan',
  dtcg: 'DTCG / Tokens Studio JSON',
  css: 'CSS custom properties',
  figma: 'Figma variables',
  usage: 'Usage JSON',
};
