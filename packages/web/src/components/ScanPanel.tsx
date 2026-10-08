import { useRef, useState } from 'react';
import { scanCandidates } from '@systemma/core';
import type { ScanCandidates } from '@systemma/core';
import { finishScan, rootName, toFileLike } from '../lib/scan';
import type { NewSource } from './Importer';

// A folder input is not in React's types yet; browsers other than Firefox on mobile support it.
const DIRECTORY = { webkitdirectory: '' } as Record<string, string>;

export function ScanPanel({ onAdd }: { onAdd(items: NewSource[]): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ scan: ScanCandidates; root: string } | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (list: FileList | null): Promise<void> => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy(true);
    setState(null);
    try {
      setStatus('Looking for token files…');
      const scan = await scanCandidates(files.map(toFileLike), (done, total) => setStatus(`Looking for token files… ${done}/${total}`));
      setState({ scan, root: rootName(files) });
      setChosen(new Set(scan.candidates.filter((c) => c.checked).map((c) => c.path)));
      setStatus(`${scan.usable.length} of ${scan.total} files in scope.`);
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const go = async (): Promise<void> => {
    if (!state) return;
    setBusy(true);
    try {
      const items = await finishScan(state.scan, chosen, state.root, (done, total) => setStatus(`Scanning usage… ${done}/${total}`));
      onAdd(items);
      setState(null);
      setStatus('');
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (path: string): void => {
    const next = new Set(chosen);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setChosen(next);
  };

  return (
    <div className="scan">
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={() => input.current?.click()}>Scan a repo folder</button>
        <span className="hint">Reads token files, and finds where code uses tokens or hardcodes their values. Choose a package or src folder, not one holding node_modules. Nothing leaves your browser.</span>
      </div>
      <input ref={input} type="file" multiple hidden aria-label="Choose a folder to scan" {...DIRECTORY} onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
      {status && <p className="hint" role="status">{status}</p>}
      {state && (
        <>
          <p>{state.scan.candidates.length ? 'Choose which files define tokens. Everything else is scanned for usage.' : 'No token files found. CSS custom properties and DTCG JSON are supported.'}</p>
          {state.scan.candidates.length > 0 && (
            <ul className="candidates">
              {state.scan.candidates.map((c) => (
                <li key={c.path}>
                  <label><input type="checkbox" checked={chosen.has(c.path)} onChange={() => toggle(c.path)} /> <span className="mono">{c.path}</span> <span className="dim2">{c.count} {c.kind === 'css' ? 'properties' : 'tokens'}</span></label>
                </li>
              ))}
            </ul>
          )}
          <button className="btn primary" type="button" disabled={busy} onClick={() => void go()}>Scan usage and load</button>
        </>
      )}
    </div>
  );
}
