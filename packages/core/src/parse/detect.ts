import { isResolver } from './resolver.js';

export type Detected =
  | { kind: 'dtcg' | 'figma' | 'usage'; json: unknown }
  | { kind: 'resolver'; json: unknown }
  | { kind: 'css' }
  | { kind: 'error'; message: string };

export type DetectedKind = Detected['kind'];

// Sniffs what a pasted or dropped file holds. JSON arrays are usage data, objects with Figma's
// variable keys are Figma exports, and any other object is treated as DTCG.
export function detectFormat(text: string): Detected {
  const s = text.trim();
  if (!s) return { kind: 'error', message: 'Empty input.' };
  if (s.startsWith('{') || s.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(s);
    } catch (e) {
      return { kind: 'error', message: 'Invalid JSON: ' + (e instanceof Error ? e.message : String(e)) };
    }
    if (Array.isArray(json)) return { kind: 'usage', json };
    // A resolver needs the files it points at, so a caller that cannot read them has to say so.
    if (isResolver(json)) return { kind: 'resolver', json };
    const obj = json as { meta?: { variables?: unknown }; variableCollections?: unknown };
    if (obj.meta?.variables || obj.variableCollections) return { kind: 'figma', json };
    return { kind: 'dtcg', json };
  }
  if (/--[\w-]+\s*:/.test(s)) return { kind: 'css' };
  return { kind: 'error', message: 'Unrecognized format. Expected JSON or CSS custom properties.' };
}
