import { useCallback, useMemo, useReducer, useState } from 'react';
import { RULESETS, analyze, diff } from '@systemma/core';
import type { Mode, RulesetId } from '@systemma/core';
import { Audit } from './components/Audit';
import { CompareView } from './components/CompareView';
import { Detail } from './components/Detail';
import { Header } from './components/Header';
import { Importer } from './components/Importer';
import { MapView } from './components/MapView';
import type { NewSource } from './components/Importer';
import { Settings } from './components/Settings';
import type { ProfileChoice } from './components/Settings';
import { SourceList } from './components/SourceList';
import { Tabs } from './components/Tabs';
import { TokensView } from './components/TokensView';
import { EXAMPLE_COMPARE_SOURCES, EXAMPLE_SOURCES } from './lib/example';
import { countBySeverity } from './lib/findings';
import { loadSources } from './lib/sources';
import type { SourceEntry, SourceSet } from './lib/sources';

export interface State {
  entries: SourceEntry[];
  nextId: number;
  stripSets: boolean;
  profile: ProfileChoice;
  // Null means the rulesets that are on by default.
  enabled: ReadonlySet<RulesetId> | null;
}

export type Action =
  | { type: 'add'; items: NewSource[]; target?: SourceSet }
  | { type: 'remove'; id: number }
  | { type: 'mode'; id: number; mode: Mode | undefined }
  | { type: 'clear' }
  | { type: 'clearCompare' }
  | { type: 'stripSets'; on: boolean }
  | { type: 'profile'; profile: ProfileChoice }
  | { type: 'ruleset'; id: RulesetId; on: boolean };

export const initialState: State = { entries: [], nextId: 1, stripSets: false, profile: 'auto', enabled: null };

// A copy of the entry with its mode set, or removed to go back to deciding from the name.
function withMode(entry: SourceEntry, mode: Mode | undefined): SourceEntry {
  const copy = { ...entry };
  if (mode) copy.mode = mode;
  else delete copy.mode;
  return copy;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add': {
      const entries = action.items.map((item, i): SourceEntry => ({ id: state.nextId + i, set: action.target ?? 'base', ...item }));
      return { ...state, entries: [...state.entries, ...entries], nextId: state.nextId + entries.length };
    }
    case 'remove':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case 'mode':
      return { ...state, entries: state.entries.map((e) => (e.id === action.id ? withMode(e, action.mode) : e)) };
    case 'clear':
      return { ...state, entries: [] };
    case 'clearCompare':
      return { ...state, entries: state.entries.filter((e) => e.set !== 'compare') };
    case 'stripSets':
      return { ...state, stripSets: action.on };
    case 'profile':
      return { ...state, profile: action.profile };
    case 'ruleset': {
      const next = new Set<RulesetId>(state.enabled ?? RULESETS.filter((s) => s.defaultOn).map((s) => s.id));
      if (action.on) next.add(action.id);
      else next.delete(action.id);
      return { ...state, enabled: next };
    }
  }
}

