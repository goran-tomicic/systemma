import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { resolve, toRgba } from '@systemma/core';
import type { Analysis, Dataset, Mode } from '@systemma/core';
import { MAX_COMPONENT_NODES, buildGraph, onChain, reach } from '../lib/graph';
import type { Graph, GraphNode } from '../lib/graph';
import { TIER_LABEL } from '../lib/tiers';
import { TokenChip } from './TokenChip';

const WIDTH = 860;
const NODE_W = 190;
const COLUMN_X = [0, 335, 670] as const;
const COLUMN_TITLE = ['Foundation', 'Semantic', 'Components'] as const;
const CHIPS = 60;

// A color to paint on a color group: a middle token of a foundation group, the first of any other.
function swatchColor(ds: Dataset, analysis: Analysis, n: GraphNode, mode: Mode): string | null {
  if (n.tier === 'component' || n.tier === 'missing') return null;
  const id = n.ids[n.tier === 'foundation' ? Math.floor(n.ids.length / 2) : 0];
  if (!id || analysis.info.get(id)?.category !== 'color') return null;
  const r = resolve(ds, id, mode);
  return 'value' in r && toRgba(r.value) ? r.value : null;
}

const unit = (n: GraphNode): string => (n.tier === 'component' ? 'components' : 'tokens');
const describeNode = (n: GraphNode): string => `${n.label}, ${n.ids.length} ${unit(n)}`;

function GroupPanel({ graph, nodeKey, ds, analysis, mode, onSelect }: {
  graph: Graph; nodeKey: string | null; ds: Dataset; analysis: Analysis; mode: Mode; onSelect(id: string): void;
}) {
  const [shown, setShown] = useState(CHIPS);
  const n = nodeKey ? graph.nodes.get(nodeKey) : undefined;
  if (!n || !nodeKey) return <p className="hint">Select a group to see its tokens and where they connect.</p>;
  const chip = (id: string, extra?: string) => <TokenChip key={`${id}|${extra ?? ''}`} ds={ds} analysis={analysis} id={id} mode={mode} onSelect={onSelect} {...(extra ? { extra } : {})} />;

  if (n.tier === 'component') {
    return (
      <div className="gpanel">
        <h2>{n.label} <span className="dim2">· {n.ids.length} {n.ids.length === 1 ? 'component' : 'components'}</span></h2>
        {n.ids.map((c) => (
          <div className="comp" key={c}>
            <div>{c}</div>
            <div className="chips">{ds.usage.filter((u) => u.component === c).map((u) => chip(u.token, u.prop || undefined))}</div>
          </div>
        ))}
      </div>
    );
  }
  const fedBy = graph.edges.filter((e) => e.to === n.key).map((e) => graph.nodes.get(e.from)?.label ?? e.from);
  const feeds = graph.edges.filter((e) => e.from === n.key).map((e) => graph.nodes.get(e.to)?.label ?? e.to);
  const downstream = [...reach(graph, nodeKey).downstream].map((k) => graph.nodes.get(k)?.label ?? k);
  const further = downstream.filter((l) => !feeds.includes(l));
  const title = n.tier === 'missing' ? 'names nothing defines' : TIER_LABEL[n.tier].toLowerCase();
  return (
    <div className="gpanel">
      <h2>{n.label} <span className="dim2">· {title} · {n.ids.length}</span></h2>
      {(fedBy.length > 0 || feeds.length > 0) && (
        <p className="dim2">
          {fedBy.length > 0 && <>Fed by {fedBy.join(', ')}. </>}
          {feeds.length > 0 && <>Feeds {feeds.join(', ')}.</>}
        </p>
      )}
      {further.length > 0 && <p className="dim2">A change here can also reach {further.join(', ')}.</p>}
      <div className="chips">{n.ids.slice(0, shown).map((id) => chip(id))}</div>
      {n.ids.length > shown && (
        <p className="more">
          <button type="button" className="btn sm" onClick={() => setShown(shown + CHIPS)}>Show {Math.min(CHIPS, n.ids.length - shown)} more</button>
          {' '}of {n.ids.length - shown} not shown
        </p>
      )}
    </div>
  );
}

