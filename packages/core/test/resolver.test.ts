import { describe, expect, it } from 'vitest';
import { analyze, createDataset, detectFormat, isResolver, loadResolver, parseSource, resolve } from '../src/index.js';
import type { ReadRef } from '../src/index.js';

const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });
const FILES: Record<string, unknown> = {
  'tokens/base.json': { color: { white: color('#ffffff'), black: color('#111111'), blue: color('#2563eb') } },
  'tokens/light.json': { color: { surface: color('{color.white}'), fg: color('{color.black}') } },
  'tokens/dark.json': { color: { surface: color('{color.black}'), fg: color('{color.white}') } },
  'tokens/hc.json': { color: { fg: color('#000000') } },
  'tokens/density.json': { space: { $type: 'dimension', gap: { $value: '8px' } } },
  'tokens/compact.json': { space: { $type: 'dimension', gap: { $value: '4px' } } },
  'tokens/two.json': { sets: { Inner: { sources: [{ color: { x: color('#abcdef') } }] } } },
};
const read: ReadRef = async (ref) => {
  const [file] = ref.split('#');
  if (!file || !(file in FILES)) throw new Error('no such file');
  return { json: FILES[file], path: file };
};
const ref = (r: string) => ({ $ref: r });

const BASIC = {
  version: '2025.10',
  sets: { foundation: { sources: [ref('tokens/base.json')] } },
  modifiers: { theme: { contexts: { light: [ref('tokens/light.json')], dark: [ref('tokens/dark.json')] }, default: 'light' } },
  resolutionOrder: [ref('#/sets/foundation'), ref('#/modifiers/theme')],
};

async function load(doc: unknown, readRef: ReadRef = read) {
  const ds = createDataset('r');
  const result = await loadResolver(ds, doc, readRef, { path: 'tokens.resolver.json' });
  return { ds, result };
}
const val = (ds: ReturnType<typeof createDataset>, id: string, mode: 'light' | 'dark') => {
  const r = resolve(ds, id, mode);
  return 'value' in r ? r.value : r;
};

describe('a theme modifier becomes the two modes', () => {
  it('reads the foundation in both modes and the theme per mode', async () => {
    const { ds, result } = await load(BASIC);
    expect(result).toMatchObject({ ok: true, warnings: [], files: ['tokens/base.json', 'tokens/light.json', 'tokens/dark.json'] });
    expect(result.ok && result.count).toBe(5);
    expect(val(ds, 'color-surface', 'light')).toBe('#ffffff');
    expect(val(ds, 'color-surface', 'dark')).toBe('#111111');
    expect(val(ds, 'color-fg', 'dark')).toBe('#ffffff');
    expect(val(ds, 'color-blue', 'dark')).toBe('#2563eb');
  });
  it('records the file that first defined each token as its source', async () => {
    const { ds } = await load(BASIC);
    expect(ds.tokens.get('color-white')?.source).toBe('tokens/base.json');
    // Light is read first, and a token keeps the source it was created with.
    expect(ds.tokens.get('color-surface')?.source).toBe('tokens/light.json');
  });
  it('matches light and dark in any case', async () => {
    const doc = { ...BASIC, modifiers: { theme: { contexts: { Light: [ref('tokens/light.json')], DARK: [ref('tokens/dark.json')] } } } };
    const { ds, result } = await load(doc);
    expect(result.ok).toBe(true);
    expect(val(ds, 'color-surface', 'dark')).toBe('#111111');
  });
  it('is not confused by contexts that need two files, because only light and dark are read', async () => {
    const doc = { ...BASIC, modifiers: { theme: { contexts: { light: [ref('tokens/light.json')], dark: [ref('tokens/dark.json')], lightHighContrast: [ref('tokens/light.json'), ref('tokens/hc.json')] } } } };
    const { ds } = await load(doc);
    expect(val(ds, 'color-fg', 'light')).toBe('#111111');
  });
  it('gives the result a mode gap rule can judge: both modes exist for every token', async () => {
    const { ds } = await load(BASIC);
    const a = analyze(ds, { profile: 'generic' });
    expect(a.findings.filter((f) => f.rule === 'mode-gap')).toEqual([]);
  });
});

