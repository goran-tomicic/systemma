import type { Mode } from '@systemma/core';
import { KIND_LABEL } from '../lib/sources';
import type { LoadedSource, ScanData } from '../lib/sources';

const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
const scanLine = ({ summary, literals }: ScanData): string =>
  `${plural(summary.defFiles, 'token file')} read, ${plural(summary.scanned, 'code file')} scanned, ${plural(summary.filesWithUsage, 'file')} using tokens, ${plural(literals.length, 'raw value')}.`;

export function SourceList({ title = 'Sources', sources, onRemove, onMode }: { title?: string; sources: LoadedSource[]; onRemove(id: number): void; onMode(id: number, mode: Mode | undefined): void }) {
  if (!sources.length) return null;
  // Open when something needs a look, closed when every source loaded cleanly.
  const problems = sources.filter((s) => s.error || s.warnings.length).length;
  return (
    <details className="sourcebox" open={problems > 0} aria-label={title} role="region">
      <summary>
        {title} <span className="badge">{sources.length}</span>
        {problems > 0 && <span className="badge warn">{problems} to check</span>}
      </summary>
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.id} className={s.error ? 'bad' : undefined}>
            <div className="src-main">
              <span className="src-name">{s.name}</span>
              {s.kind && <span className="badge">{KIND_LABEL[s.kind]}</span>}
              {s.kind && <span className="src-count">{s.count} {s.kind === 'usage' || s.kind === 'scan' ? 'uses' : 'values'}</span>}
              {s.kind === 'dtcg' && (
                <label className="inline">
                  <span>Read as</span>
                  <select value={s.mode ?? 'auto'} onChange={(e) => onMode(s.id, e.target.value === 'auto' ? undefined : (e.target.value as Mode))}>
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              )}
              <button className="btn sm" type="button" onClick={() => onRemove(s.id)} aria-label={`Remove ${s.name}`}>Remove</button>
            </div>
            {s.scan && <p className="hint">{scanLine(s.scan)}</p>}
            {s.error && <p className="src-error" role="alert">{s.error}</p>}
            {s.warnings.map((w) => <p key={w} className="src-warn">{w}</p>)}
          </li>
        ))}
      </ul>
    </details>
  );
}
