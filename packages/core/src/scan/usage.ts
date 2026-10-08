import { canon } from '../model/ids.js';
import type { Dataset } from '../model/types.js';
import { detectFormat } from '../parse/detect.js';
import { parseCss } from '../parse/css.js';
import { parseTokensJson } from '../parse/dtcg.js';
import { findLiterals } from './literals.js';
import { componentNameFromPath } from './component-name.js';
import { CODE_EXT, SCRIPT_EXT, baseName, readAll } from './files.js';
import type { FileLike, Progress, ScanCandidates, ScanSummary } from './types.js';

// How far back from a var() to look for the property it sits in.
const PROP_LOOKBEHIND = 160;

// Parses the chosen definition files into the dataset, then reads every other code file for usage.
// Usage found here replaces any usage the dataset already had.
export async function scanUsage(scan: ScanCandidates, chosenPaths: ReadonlySet<string>, ds: Dataset, onProgress?: Progress): Promise<ScanSummary> {
  const chosen = scan.candidates.filter((c) => chosenPaths.has(c.path));
  let defValues = 0;
  for (const c of chosen) {
    const text = await c.file.text();
    if (c.kind === 'css') defValues += parseCss(ds, text, c.path).count;
    else {
      const d = detectFormat(text);
      if (d.kind === 'dtcg') defValues += parseTokensJson(ds, d.json, { mode: /dark/i.test(c.path) ? 'dark' : 'light', source: c.path }).count;
    }
  }

  ds.usage = [];
  ds.literals = [];
  const defPaths = new Set(chosen.map((c) => c.path));
  const prefixes = new Set([...ds.tokens.keys()].map((id) => id.split('-')[0]));
  const sources: FileLike[] = scan.usable.filter((f) => {
    const name = baseName(f.path);
    return CODE_EXT.test(name) && !defPaths.has(f.path) && !/\.(test|spec)\./.test(name);
  });
  const seen = new Set<string>();
  const seenLiterals = new Set<string>();
  let filesWithUsage = 0;

  await readAll(sources, (f, text) => {
    const component = componentNameFromPath(f.path);
    let any = false;
    const add = (token: string, prop: string): void => {
      const key = component + '|' + token + '|' + prop;
      if (seen.has(key)) return;
      seen.add(key);
      ds.usage.push({ component, file: f.path, prop, token });
      any = true;
    };

    const varRef = /var\(\s*--([\w-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = varRef.exec(text))) {
      const id = canon(m[1] ?? '');
      // A known token, or a name shaped like one (it shares a first segment with defined tokens) that no
      // style file declares: the second case is what lets a usage of a misspelled or removed token show up.
      if (ds.tokens.has(id) || (prefixes.has(id.split('-')[0]) && !scan.declared.has(id))) {
        const before = text.slice(Math.max(0, m.index - PROP_LOOKBEHIND), m.index);
        const pm = before.match(/([\w-]+)\s*:\s*[^;{}]*$/);
        add(id, pm?.[1] ?? '');
      }
    }

    if (SCRIPT_EXT.test(f.path)) {
      const quoted = /['"`]([A-Za-z][\w-]*(?:[./][\w-]+)+)['"`]/g;
      while ((m = quoted.exec(text))) {
        const id = canon(m[1] ?? '');
        if (ds.tokens.has(id)) add(id, '');
      }
    }
    for (const l of findLiterals(text, SCRIPT_EXT.test(f.path))) {
      const key = `${component}|${l.prop}|${l.value.toLowerCase()}`;
      if (seenLiterals.has(key)) continue;
      seenLiterals.add(key);
      ds.literals?.push({ component, file: f.path, prop: l.prop, value: l.value, kind: l.kind });
    }
    if (any) filesWithUsage++;
  }, onProgress);

  return { defFiles: chosen.length, defValues, scanned: sources.length, filesWithUsage, usages: ds.usage.length };
}