describe('order and overriding', () => {
  it('lets a later entry win a conflict', async () => {
    const doc = { ...BASIC, resolutionOrder: [ref('#/modifiers/theme'), ref('#/sets/foundation')], sets: { foundation: { sources: [{ color: { surface: color('#abcdef') } }] } } };
    const { ds } = await load(doc);
    expect(val(ds, 'color-surface', 'light')).toBe('#abcdef');
    expect(val(ds, 'color-surface', 'dark')).toBe('#abcdef');
  });
  it('keeps source order inside a set', async () => {
    const doc = { version: '2025.10', resolutionOrder: [{ type: 'set', name: 's', sources: [{ a: color('#111111') }, { a: color('#222222') }] }] };
    expect(val((await load(doc)).ds, 'a', 'light')).toBe('#222222');
  });
  it('takes inline sets and modifiers in the resolution order', async () => {
    const doc = {
      version: '2025.10',
      resolutionOrder: [
        { type: 'set', name: 'base', sources: [ref('tokens/base.json')] },
        { type: 'modifier', name: 'theme', contexts: { light: [{ c: color('#ffffff') }], dark: [{ c: color('#000000') }] } },
      ],
    };
    const { ds, result } = await load(doc);
    expect(result.ok).toBe(true);
    expect(val(ds, 'c', 'dark')).toBe('#000000');
  });
});

describe('other modifiers', () => {
  const withDensity = (density: object) => ({ ...BASIC, modifiers: { ...BASIC.modifiers, density }, resolutionOrder: [...BASIC.resolutionOrder, ref('#/modifiers/density')] });
  it('are read with their default context, and say what was left out', async () => {
    const { ds, result } = await load(withDensity({ contexts: { comfortable: [ref('tokens/density.json')], compact: [ref('tokens/compact.json')] }, default: 'comfortable' }));
    expect(val(ds, 'space-gap', 'light')).toBe('8px');
    expect(result.ok && result.warnings).toEqual(['tokens.resolver.json: modifier density was read with its default context comfortable; compact not read.']);
  });
  it('are skipped, with a warning, when they have no default', async () => {
    const { ds, result } = await load(withDensity({ contexts: { comfortable: [ref('tokens/density.json')], compact: [ref('tokens/compact.json')] } }));
    expect(ds.tokens.has('space-gap')).toBe(false);
    expect(result.ok && result.warnings[0]).toMatch(/modifier density has no default, so none of its contexts \(comfortable, compact\) were read\./);
  });
  it('do not warn when they have one context', async () => {
    const { result } = await load(withDensity({ contexts: { only: [ref('tokens/density.json')] }, default: 'only' }));
    expect(result.ok && result.warnings).toEqual([]);
  });
});

describe('without a theme modifier', () => {
  it('reads one mode and says so', async () => {
    const doc = { version: '2025.10', resolutionOrder: [{ type: 'set', name: 'base', sources: [ref('tokens/base.json')] }] };
    const { ds, result } = await load(doc);
    expect(result.ok && result.warnings).toEqual(['tokens.resolver.json: no modifier has both a light and a dark context, so the tokens are read as one mode (light).']);
    expect(ds.tokens.get('color-white')?.modes).toHaveProperty('light');
    expect(ds.tokens.get('color-white')?.modes).not.toHaveProperty('dark');
  });
});

describe('references', () => {
  it('follows a pointer into an external file', async () => {
    const doc = { version: '2025.10', resolutionOrder: [{ type: 'set', name: 'x', sources: [ref('tokens/two.json#sets/Inner/sources/0')] }] };
    const { ds, result } = await load(doc);
    expect(result).toMatchObject({ ok: true, files: ['tokens/two.json'] });
    expect(val(ds, 'color-x', 'light')).toBe('#abcdef');
  });
  it('follows a reference that points at another reference', async () => {
    const doc = { version: '2025.10', sets: { a: ref('#/sets/b'), b: { sources: [{ a: color('#123456') }] } }, resolutionOrder: [ref('#/sets/a')] };
    expect(val((await load(doc)).ds, 'a', 'light')).toBe('#123456');
  });
  it('reads a file once, however often it is referenced', async () => {
    let reads = 0;
    const counted: ReadRef = (r) => { reads++; return read(r); };
    await load({ ...BASIC, resolutionOrder: [ref('#/sets/foundation'), ref('#/modifiers/theme'), { type: 'set', name: 'again', sources: [ref('tokens/base.json')] }] }, counted);
    expect(reads).toBe(3);
  });
});

