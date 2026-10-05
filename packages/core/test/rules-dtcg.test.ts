import { describe, expect, it } from 'vitest';
import { createDataset, parseFigmaVariables } from '../src/index.js';
import { findings, fromCss, fromJson, literal, subjects } from './helpers/build.js';

describe('dtcg-name', () => {
  // The parser treats a $-prefixed key as metadata, so a token with such a segment has to be built by label.
  it('is an error for a DTCG token whose name segment starts with $', () => {
    const d = createDataset();
    literal(d, 'a/$b', '#fff', undefined, { format: 'dtcg' });
    const f = findings(d, 'dtcg-name');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', id: 'a-$b', message: "'$b' starts with $" });
  });

  it('flags { } and . in a segment', () => {
    const d = createDataset();
    literal(d, 'spacing.1.5', '6px', undefined, { format: 'dtcg' });
    literal(d, 'a/{b}', '1', undefined, { format: 'dtcg' });
    const f = findings(d, 'dtcg-name');
    expect(f.map((x) => x.message)).toEqual(["'spacing.1.5' contains a { } or . character", "'{b}' contains a { } or . character"]);
  });

  it('is only a warning for tokens from other formats, and skips CSS', () => {
    const d = createDataset();
    literal(d, 'x.y', '1', undefined, { format: 'figma' });
    literal(d, 'p.q', '1', undefined, {});
    literal(d, '--a.b', '1', undefined, { format: 'css' });
    const f = findings(d, 'dtcg-name');
    expect(subjects(f)).toEqual(['x.y', 'p.q']);
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
  });

  it('reports each bad segment of a label', () => {
    const d = createDataset();
    literal(d, '$a/b.c', '1', undefined, { format: 'dtcg' });
    expect(findings(d, 'dtcg-name')).toHaveLength(2);
  });

  it('stays quiet for ordinary names', () => {
    expect(findings(fromJson({ color: { brand: { $type: 'color', $value: '#fff' } } }), 'dtcg-name')).toEqual([]);
  });

  it('can be downgraded or silenced through options', () => {
    const d = createDataset();
    literal(d, 'a.b', '1', undefined, { format: 'dtcg' });
    expect(findings(d, 'dtcg-name', { severityOverrides: { 'dtcg-name': 'info' } })[0]?.severity).toBe('info');
    expect(findings(d, 'dtcg-name', { severityOverrides: { 'dtcg-name': 'off' } })).toEqual([]);
  });
});

describe('dtcg-case', () => {
  it('fires once per other spelling, on the first-seen token', () => {
    const ds = fromJson({ Color: { Brand: { $type: 'color', $value: '#1' } }, color: { brand: { $type: 'color', $value: '#2' } } });
    const f = findings(ds, 'dtcg-case');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'color-brand', subject: 'Color/Brand', message: "also defined as 'color/brand'" });
  });

  it('stays quiet when every label is spelled once', () => {
    expect(findings(fromJson({ a: { $value: '#1' }, b: { $value: '#2' } }), 'dtcg-case')).toEqual([]);
  });

  it('does not flag other collisions', () => {
    const d = createDataset();
    literal(d, 'a/b-c', '1');
    literal(d, 'a-b/c', '2');
    expect(findings(d, 'dtcg-case')).toEqual([]);
  });
});

describe('dtcg-untyped', () => {
  it('fires for a DTCG token with no type on it or any parent group', () => {
    const f = findings(fromJson({ mystery: { $value: '#123456' } }), 'dtcg-untyped');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'mystery', message: 'no $type on the token or a parent group' });
  });

  it('fires for a type name it does not recognize', () => {
    expect(findings(fromJson({ a: { $type: 'unheardof', $value: '1' } }), 'dtcg-untyped')).toHaveLength(1);
  });

  it('stays quiet for a declared type, inherited or direct', () => {
    expect(findings(fromJson({ g: { $type: 'color', a: { $value: '#fff' } }, b: { $type: 'dimension', $value: '4px' } }), 'dtcg-untyped')).toEqual([]);
  });

  it('stays quiet for a pure alias, which takes its target type', () => {
    expect(findings(fromJson({ base: { $type: 'color', $value: '#fff' }, a: { $value: '{base}' } }), 'dtcg-untyped')).toEqual([]);
  });

  it('still fires when only some modes are aliases', () => {
    const d = createDataset();
    literal(d, 'a', '#fff', '#000', { format: 'dtcg' });
    expect(findings(d, 'dtcg-untyped')).toHaveLength(1);
  });

  it('ignores tokens from other formats', () => {
    expect(findings(fromCss(':root { --a: #fff; }'), 'dtcg-untyped')).toEqual([]);
  });
});

