import { useMemo, useState } from 'react';
import type { Analysis, Dataset, DiffResult, Mode } from '@systemma/core';
import { filterChanges, labelOf } from '../lib/compare';
import type { ModeFilter } from '../lib/compare';
import { Preview } from './Preview';
import { TokenChip } from './TokenChip';

const PAGE = 200;

type Side = { ds: Dataset; analysis: Analysis };

export function CompareView({ base, compare, diff, mode, onMode, onSelect, onAdd, onClear }: {
  base: Side;
  compare: Side;
  diff: DiffResult;
  mode: Mode;
  onMode(m: Mode): void;
  onSelect(id: string): void;
  onAdd(): void;
  onClear(): void;
}) {
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const changes = useMemo(() => filterChanges(diff.changed, base.ds, modeFilter, query), [diff, base.ds, modeFilter, query]);

  if (compare.ds.tokens.size === 0) {
    return (
      <section aria-label="Compare">
        <h2>Compare</h2>
        <div className="empty">
          <p><b>Compare two sets of tokens.</b> Add a second set, such as a CSS export beside Figma variables, or this release beside the last, to see what is missing and what differs. Values are compared after aliases are followed, mode by mode.</p>
          <div className="actions"><button type="button" className="btn primary" onClick={onAdd}>Add tokens to compare against</button></div>
        </div>
      </section>
    );
  }

  const total = diff.onlyA.length + diff.onlyB.length + diff.changed.length;
  const chips = (ids: string[], side: Side, selectable: boolean) => (
    <div className="chips">
      {ids.map((id) => <TokenChip key={id} ds={side.ds} analysis={side.analysis} id={id} mode={mode} {...(selectable ? { onSelect } : {})} />)}
    </div>
  );

  return (
    <section aria-label="Compare">
      <h2>Compare</h2>
      <div className="sum">
        <span className="badge">Base · {base.ds.tokens.size} tokens</span>
        <span className="badge">Compare · {compare.ds.tokens.size} tokens</span>
        <button type="button" className="btn sm" onClick={onAdd}>Add to compare</button>
        <button type="button" className="btn sm" onClick={onClear}>Clear compare</button>
        <div className="seg2 push" role="group" aria-label="Mode">
          {(['light', 'dark'] as Mode[]).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{m === 'light' ? 'Light' : 'Dark'}</button>)}
        </div>
      </div>
      <div className="sum">
        <span className="badge err">{diff.onlyA.length} only in base</span>
        <span className="badge err">{diff.onlyB.length} only in compare</span>
        <span className="badge warn">{diff.changed.length} {diff.changed.length === 1 ? 'value change' : 'value changes'}</span>
      </div>
      {total === 0 && <p className="empty">No differences. Every token is in both sets, and each comes to the same value in each mode.</p>}

      <h3>Only in base</h3>
      {diff.onlyA.length ? chips(diff.onlyA, base, true) : <p className="dim2">None.</p>}
      <h3>Only in compare</h3>
      {diff.onlyB.length ? chips(diff.onlyB, compare, false) : <p className="dim2">None.</p>}

      <h3>Different resolved values</h3>
      {diff.changed.length === 0 ? <p className="dim2">None.</p> : (
        <>
          <div className="tools">
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Filter by name or value" aria-label="Filter changes" />
            {(['all', 'light', 'dark'] as ModeFilter[]).map((m) => (
              <button key={m} type="button" className="pill" aria-pressed={modeFilter === m} onClick={() => { setModeFilter(m); setLimit(PAGE); }}>
                {m === 'all' ? 'Both modes' : m === 'light' ? 'Light only' : 'Dark only'}
              </button>
            ))}
          </div>
          {changes.length === 0 ? <p className="empty">No changes match that filter.</p> : (
            <div className="list">
              {changes.slice(0, limit).map((c) => (
                <button key={`${c.id}|${c.mode}`} type="button" className="row change" onClick={() => onSelect(c.id)}>
                  <span className="pair" aria-hidden="true">
                    <Preview ds={base.ds} id={c.id} mode={c.mode} size="sm" info={base.analysis.info.get(c.id)} />
                    <span className="arrow">→</span>
                    <Preview ds={compare.ds} id={c.id} mode={c.mode} size="sm" info={compare.analysis.info.get(c.id)} />
                  </span>
                  <span className="rmain">
                    <span className="rname">{labelOf(base.ds, c.id)}</span>
                    <span className="rsub">{c.mode}: <span className="old">{c.a}</span> → <span className="new">{c.b}</span></span>
                  </span>
                </button>
              ))}
              {changes.length > limit && (
                <p className="more">
                  <button type="button" className="btn sm" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, changes.length - limit)} more</button>
                  {' '}of {changes.length - limit} not shown
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
