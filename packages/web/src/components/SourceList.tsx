import type { Mode } from '@systemma/core';
import { KIND_LABEL } from '../lib/sources';
import type { LoadedSource } from '../lib/sources';

export function SourceList({ sources, onRemove, onMode }: { sources: LoadedSource[]; onRemove(id: number): void; onMode(id: number, mode: Mode | undefined): void }) {
  if (!sources.length) return null;
  return (
    <section aria-label="Sources">
      <h2>Sources</h2>
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.id} className={s.error ? 'bad' : undefined}>
            <div className="src-main">
              <span className="src-name">{s.name}</span>
              {s.kind && <span className="badge">{KIND_LABEL[s.kind]}</span>}
              {s.kind && <span className="src-count">{s.count} {s.kind === 'usage' ? 'uses' : 'values'}</span>}
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
            {s.error && <p className="src-error" role="alert">{s.error}</p>}
            {s.warnings.map((w) => <p key={w} className="src-warn">{w}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
