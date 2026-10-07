import { refsOf } from '@systemma/core';
import type { Analysis, Dataset, Tier } from '@systemma/core';
import { CATEGORY_LABEL } from './tokens';
import { TIER_LABEL } from './tiers';

// Past this many component groups the rest are left off the drawing, and counted.
export const MAX_COMPONENT_NODES = 40;

export type NodeTier = Tier | 'component' | 'missing';

export interface GraphNode {
  key: string;
  // 0 foundation, 1 semantic (common, palette and names nothing defines), 2 components
  col: 0 | 1 | 2;
  label: string;
  tier: NodeTier;
  // The tokens in a token group, the components in a component group, the undefined names in the missing group.
  ids: string[];
  // Where it is drawn; absent when it is left off.
  y?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  // How many distinct references run along it.
  weight: number;
  // A component using a foundation color without going through the semantic layer.
  direct: boolean;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  cols: [GraphNode[], GraphNode[], GraphNode[]];
  // Headings for the tiers within the semantic column.
  subs: { y: number; text: string }[];
  height: number;
  // Component groups that were left off.
  hidden: number;
}

const ROW = 34;
const TOP = 30;

// Groups the tokens by tier and group, connects the groups that refer to one another, and connects the groups
// to the components that use them. A token that refers to another in the same column adds no edge: the map shows
// how tiers feed one another, not how a tier refers to itself.
export function buildGraph(ds: Dataset, analysis: Analysis): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  // The references already counted on each edge, so one reference seen in two modes counts once.
  const counted = new Map<string, Set<string>>();
  const keyOf = (id: string): string | null => {
    const i = analysis.info.get(id);
    return i ? `${i.tier}:${i.group}` : null;
  };
  const node = (key: string, col: 0 | 1 | 2, label: string, tier: NodeTier): GraphNode => {
    let n = nodes.get(key);
    if (!n) {
      n = { key, col, label, tier, ids: [] };
      nodes.set(key, n);
    }
    return n;
  };
  const connect = (from: string, to: string, signature: string, direct: boolean): void => {
    const k = `${from}>${to}`;
    let e = edges.get(k);
    let seen = counted.get(k);
    if (!e || !seen) {
      e = { from, to, weight: 0, direct: false };
      seen = new Set();
      edges.set(k, e);
      counted.set(k, seen);
    }
    if (!seen.has(signature)) {
      seen.add(signature);
      e.weight++;
    }
    if (direct) e.direct = true;
  };

  for (const t of ds.tokens.values()) {
    const i = analysis.info.get(t.id);
    if (!i) continue;
    node(`${i.tier}:${i.group}`, i.tier === 'foundation' ? 0 : 1, i.category !== 'color' ? CATEGORY_LABEL[i.category] : i.group, i.tier).ids.push(t.id);
  }
  for (const t of ds.tokens.values()) {
    for (const value of Object.values(t.modes)) {
      for (const ref of refsOf(value)) {
        const a = keyOf(ref);
        const b = keyOf(t.id);
        const na = a && nodes.get(a);
        const nb = b && nodes.get(b);
        if (!a || !b || !na || !nb || na.col === nb.col) continue;
        connect(a, b, `${t.id}>${ref}`, false);
      }
    }
  }
  for (const u of ds.usage) {
    const group = u.component.split('/')[0] ?? u.component;
    const comp = node(`component:${group}`, 2, group, 'component');
    if (!comp.ids.includes(u.component)) comp.ids.push(u.component);
    let tk = keyOf(u.token);
    if (!tk) {
      tk = 'missing:undefined';
      const missing = node(tk, 1, 'undefined', 'missing');
      if (!missing.ids.includes(u.token)) missing.ids.push(u.token);
    }
    const info = analysis.info.get(u.token);
    connect(tk, `component:${group}`, u.token, nodes.get(tk)?.col === 0 && info?.category === 'color');
  }

  const cols: [GraphNode[], GraphNode[], GraphNode[]] = [[], [], []];
  for (const n of nodes.values()) cols[n.col].push(n);
  const rank: Partial<Record<NodeTier, number>> = { common: 0, palette: 1, missing: 2 };
  cols[1] = cols[1].map((n, i) => [n, i] as const).sort((a, b) => (rank[a[0].tier] ?? 1) - (rank[b[0].tier] ?? 1) || a[1] - b[1]).map((x) => x[0]);
  let hidden = 0;
  if (cols[2].length > MAX_COMPONENT_NODES) {
    hidden = cols[2].length - MAX_COMPONENT_NODES;
    cols[2] = cols[2].slice(0, MAX_COMPONENT_NODES);
  }

  const subs: { y: number; text: string }[] = [];
  let height = TOP;
  cols.forEach((list, ci) => {
    let y = TOP;
    let prev: NodeTier | null = null;
    for (const n of list) {
      if (ci === 1 && n.tier !== prev) {
        if (prev !== null) y += 8;
        subs.push({ y: y + 10, text: n.tier === 'missing' ? 'Undefined' : TIER_LABEL[n.tier as Tier] });
        y += 18;
        prev = n.tier;
      }
      n.y = y;
      y += ROW;
    }
    height = Math.max(height, y);
  });
  return { nodes, edges: [...edges.values()], cols, subs, height: height + 6, hidden };
}

export interface Reach {
  // Groups that feed the selected one, directly or through others.
  upstream: Set<string>;
  // Groups the selected one feeds, directly or through others: what a change to it can reach.
  downstream: Set<string>;
}

export function reach(graph: Graph, key: string): Reach {
  const walk = (next: (e: GraphEdge) => [string, string]): Set<string> => {
    const found = new Set<string>();
    const queue = [key];
    while (queue.length) {
      const here = queue.pop() as string;
      for (const e of graph.edges) {
        const [near, far] = next(e);
        if (near === here && !found.has(far) && far !== key) {
          found.add(far);
          queue.push(far);
        }
      }
    }
    return found;
  };
  return { downstream: walk((e) => [e.from, e.to]), upstream: walk((e) => [e.to, e.from]) };
}

// Whether an edge is on a path through the selected group, so it can be drawn as part of the chain.
export function onChain(e: GraphEdge, key: string, r: Reach): boolean {
  const down = (k: string): boolean => k === key || r.downstream.has(k);
  const up = (k: string): boolean => k === key || r.upstream.has(k);
  return (down(e.from) && r.downstream.has(e.to)) || (up(e.to) && r.upstream.has(e.from));
}
