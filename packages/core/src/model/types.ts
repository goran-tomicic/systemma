export type Mode = 'light' | 'dark';

export type Kind =
  | 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier'
  | 'number' | 'typography' | 'shadow' | 'border' | 'transition' | 'strokeStyle' | 'gradient' | 'string';

export type Category = 'color' | 'spacing' | 'radius' | 'border' | 'typography' | 'shadow' | 'motion' | 'other';

// 'component' and 'missing' exist only as graph node kinds, not as token tiers.
export type Tier = 'foundation' | 'common' | 'palette';

export type TokenValue =
  | { ref: string }       // alias to a token id
  | { lit: string }       // literal; may embed var(--x)
  | { comp: unknown };    // composite (object or array); strings inside may be "{a.b}" refs

// A different authored name that produced the same id as a token that was already there, and was not merged.
export interface Collision {
  label: string;
  path: string[];
  source: string;
  mode: Mode;
  collection?: string;
}

export interface Token {
  id: string;
  label: string;
  // The authored name split into segments. The id is derived from it, and several different paths can
  // derive the same id, which is why the path is kept.
  path: string[];
  modes: Partial<Record<Mode, TokenValue>>;
  type: Kind | '';        // '' means infer from the value
  source: string;
  format?: 'dtcg' | 'css' | 'figma';
  declaredType?: boolean;
  collection?: string;
  description?: string;
  scopes?: string[];
  codeSyntax?: Record<string, string>;
  deprecated?: boolean | string;
  caseVariants?: string[];
  collisions?: Collision[];
}

export interface UsageRecord {
  component: string;
  file: string;
  prop: string;
  token: string;
}

export interface Dataset {
  name: string;
  tokens: Map<string, Token>;
  usage: UsageRecord[];
  renames?: Record<string, string>;
}

export interface TokenInfo {
  tier: Tier;
  group: string;
  kind: Kind;
  category: Category;
}
