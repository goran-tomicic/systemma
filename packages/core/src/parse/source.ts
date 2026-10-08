import type { Dataset, Mode } from '../model/types.js';
import { detectFormat } from './detect.js';
import { parseCss } from './css.js';
import { parseTokensJson } from './dtcg.js';
import { parseFigmaVariables } from './figma.js';
import { parseUsage } from './usage.js';

export type SourceKind = 'dtcg' | 'figma' | 'usage' | 'css';

export interface SourceOptions {
  // Where the text came from. Shown as the token source, and used to guess a mode.
  path: string;
  // The mode of a DTCG file. By default a path containing "dark" is dark and anything else is light.
  mode?: Mode;
  // Tokens Studio files nest tokens under set names; this drops them.
  stripSets?: boolean;
}

export type SourceResult =
  | { ok: true; kind: SourceKind; count: number; warnings: string[] }
  | { ok: false; message: string };

// Recognizes what a piece of text is and parses it into the dataset: DTCG or Tokens Studio JSON, a Figma
// variables export, CSS custom properties, or usage JSON. Text that is none of those is reported as a
// failure, not thrown, so a caller can skip it or show it.
export function parseSource(ds: Dataset, text: string, opts: SourceOptions): SourceResult {
  const detected = detectFormat(text);
  if (detected.kind === 'error') return { ok: false, message: detected.message };
  if (detected.kind === 'resolver') return { ok: false, message: 'A DTCG resolver document needs the files it references, which are not available here.' };
  const result =
    detected.kind === 'css' ? parseCss(ds, text, opts.path)
    : detected.kind === 'figma' ? parseFigmaVariables(ds, detected.json)
    : detected.kind === 'usage' ? parseUsage(ds, detected.json)
    : parseTokensJson(ds, detected.json, { mode: opts.mode ?? (/dark/i.test(opts.path) ? 'dark' : 'light'), source: opts.path, stripSet: opts.stripSets ?? false });
  return { ok: true, kind: detected.kind, count: result.count, warnings: result.warnings };
}
