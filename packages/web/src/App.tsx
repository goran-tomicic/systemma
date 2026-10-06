import { useCallback, useMemo, useReducer } from 'react';
import { RULESETS, analyze } from '@systemma/core';
import type { Mode, RulesetId } from '@systemma/core';
import { Audit } from './components/Audit';
import { Header } from './components/Header';
import { Importer } from './components/Importer';
import type { NewSource } from './components/Importer';
import { Settings } from './components/Settings';
import type { ProfileChoice } from './components/Settings';
import { SourceList } from './components/SourceList';
import { EXAMPLE_SOURCES } from './lib/example';
import { loadSources } from './lib/sources';
import type { SourceEntry } from './lib/sources';

export interface State {
  entries: SourceEntry[];
  nextId: number;
  stripSets: boolean;
  profile: ProfileChoice;
  // Null means the rulesets that are on by default.
  enabled: ReadonlySet<RulesetId> | null;
}

export type Action =
  | { type: 'add'; items: NewSource[] }
  | { type: 'remove'; id: number }
  | { type: 'mode'; id: number; mode: Mode | undefined }
  | { type: 'clear' }
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
      const entries = action.items.map((item, i): SourceEntry => ({ id: state.nextId + i, ...item }));
      return { ...state, entries: [...state.entries, ...entries], nextId: state.nextId + entries.length };
    }
    case 'remove':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case 'mode':
      return { ...state, entries: state.entries.map((e) => (e.id === action.id ? withMode(e, action.mode) : e)) };
    case 'clear':
      return { ...state, entries: [] };
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

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const loaded = useMemo(() => loadSources(state.entries, { stripSets: state.stripSets }), [state.entries, state.stripSets]);
  const analysis = useMemo(
    () => analyze(loaded.ds, { profile: state.profile, ...(state.enabled ? { enabledRulesets: state.enabled } : {}) }),
    [loaded, state.profile, state.enabled],
  );

  const add = useCallback((items: NewSource[]) => dispatch({ type: 'add', items }), []);
  const hasTokens = loaded.ds.tokens.size > 0;

  return (
    <div className="wrap">
      <Header analysis={analysis} files={loaded.sources.length} onClear={() => dispatch({ type: 'clear' })} />
      <Importer onAdd={add} onExample={() => add(EXAMPLE_SOURCES)} hasSources={state.entries.length > 0} />
      <SourceList sources={loaded.sources} onRemove={(id) => dispatch({ type: 'remove', id })} onMode={(id, mode) => dispatch({ type: 'mode', id, mode })} />
      {state.entries.length > 0 && (
        <Settings profile={state.profile} stripSets={state.stripSets} onProfile={(profile) => dispatch({ type: 'profile', profile })} onStripSets={(on) => dispatch({ type: 'stripSets', on })} />
      )}
      {hasTokens && <Audit analysis={analysis} ds={loaded.ds} enabled={state.enabled} onToggleRuleset={(id, on) => dispatch({ type: 'ruleset', id, on })} />}
      {!hasTokens && state.entries.length > 0 && <p className="empty">None of these sources contained tokens.</p>}
    </div>
  );
}
