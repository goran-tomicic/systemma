import { canon } from '../model/ids.js';
import { createDataset } from '../model/dataset.js';
import { detectFormat } from '../parse/detect.js';
import { parseTokensJson } from '../parse/dtcg.js';
import { MAX_FILE_BYTES, SKIP_DIR, STYLE_EXT, baseName, readAll } from './files.js';
import type { Candidate, FileLike, Progress, ScanCandidates } from './types.js';

// A style file is pre-selected when it declares many custom properties, or a few and its path says
// "tokens" or "theme". A JSON file is only a candidate when it parses as DTCG with five or more tokens.
const TOKEN_PATH_HINT = /token|theme|variables|colou?rs?|design|global|base|root|vars/i;
const JSON_PATH_HINT = /token|theme|colou?r|design|variables|palette|brand/i;

export async function scanCandidates(files: FileLike[], onProgress?: Progress): Promise<ScanCandidates> {
  const usable = files.filter((f) => !SKIP_DIR.test(f.path) && f.size < MAX_FILE_BYTES && !/\.min\.|\.d\.ts$|-lock\.|\.lock$/.test(f.path));
  const candidates: Candidate[] = [];
  const declared = new Set<string>();
  const styleFiles = usable.filter((f) => STYLE_EXT.test(baseName(f.path)));
  const jsonFiles = usable.filter((f) => /\.json$/i.test(baseName(f.path)) && JSON_PATH_HINT.test(f.path));

  await readAll(styleFiles, (f, text) => {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const names = [...clean.matchAll(/(?:^|[;{\s])--([\w-]+)\s*:/g)].map((m) => m[1] ?? '');
    if (!names.length) return;
    for (const n of names) declared.add(canon(n));
    candidates.push({
      file: f, path: f.path, kind: 'css', count: names.length,
      checked: names.length >= 8 || (TOKEN_PATH_HINT.test(f.path) && names.length >= 3),
    });
  }, onProgress);

  await readAll(jsonFiles, (f, text) => {
    const d = detectFormat(text);
    if (d.kind !== 'dtcg') return;
    const { count } = parseTokensJson(createDataset(''), d.json, { mode: 'light', source: '' });
    if (count >= 5) candidates.push({ file: f, path: f.path, kind: 'json', count, checked: true });
  });

  candidates.sort((a, b) => b.count - a.count);
  return { candidates, declared, usable, total: files.length };
}
