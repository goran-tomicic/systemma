import type { Analysis } from './types.js';

export interface ImpactedToken {
  id: string;
  // 1 for a token that refers to the changed one directly, 2 for one that refers to that, and so on.
  depth: number;
  // The token one step nearer the changed one that this one refers to.
  via: string;
}

export interface ImpactedComponent {
  component: string;
  file: string;
  // CSS properties it applies the affected tokens to.
  props: string[];
  // The affected tokens it uses, the changed token first when it uses that one itself.
  tokens: string[];
}

export interface Impact {
  id: string;
  tokens: ImpactedToken[];
  components: ImpactedComponent[];
}

// What a change to one token can reach: every token that refers to it through any number of aliases, composites or
// var() references, and every component that uses it or one of those. A cycle is followed once. Order is by depth,
// then id, so the result does not depend on the order tokens were loaded in.
export function impact(analysis: Analysis, id: string): Impact {
  const tokens: ImpactedToken[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let depth = 1; frontier.length; depth++) {
    const next: ImpactedToken[] = [];
    for (const from of frontier) {
      for (const dep of analysis.dependents.get(from) ?? []) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        next.push({ id: dep, depth, via: from });
      }
    }
    next.sort((a, b) => a.id.localeCompare(b.id));
    tokens.push(...next);
    frontier = next.map((t) => t.id);
  }

  const byComponent = new Map<string, ImpactedComponent>();
  for (const token of [id, ...tokens.map((t) => t.id)]) {
    for (const u of analysis.usageBy.get(token) ?? []) {
      const entry = byComponent.get(u.component) ?? { component: u.component, file: u.file, props: [], tokens: [] };
      if (u.prop && !entry.props.includes(u.prop)) entry.props.push(u.prop);
      if (!entry.tokens.includes(token)) entry.tokens.push(token);
      byComponent.set(u.component, entry);
    }
  }
  const components = [...byComponent.values()].sort((a, b) => a.component.localeCompare(b.component));
  return { id, tokens, components };
}