describe('dtcg-composite', () => {
  it('fires for a typography value missing required keys, all five of them', () => {
    const f = findings(fromJson({ t: { $type: 'typography', $value: { fontFamily: 'Inter', fontSize: '16px' } } }), 'dtcg-composite');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', message: 'missing fontWeight, letterSpacing, lineHeight' });
  });

  it('checks shadow, border and transition keys', () => {
    const ds = fromJson({
      s: { $type: 'shadow', $value: { color: '#000', blur: '4px' } },
      b: { $type: 'border', $value: { width: '1px' } },
      x: { $type: 'transition', $value: { duration: '1s' } },
    });
    expect(findings(ds, 'dtcg-composite').map((f) => f.message)).toEqual([
      'missing offsetX, offsetY, spread', 'missing color, style', 'missing delay, timingFunction',
    ]);
  });

  it('numbers the layers of a layered shadow', () => {
    const ds = fromJson({ s: { $type: 'shadow', $value: [
      { color: '#000', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' },
      { color: '#000', blur: '2px' },
    ] } });
    const f = findings(ds, 'dtcg-composite');
    expect(f.map((x) => x.message)).toEqual(['layer 2 missing offsetX, offsetY, spread']);
  });

  it('reports a gap once per mode that has it', () => {
    const ds = fromJson({ b: { $type: 'border', $value: { width: '1px' } } });
    fromJson({ b: { $type: 'border', $value: { width: '1px' } } }, { mode: 'dark', ds });
    expect(findings(ds, 'dtcg-composite')).toHaveLength(2);
  });

  it('stays quiet for a complete composite, and for composites with no required-key set', () => {
    const ds = fromJson({
      b: { $type: 'border', $value: { color: '#000', width: '1px', style: 'solid' } },
      g: { $type: 'gradient', $value: [{ color: '#fff' }] },
      st: { $type: 'strokeStyle', $value: { dashArray: ['1px'] } },
    });
    expect(findings(ds, 'dtcg-composite')).toEqual([]);
  });

  it('judges a composite by its inferred kind when no type is declared', () => {
    const f = findings(fromJson({ t: { $value: { fontSize: '16px' } } }), 'dtcg-composite');
    expect(f).toHaveLength(1);
  });

  it('does not judge a composite that is reached through an alias', () => {
    const ds = fromJson({ base: { $type: 'border', $value: { color: '#000', width: '1px', style: 'solid' } }, a: { $type: 'border', $value: '{base}' } });
    expect(findings(ds, 'dtcg-composite')).toEqual([]);
  });
});

describe('dtcg-units', () => {
  const units = (json: unknown) => findings(fromJson(json), 'dtcg-units');

  it('fires for a dimension in a unit other than px or rem, case-sensitively', () => {
    const f = units({ a: { $type: 'dimension', $value: '2em' }, b: { $type: 'dimension', $value: '50%' }, c: { $type: 'dimension', $value: '16PX' } });
    expect(f.map((x) => x.message)).toEqual([
      "unit 'em' isn't representable (px and rem only)", "unit '%' isn't representable (px and rem only)", "unit 'PX' isn't representable (px and rem only)",
    ]);
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
  });

  it('fires for a duration in an unsupported unit', () => {
    const f = units({ a: { $type: 'duration', $value: { value: 2, unit: 'min' } }, b: { $type: 'duration', $value: { value: 2, unit: 'ms' } } });
    expect(f.map((x) => x.message)).toEqual(["unit 'min' isn't representable (ms and s only)"]);
  });

  it('fires for easing x coordinates outside 0 to 1, but not y', () => {
    const f = units({ a: { $type: 'cubicBezier', $value: [0.2, 0, 2, 1] }, b: { $type: 'cubicBezier', $value: [0.2, -3, 0.8, 5] }, c: { $type: 'cubicBezier', $value: [-0.1, 0, 0.5, 1] } });
    expect(subjects(f)).toEqual(['a', 'c']);
    expect(f[0]?.message).toBe('x coordinates must be within 0–1');
  });

  it('fires for a font weight outside 1 to 1000 that is not a named weight', () => {
    const f = units({ a: { $type: 'fontWeight', $value: 1200 }, b: { $type: 'fontWeight', $value: 0 }, c: { $type: 'fontWeight', $value: 'heavyish' }, d: { $type: 'fontWeight', $value: 1000 }, e: { $type: 'fontWeight', $value: 1 } });
    expect(f.map((x) => x.message)).toEqual(["'1200' is not a weight (1–1000 or a named weight)", "'0' is not a weight (1–1000 or a named weight)", "'heavyish' is not a weight (1–1000 or a named weight)"]);
  });

  it('accepts every named weight', () => {
    const names = ['thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal', 'regular', 'book', 'medium', 'semi-bold', 'demi-bold', 'bold', 'extra-bold', 'ultra-bold', 'black', 'heavy', 'extra-black', 'ultra-black'];
    const json = Object.fromEntries(names.map((n) => [n, { $type: 'fontWeight', $value: n }]));
    expect(units(json)).toEqual([]);
  });

  // Pins today's behavior: the format treats weight names as case-sensitive, this check does not.
  it('accepts a named weight in any case, although the format would not', () => {
    expect(units({ a: { $type: 'fontWeight', $value: 'Bold' } })).toEqual([]);
  });

  it('stays quiet for px, rem, ms, s and in-range values', () => {
    expect(units({
      a: { $type: 'dimension', $value: '4px' }, b: { $type: 'dimension', $value: '1.5rem' },
      c: { $type: 'duration', $value: '150ms' }, d: { $type: 'duration', $value: '0.2s' },
      e: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] }, f: { $type: 'fontWeight', $value: 700 },
    })).toEqual([]);
  });

  it('is only info for dimensions and durations that are not from DTCG', () => {
    const css = findings(fromCss(':root { --a: 2em; --b: 5min; }'), 'dtcg-units');
    expect(css.map((x) => x.severity)).toEqual(['info']);
    const figma = createDataset();
    parseFigmaVariables(figma, { meta: { variableCollections: { c: { id: 'c', name: 'C', modes: [{ modeId: 'm', name: 'M' }], defaultModeId: 'm' } }, variables: { v: { id: 'v', name: 'x', variableCollectionId: 'c', resolvedType: 'STRING', valuesByMode: { m: '2em' } } } } });
    expect(findings(figma, 'dtcg-units')).toEqual([]);
  });

  it('keeps warn for easing and weight problems whatever the format', () => {
    const d = createDataset();
    literal(d, 'e', 'cubic-bezier(2, 0, 0.5, 1)', undefined, { type: 'cubicBezier' });
    literal(d, 'w', '5000', undefined, { type: 'fontWeight' });
    expect(findings(d, 'dtcg-units').map((x) => x.severity)).toEqual(['warn', 'warn']);
  });

  it('only looks at the light mode and at values that resolve', () => {
    const d = createDataset();
    literal(d, 'a', null, '2em', { type: 'dimension' });
    literal(d, 'b', 'var(--none)', undefined, { type: 'dimension' });
    expect(findings(d, 'dtcg-units')).toEqual([]);
  });

  it('follows aliases to the value being checked', () => {
    const ds = fromJson({ base: { $type: 'dimension', $value: '2em' }, a: { $type: 'dimension', $value: '{base}' } });
    expect(findings(ds, 'dtcg-units').map((f) => f.id)).toEqual(['base', 'a']);
  });
});
