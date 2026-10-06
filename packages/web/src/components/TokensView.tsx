import { useMemo, useState } from 'react';
import type { Analysis, Category, Dataset, Mode, Tier } from '@systemma/core';
import { displayValue } from '../lib/values';
import { CATEGORY_LABEL, CATEGORY_ORDER, buildRows, filterRows, shortLabel } from '../lib/tokens';
import type { TokenRow } from '../lib/tokens';
import { TIERS, TIER_LABEL } from '../lib/tiers';
import { Preview } from './Preview';

const PAGE = 200;

function Row({ row, ds, mode, selected, onSelect }: { row: TokenRow; ds: Dataset; mode: Mode; selected: boolean; onSelect(id: string): void }) {
  const { token, info, counts } = row;
  const shown = displayValue(ds, token.id, mode, info.kind);
  return (
    <button type="button" className={`row${selected ? ' sel' : ''}`} aria-pressed={selected} onClick={() => onSelect(token.id)}>
      <Preview ds={ds} id={token.id} mode={mode} size="md" info={info} />
      <span className="rmain">
        <span className="rname">{shortLabel(token)}</span>
        <span className="rsub">
          <span className={`tt t-${info.tier}`}>{TIER_LABEL[info.tier]}</span> · {info.group} · {info.kind}
        </span>
      </span>
      <span className={`rval${shown.kind === 'missing' ? ' dim' : ''}`}>{shown.text}</span>
      {counts.error > 0 && <span className="badge err" title="errors">{counts.error}</span>}
      {counts.warn > 0 && <span className="badge warn" title="warnings">{counts.warn}</span>}
    </button>
  );
}

export function TokensView({ ds, analysis, mode, onMode, selected, onSelect }: {
  ds: Dataset;
  analysis: Analysis;
  mode: Mode;
  onMode(m: Mode): void;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => buildRows(ds, analysis), [ds, analysis]);
  const shown = useMemo(() => filterRows(rows, { tier, category, query }), [rows, tier, category, query]);
  const present = useMemo(() => new Set(rows.map((r) => r.info.category)), [rows]);
  // Back to the first page whenever the list changes shape.
  const reset = <T,>(set: (v: T) => void) => (v: T): void => { set(v); setLimit(PAGE); };

  return (
    <section aria-label="Tokens">
      <h2>Tokens</h2>
      <div className="tools">
        <input type="search" value={query} onChange={(e) => reset(setQuery)(e.target.value)} placeholder="Filter by name or description" aria-label="Filter tokens" />
        <div className="seg2" role="group" aria-label="Mode">
          {(['light', 'dark'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{m === 'light' ? 'Light' : 'Dark'}</button>
          ))}
        </div>
      </div>
      <div className="tools" role="group" aria-label="Tier">
        <button type="button" className="pill" aria-pressed={tier === 'all'} onClick={() => reset(setTier)('all')}>All tiers</button>
        {TIERS.map((t) => <button key={t} type="button" className="pill" aria-pressed={tier === t} onClick={() => reset(setTier)(t)}>{TIER_LABEL[t]}</button>)}
      </div>
      <div className="tools" role="group" aria-label="Category">
        <button type="button" className="pill" aria-pressed={category === 'all'} onClick={() => reset(setCategory)('all')}>All kinds</button>
        {CATEGORY_ORDER.filter((c) => present.has(c)).map((c) => (
          <button key={c} type="button" className="pill" aria-pressed={category === c} onClick={() => reset(setCategory)(c)}>{CATEGORY_LABEL[c]}</button>
        ))}
      </div>
      <p className="hint">{shown.length === rows.length ? `${rows.length} tokens` : `${shown.length} of ${rows.length} tokens`}</p>
      {shown.length === 0 ? <p className="empty">No tokens match that filter.</p> : (
        <div className="list">
          {shown.slice(0, limit).map((r) => <Row key={r.token.id} row={r} ds={ds} mode={mode} selected={selected === r.token.id} onSelect={onSelect} />)}
          {shown.length > limit && (
            <p className="more">
              <button type="button" className="btn sm" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</button>
              {' '}of {shown.length - limit} not shown
            </p>
          )}
        </div>
      )}
    </section>
  );
}
