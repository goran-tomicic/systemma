import { createDataset, scanUsage } from '@systemma/core';
import type { FileLike, Progress, ScanCandidates } from '@systemma/core';
import type { NewSource } from '../components/Importer';

// A browser File with a path inside the chosen folder. The first segment of webkitRelativePath is the folder's own
// name, which a repo-relative path does not have.
export function toFileLike(file: File): FileLike {
  const rel = file.webkitRelativePath;
  return { path: rel ? rel.split('/').slice(1).join('/') || file.name : file.name, size: file.size, text: () => file.text() };
}

export const rootName = (files: readonly File[]): string => (files[0]?.webkitRelativePath ?? '').split('/')[0] || 'folder';

// The chosen token files as ordinary sources, plus one entry holding what the rest of the code uses. The usage is
// scanned against the chosen files only, so it names the tokens the app is about to load.
export async function finishScan(scan: ScanCandidates, chosen: ReadonlySet<string>, root: string, onProgress?: Progress): Promise<NewSource[]> {
  const found = createDataset(root);
  const summary = await scanUsage(scan, chosen, found, onProgress);
  const files = scan.candidates.filter((c) => chosen.has(c.path)).sort((a, b) => a.path.localeCompare(b.path));
  const items: NewSource[] = [];
  for (const c of files) {
    try {
      items.push({ name: c.path, text: await c.file.text() });
    } catch (e) {
      items.push({ name: c.path, text: '', readError: `Could not read this file (${e instanceof Error ? e.message : String(e)}).` });
    }
  }
  items.push({ name: `Scan of ${root}`, text: '', scan: { usage: found.usage, literals: found.literals ?? [], summary } });
  return items;
}