describe('errors', () => {
  const errors = async (doc: unknown, readRef?: ReadRef): Promise<string[]> => {
    const { result } = await load(doc, readRef);
    return result.ok ? [] : result.errors;
  };
  it('rejects anything but an object, and the wrong version', async () => {
    expect(await errors([])).toEqual(['tokens.resolver.json: expected a JSON object at the top level.']);
    expect(await errors({ ...BASIC, version: '2024.1' })).toEqual(['tokens.resolver.json: version must be "2025.10" (found "2024.1").']);
  });
  it('rejects an empty resolution order', async () => {
    expect(await errors({ version: '2025.10', resolutionOrder: [] })).toEqual(['tokens.resolver.json: resolutionOrder must be a non-empty array.']);
  });
  it('rejects a name used twice in the resolution order, but allows a set and a modifier of one name at the root', async () => {
    const dup = { version: '2025.10', resolutionOrder: [{ type: 'set', name: 'a', sources: [] }, { type: 'set', name: 'a', sources: [] }] };
    expect(await errors(dup)).toEqual(['tokens.resolver.json: resolutionOrder: the name a appears twice.']);
    const shared = { version: '2025.10', sets: { t: { sources: [{ a: color('#fff') }] } }, modifiers: { t: { contexts: { light: [], dark: [] } } }, resolutionOrder: [ref('#/modifiers/t')] };
    expect(await errors(shared)).toEqual([]);
  });
  it('rejects a default that is not a context', async () => {
    const doc = { ...BASIC, modifiers: { theme: { contexts: { light: [], dark: [] }, default: 'blue' } } };
    expect(await errors(doc)).toEqual(['tokens.resolver.json: modifier theme: default must name one of its contexts.']);
  });
  it('reports every missing file at once', async () => {
    const doc = { ...BASIC, sets: { foundation: { sources: [ref('tokens/nope.json'), ref('tokens/base.json')] } }, modifiers: { theme: { contexts: { light: [ref('tokens/gone.json')], dark: [] } } } };
    expect(await errors(doc)).toEqual([
      'tokens.resolver.json: cannot read tokens/nope.json (no such file).',
      'tokens.resolver.json: cannot read tokens/gone.json (no such file).',
    ]);
  });
  it('rejects a reference to nothing and a circular one', async () => {
    expect(await errors({ version: '2025.10', resolutionOrder: [ref('#/sets/missing')] })).toEqual(['tokens.resolver.json: reference #/sets/missing points at nothing.']);
    const circ = { version: '2025.10', sets: { a: ref('#/sets/b'), b: ref('#/sets/a') }, resolutionOrder: [ref('#/sets/a')] };
    expect((await errors(circ)).join()).toMatch(/is circular/);
  });
  it('rejects an item that is neither a reference nor a complete inline set or modifier', async () => {
    expect(await errors({ version: '2025.10', resolutionOrder: [{ name: 'x' }] })).toEqual([
      'tokens.resolver.json: resolutionOrder[0]: expected a reference to #/sets/… or #/modifiers/…, or an inline set or modifier with a name and a type.',
    ]);
  });
  it('rejects a source that is neither a reference nor tokens', async () => {
    expect(await errors({ version: '2025.10', resolutionOrder: [{ type: 'set', name: 's', sources: ['x'] }] })).toEqual([
      'tokens.resolver.json: set s: a source must be a reference object or a group of tokens.',
    ]);
  });
  it('adds nothing to the dataset when it fails', async () => {
    const { ds } = await load({ ...BASIC, version: 'x' });
    expect(ds.tokens.size).toBe(0);
  });
});

describe('detection', () => {
  const text = JSON.stringify(BASIC);
  it('recognizes a resolver document, and not an ordinary token file', () => {
    expect(isResolver(BASIC)).toBe(true);
    expect(isResolver({ color: { a: color('#fff') } })).toBe(false);
    expect(detectFormat(text).kind).toBe('resolver');
  });
  it('is not parsed as tokens by parseSource', () => {
    const ds = createDataset('x');
    expect(parseSource(ds, text, { path: 'a.resolver.json' })).toEqual({ ok: false, message: 'A DTCG resolver document needs the files it references, which are not available here.' });
    expect(ds.tokens.size).toBe(0);
  });
});