export function MapView({ ds, analysis, mode, onMode, onSelect }: {
  ds: Dataset; analysis: Analysis; mode: Mode; onMode(m: Mode): void; onSelect(id: string): void;
}) {
  const graph = useMemo(() => buildGraph(ds, analysis), [ds, analysis]);
  const [picked, setPicked] = useState<string | null>(null);
  // A group that is gone (its tokens were removed) is no selection.
  const key = picked && graph.nodes.get(picked)?.y !== undefined ? picked : null;
  const chain = useMemo(() => (key ? reach(graph, key) : null), [graph, key]);
  const connected = useMemo(() => new Set(key && chain ? [key, ...chain.upstream, ...chain.downstream] : []), [key, chain]);
  const toggle = (k: string): void => setPicked(key === k ? null : k);
  const press = (k: string) => (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(k);
    }
  };
  const label = (k: string): string => graph.nodes.get(k)?.label ?? k;

  return (
    <section aria-label="Map">
      <h2>Map</h2>
      <div className="tools">
        <p className="hint grow">How tokens feed one another: foundation values, the semantic tokens built on them, and the components that use those.</p>
        <div className="seg2" role="group" aria-label="Mode">
          {(['light', 'dark'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{m === 'light' ? 'Light' : 'Dark'}</button>
          ))}
        </div>
      </div>
      <div className="mapscroll">
        <svg viewBox={`0 0 ${WIDTH} ${graph.height}`} role="group" aria-label="Token groups and how they connect: foundation, semantic, components">
          {COLUMN_TITLE.map((t, i) => <text key={t} className="colh" x={COLUMN_X[i]} y={14}>{t}</text>)}
          {graph.subs.map((s) => <text key={s.text} className="sub" x={COLUMN_X[1]} y={s.y}>{s.text}</text>)}
          {graph.edges.map((e) => {
            const a = graph.nodes.get(e.from);
            const b = graph.nodes.get(e.to);
            if (a?.y === undefined || b?.y === undefined) return null;
            const x1 = COLUMN_X[a.col] + NODE_W;
            const x2 = COLUMN_X[b.col];
            const y1 = a.y + 14;
            const y2 = b.y + 14;
            const mid = (x1 + x2) / 2;
            const hot = key && chain ? onChain(e, key, chain) : false;
            const cls = `edge${e.direct ? ' direct' : ''}${hot ? ' hot' : key ? ' dim' : ''}`;
            return <path key={`${e.from}>${e.to}`} className={cls} d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`} strokeWidth={(1 + Math.min(e.weight, 14) * 0.3).toFixed(2)} />;
          })}
          {[...graph.nodes.values()].map((n) => {
            if (n.y === undefined) return null;
            const x = COLUMN_X[n.col];
            const color = swatchColor(ds, analysis, n, mode);
            const cls = `node t-${n.tier}${key === n.key ? ' sel' : key && !connected.has(n.key) ? ' dim' : ''}`;
            return (
              <g key={n.key} className={cls} role="button" tabIndex={0} aria-label={describeNode(n)} aria-pressed={key === n.key} onClick={() => toggle(n.key)} onKeyDown={press(n.key)}>
                <rect className="body" x={x} y={n.y} width={NODE_W} height={28} rx={5} />
                <rect className="rail" x={x} y={n.y} width={4} height={28} rx={2} />
                {color && <circle cx={x + 21} cy={n.y + 14} r={6} style={{ fill: color, stroke: 'rgba(127,127,127,.5)' }} />}
                <text x={x + (color ? 34 : 16)} y={n.y + 18}>{n.label.slice(0, 20)}</text>
                <text className="cnt" x={x + NODE_W - 10} y={n.y + 18} textAnchor="end">{n.ids.length}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {graph.cols[2].length === 0 && <p className="hint">No usage data loaded. Add usage JSON, or scan code, to see which components use which tokens.</p>}
      {graph.edges.some((e) => e.direct) && <p className="hint">Dashed amber lines: components using foundation colors directly, without going through a semantic token.</p>}
      {graph.hidden > 0 && <p className="hint">{graph.hidden} more component groups are not drawn (the map shows {MAX_COMPONENT_NODES}).</p>}
      <GroupPanel key={key ?? 'none'} graph={graph} nodeKey={key} ds={ds} analysis={analysis} mode={mode} onSelect={onSelect} />
      <details className="connections">
        <summary>Connections as a list <span className="badge">{graph.edges.length}</span></summary>
        {graph.edges.length === 0 ? <p className="hint">Nothing here refers to anything in another tier.</p> : (
          <ul>
            {graph.edges.map((e) => (
              <li key={`${e.from}>${e.to}`}>
                {label(e.from)} → {label(e.to)} <span className="dim2">· {e.weight} {e.weight === 1 ? 'link' : 'links'}{e.direct ? ' · used directly' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