type TabId = 'map' | 'tokens' | 'audit' | 'compare';

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [tab, setTab] = useState<TabId>('audit');
  const [mode, setMode] = useState<Mode>('light');
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<SourceSet>('base');
  // Open when there is nothing yet, and then whenever the person opens or closes it.
  const [importerOpen, setImporterOpen] = useState<boolean | null>(null);

  const baseEntries = useMemo(() => state.entries.filter((e) => e.set === 'base'), [state.entries]);
  const compareEntries = useMemo(() => state.entries.filter((e) => e.set === 'compare'), [state.entries]);
  const loaded = useMemo(() => loadSources(baseEntries, { stripSets: state.stripSets }), [baseEntries, state.stripSets]);
  const loadedCompare = useMemo(() => loadSources(compareEntries, { stripSets: state.stripSets, name: 'Compare' }), [compareEntries, state.stripSets]);
  const analysis = useMemo(
    () => analyze(loaded.ds, { profile: state.profile, ...(state.enabled ? { enabledRulesets: state.enabled } : {}) }),
    [loaded, state.profile, state.enabled],
  );
  const analysisCompare = useMemo(() => analyze(loadedCompare.ds, { profile: state.profile }), [loadedCompare, state.profile]);
  const differences = useMemo(() => diff(loaded.ds, loadedCompare.ds), [loaded, loadedCompare]);

  const add = useCallback((items: NewSource[], to: SourceSet = target) => {
    dispatch({ type: 'add', items, target: to });
    if (to === 'compare') setTab('compare');
  }, [target]);
  const hasTokens = loaded.ds.tokens.size > 0;
  const hasCompare = loadedCompare.ds.tokens.size > 0;
  const totals = useMemo(() => countBySeverity(analysis.findings), [analysis]);
  const changes = differences.onlyA.length + differences.onlyB.length + differences.changed.length;
  // A selection that no longer exists in the data (its source was removed) is no selection.
  const open = selected !== null && (loaded.ds.tokens.has(selected) || analysis.dependents.has(selected)) ? selected : null;
  const importerIsOpen = importerOpen ?? state.entries.length === 0;
  const addToCompare = (): void => { setTarget('compare'); setImporterOpen(true); };

  return (
    <div className="wrap">
      <Header analysis={analysis} files={loaded.sources.length} onClear={() => { setSelected(null); dispatch({ type: 'clear' }); }} />
      <Importer
        onAdd={(items) => add(items)}
        onExample={() => add(EXAMPLE_SOURCES, 'base')}
        onExampleCompare={() => { dispatch({ type: 'add', items: EXAMPLE_SOURCES, target: 'base' }); add(EXAMPLE_COMPARE_SOURCES, 'compare'); }}
        target={target}
        onTarget={setTarget}
        open={importerIsOpen}
        onOpen={setImporterOpen}
      />
      <SourceList sources={loaded.sources} onRemove={(id) => dispatch({ type: 'remove', id })} onMode={(id, m) => dispatch({ type: 'mode', id, mode: m })} />
      <SourceList title="Compare sources" sources={loadedCompare.sources} onRemove={(id) => dispatch({ type: 'remove', id })} onMode={(id, m) => dispatch({ type: 'mode', id, mode: m })} />
      {state.entries.length > 0 && (
        <Settings profile={state.profile} stripSets={state.stripSets} onProfile={(profile) => dispatch({ type: 'profile', profile })} onStripSets={(on) => dispatch({ type: 'stripSets', on })} />
      )}
      {hasTokens && (
        <>
          <Tabs<TabId>
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'map', label: 'Map' },
              { id: 'tokens', label: 'Tokens', badge: loaded.ds.tokens.size },
              { id: 'audit', label: 'Audit', badge: totals.error || analysis.findings.length, alert: totals.error > 0 },
              { id: 'compare', label: 'Compare', ...(hasCompare ? { badge: changes } : {}) },
            ]}
          />
          <div className="layout">
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="main">
              {tab === 'map' && <MapView ds={loaded.ds} analysis={analysis} mode={mode} onMode={setMode} onSelect={setSelected} />}
              {tab === 'tokens' && <TokensView ds={loaded.ds} analysis={analysis} mode={mode} onMode={setMode} selected={open} onSelect={setSelected} />}
              {tab === 'audit' && <Audit analysis={analysis} ds={loaded.ds} enabled={state.enabled} onToggleRuleset={(id, on) => dispatch({ type: 'ruleset', id, on })} onSelect={setSelected} />}
              {tab === 'compare' && (
                <CompareView
                  base={{ ds: loaded.ds, analysis }}
                  compare={{ ds: loadedCompare.ds, analysis: analysisCompare }}
                  diff={differences}
                  mode={mode}
                  onMode={setMode}
                  onSelect={setSelected}
                  onAdd={addToCompare}
                  onClear={() => dispatch({ type: 'clearCompare' })}
                />
              )}
            </div>
            <aside id="detail" className={open ? 'open' : undefined} aria-label="Token details">
              {open ? <Detail ds={loaded.ds} analysis={analysis} mode={mode} id={open} onSelect={setSelected} onClose={() => setSelected(null)} />
                : <p className="hint">Select a token to see where it comes from and where it goes.</p>}
            </aside>
          </div>
        </>
      )}
      {!hasTokens && state.entries.length > 0 && <p className="empty">None of these sources contained tokens.</p>}
    </div>
  );
}
