import type { Dataset, Mode } from '../model/types.js';
import { parseTokensJson } from './dtcg.js';

// DTCG Resolver Module 2025.10 (https://www.designtokens.org/TR/2025.10/resolver/). A resolver document orders sets
// of tokens and modifiers whose contexts swap tokens in and out; later entries win. Our data model has two modes,
// so the modifier whose contexts are light and dark becomes those modes, and any other modifier is read with its
// default context.

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);

// Reads a file a resolver points at. `ref` is as written in the resolver, relative to it. `path` is how the file is
// named in reports and as a token's source. It rejects when the file cannot be read or is not JSON.
export type ReadRef = (ref: string) => Promise<{ json: unknown; path: string }>;

export type ResolverResult =
  | { ok: true; count: number; warnings: string[]; files: string[] }
  | { ok: false; errors: string[] };

export interface ResolverOptions {
  // The resolver's own path, for its inline tokens and for messages.
  path: string;
}

type Source = { kind: 'file'; ref: string } | { kind: 'inline'; tokens: unknown };
interface Layer { name: string; type: 'set' | 'modifier'; sources?: Source[]; contexts?: Record<string, Source[]>; default?: string }

const POINTER = (p: string): string[] => p.replace(/^\//, '').split('/').filter((s) => s !== '').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

export const isResolver = (json: unknown): boolean => isRec(json) && Array.isArray(json['resolutionOrder']);

// Loads the document for the light and dark modes. The theme modifier is the first one in the resolution order whose
// contexts include light and dark (any case).
export async function loadResolver(ds: Dataset, json: unknown, read: ReadRef, opts: ResolverOptions): Promise<ResolverResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string): void => { errors.push(`${opts.path}: ${m}`); };
  if (!isRec(json)) return { ok: false, errors: [`${opts.path}: expected a JSON object at the top level.`] };
  if (json['version'] !== '2025.10') err(`version must be "2025.10" (found ${JSON.stringify(json['version'] ?? null)}).`);

  const docs = new Map<string, { json: unknown; path: string } | null>();
  const fetch = async (file: string): Promise<{ json: unknown; path: string } | null> => {
    if (docs.has(file)) return docs.get(file) ?? null;
    let doc: { json: unknown; path: string } | null = null;
    try {
      doc = await read(file);
    } catch (e) {
      err(`cannot read ${file} (${e instanceof Error ? e.message : String(e)}).`);
    }
    docs.set(file, doc);
    return doc;
  };

  // Follows a reference object. Same-document pointers start with #; a file may carry a pointer after a #.
  const deref = async (ref: string, seen: ReadonlySet<string> = new Set()): Promise<{ value: unknown; path: string } | null> => {
    if (seen.has(ref)) { err(`reference ${ref} is circular.`); return null; }
    const hash = ref.indexOf('#');
    const file = hash < 0 ? ref : ref.slice(0, hash);
    const pointer = hash < 0 ? '' : ref.slice(hash + 1);
    const doc = file ? await fetch(file) : { json, path: opts.path };
    if (!doc) return null;
    let value: unknown = doc.json;
    for (const key of POINTER(pointer)) {
      value = isRec(value) || Array.isArray(value) ? (value as Rec)[key] : undefined;
    }
    if (value === undefined) { err(`reference ${ref} points at nothing.`); return null; }
    if (isRec(value) && typeof value['$ref'] === 'string' && Object.keys(value).length === 1) return deref(value['$ref'], new Set([...seen, ref]));
    return { value, path: doc.path };
  };

  const sources = (value: unknown, where: string): Source[] => {
    if (!Array.isArray(value)) { err(`${where}: expected an array of sources.`); return []; }
    const out: Source[] = [];
    for (const s of value) {
      if (isRec(s) && typeof s['$ref'] === 'string') out.push({ kind: 'file', ref: s['$ref'] });
      else if (isRec(s)) out.push({ kind: 'inline', tokens: s });
      else err(`${where}: a source must be a reference object or a group of tokens.`);
    }
    return out;
  };

  const layer = (value: Rec, name: string, type: 'set' | 'modifier'): Layer => {
    if (type === 'set') return { name, type, sources: sources(value['sources'], `set ${name}`) };
    const contexts: Record<string, Source[]> = {};
    if (!isRec(value['contexts'])) err(`modifier ${name}: needs a contexts object.`);
    else for (const [k, v] of Object.entries(value['contexts'])) contexts[k] = sources(v, `modifier ${name}, context ${k}`);
    const def = value['default'];
    if (def !== undefined && (typeof def !== 'string' || !Object.hasOwn(contexts, def))) err(`modifier ${name}: default must name one of its contexts.`);
    return { name, type, contexts, ...(typeof def === 'string' ? { default: def } : {}) };
  };

  const order: Layer[] = [];
  const names = new Set<string>();
  if (!Array.isArray(json['resolutionOrder']) || json['resolutionOrder'].length === 0) err('resolutionOrder must be a non-empty array.');
  else {
    for (const [i, item] of json['resolutionOrder'].entries()) {
      let value: unknown = item;
      let name = isRec(item) && typeof item['name'] === 'string' ? item['name'] : '';
      let type = isRec(item) ? item['type'] : undefined;
      if (isRec(item) && typeof item['$ref'] === 'string') {
        const target = await deref(item['$ref']);
        if (!target) continue;
        value = target.value;
        const m = item['$ref'].match(/(?:^|\/)(sets|modifiers)\/([^/]+)$/);
        name = m?.[2]?.replace(/~1/g, '/').replace(/~0/g, '~') ?? name;
        type = m?.[1] === 'sets' ? 'set' : m?.[1] === 'modifiers' ? 'modifier' : type;
      }
      if (!isRec(value) || (type !== 'set' && type !== 'modifier') || !name) {
        err(`resolutionOrder[${i}]: expected a reference to #/sets/… or #/modifiers/…, or an inline set or modifier with a name and a type.`);
        continue;
      }
      if (names.has(name)) { err(`resolutionOrder: the name ${name} appears twice.`); continue; }
      names.add(name);
      order.push(layer(value, name, type));
    }
  }

  // Everything is fetched before anything is parsed, so a missing file is reported with the others.
  const files: string[] = [];
  const parts = new Map<Source, { json: unknown; path: string }>();
  const all = order.flatMap((l) => [...(l.sources ?? []), ...Object.values(l.contexts ?? {}).flat()]);
  for (const s of all) {
    if (s.kind === 'inline') parts.set(s, { json: s.tokens, path: opts.path });
    else {
      const t = await deref(s.ref);
      if (t) {
        parts.set(s, { json: t.value, path: t.path });
        if (!files.includes(t.path)) files.push(t.path);
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  const theme = order.find((l) => {
    const keys = Object.keys(l.contexts ?? {}).map((k) => k.toLowerCase());
    return keys.includes('light') && keys.includes('dark');
  });
  const modes: Mode[] = theme ? ['light', 'dark'] : ['light'];
  if (!theme) warnings.push(`${opts.path}: no modifier has both a light and a dark context, so the tokens are read as one mode (light).`);

  const before = ds.tokens.size;
  const seen = new Set<string>();
  for (const l of order) {
    if (l.type !== 'modifier' || l === theme) continue;
    const names = Object.keys(l.contexts ?? {});
    if (l.default === undefined) warnings.push(`${opts.path}: modifier ${l.name} has no default, so none of its contexts (${names.join(', ')}) were read.`);
    else if (names.length > 1) warnings.push(`${opts.path}: modifier ${l.name} was read with its default context ${l.default}; ${names.filter((n) => n !== l.default).join(', ')} not read.`);
  }
  for (const mode of modes) {
    for (const l of order) {
      let chosen: Source[] | undefined;
      if (l.type === 'set') chosen = l.sources;
      else if (l === theme) chosen = Object.entries(l.contexts ?? {}).find(([k]) => k.toLowerCase() === mode)?.[1];
      else chosen = l.default !== undefined ? l.contexts?.[l.default] : undefined;
      for (const s of chosen ?? []) {
        const part = parts.get(s);
        if (!part) continue;
        for (const w of parseTokensJson(ds, part.json, { mode, source: part.path }).warnings) {
          const text = `${part.path}: ${w}`;
          if (!seen.has(text)) { seen.add(text); warnings.push(text); }
        }
      }
    }
  }
  return { ok: true, count: ds.tokens.size - before, warnings, files };
}
