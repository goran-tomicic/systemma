import { describe, expect, it } from 'vitest';
import { categoryOf, classify, createDataset, TIERED_PROFILE, inferKind } from '../src/index.js';
import type { Dataset, Kind, Mode, Profile, Token, TokenValue } from '../src/index.js';
import { addToken } from '../src/parse/add-token.js';

describe('inferKind', () => {
  it.each([
    ['#fff', 'color'], ['#FFFFFF80', 'color'], ['rgb(1, 2, 3)', 'color'], ['rgba(1 2 3 / 50%)', 'color'], ['transparent', 'color'],
    ['hsl(0 0% 0%)', 'color'], ['HSLA(0, 0%, 0%, 1)', 'color'], ['hwb(0 0% 0%)', 'color'], ['oklch(0.5 0.1 200)', 'color'],
    ['oklab(0.5 0 0)', 'color'], ['lab(50% 0 0)', 'color'], ['lch(50% 0 0)', 'color'], ['color(display-p3 1 0 0)', 'color'],
    ['color-mix(in srgb, red, blue)', 'color'],
    ['cubic-bezier(0.4, 0, 0.2, 1)', 'cubicBezier'], ['steps(4, end)', 'cubicBezier'], ['linear(0, 1)', 'cubicBezier'],
    ['ease', 'cubicBezier'], ['ease-in', 'cubicBezier'], ['ease-out', 'cubicBezier'], ['ease-in-out', 'cubicBezier'],
    ['150ms', 'duration'], ['0.2s', 'duration'], ['-1s', 'duration'],
    ['16px', 'dimension'], ['1.5rem', 'dimension'], ['2em', 'dimension'], ['100vw', 'dimension'], ['50%', 'dimension'],
    ['12pt', 'dimension'], ['2ch', 'dimension'], ['-4px', 'dimension'], ['calc(100% - 16px)', 'dimension'],
    ['0 1px 2px #000', 'shadow'], ['inset 0 0 4px rgba(0,0,0,.2)', 'shadow'], ['0 1px 2px 0 oklch(0.5 0.1 200)', 'shadow'],
    ['1.5', 'number'], ['0', 'number'], ['-2', 'number'], ['.5', 'number'],
    ['hello', 'string'], ['auto', 'string'], ['', 'string'], ['calc(var(--a) * 2)', 'string'], ['1px solid red', 'string'],
  ])('%j is %s', (value, kind) => {
    expect(inferKind(value, 'some-token')).toBe(kind);
  });

  it('trims the value first', () => {
    expect(inferKind('  16px  ', 'x')).toBe('dimension');
  });

  it('tries color before the other kinds, and duration before dimension and number', () => {
    expect(inferKind('0s', 'x')).toBe('duration');
    expect(inferKind('0', 'x')).toBe('number');
    expect(inferKind('0px', 'x')).toBe('dimension');
  });

  it('needs the name to call a bare weight a fontWeight', () => {
    expect(inferKind('700', 'font-weight-bold')).toBe('fontWeight');
    expect(inferKind('700', 'size-bold')).toBe('number');
    expect(inferKind('bold', 'font-weight-strong')).toBe('fontWeight');
    expect(inferKind('SemiBold', 'weight')).toBe('fontWeight');
    expect(inferKind('bold', 'size')).toBe('string');
  });

  it('needs the name to call a font stack a fontFamily', () => {
    expect(inferKind('Inter, sans-serif', 'font-sans')).toBe('fontFamily');
    expect(inferKind('"Inter"', 'font-body')).toBe('fontFamily');
    expect(inferKind('ui-monospace', 'family-code')).toBe('fontFamily');
    expect(inferKind('Inter, sans-serif', 'stack')).toBe('string');
    expect(inferKind('Inter', 'font-body')).toBe('string');
  });
});

describe('categoryOf', () => {
  it.each([
    ['color', 'x', 'color'], ['gradient', 'x', 'color'],
    ['typography', 'x', 'typography'], ['fontFamily', 'x', 'typography'], ['fontWeight', 'x', 'typography'],
    ['shadow', 'x', 'shadow'],
    ['duration', 'x', 'motion'], ['cubicBezier', 'x', 'motion'], ['transition', 'x', 'motion'],
    ['border', 'x', 'border'], ['strokeStyle', 'x', 'border'],
    ['string', 'x', 'other'],
  ] as [Kind, string, string][])('%s is %s regardless of name', (kind, id, category) => {
    expect(categoryOf(kind, `${id}-radius`)).toBe(category);
  });

  it.each([
    ['font-size-2', 'typography'], ['text-lg', 'typography'], ['type-scale', 'typography'], ['line-height-1', 'typography'],
    ['lineheight-1', 'typography'], ['leading-tight', 'typography'], ['letter-spacing-1', 'typography'], ['tracking-wide', 'typography'],
    ['paragraph-gap', 'typography'],
    ['radius-md', 'radius'], ['radii-1', 'radius'], ['round-full', 'radius'], ['corner-1', 'radius'],
    ['border-width', 'border'], ['stroke-1', 'border'], ['outline-1', 'border'], ['ring-1', 'border'],
    ['duration-fast', 'motion'], ['delay-1', 'motion'], ['timing-1', 'motion'],
    ['shadow-1', 'shadow'], ['elevation-2', 'shadow'], ['blur-md', 'shadow'], ['spread-1', 'shadow'],
    ['space-4', 'spacing'], ['size-4', 'spacing'],
  ])('dimension %s is %s', (id, category) => {
    expect(categoryOf('dimension', id)).toBe(category);
  });

  it('falls back to spacing for a dimension and other for a number', () => {
    expect(categoryOf('dimension', 'anything')).toBe('spacing');
    expect(categoryOf('number', 'anything')).toBe('other');
    expect(categoryOf('number', 'opacity-disabled')).toBe('other');
    expect(categoryOf('number', 'line-height')).toBe('typography');
  });

  it('checks typography before radius, so a type-and-round id is typography', () => {
    expect(categoryOf('dimension', 'text-round')).toBe('typography');
  });
});

const lit = (s: string): TokenValue => ({ lit: s });
const ref = (s: string): TokenValue => ({ ref: s });

function one(id: string, modes: Partial<Record<Mode, TokenValue>>, extra: { type?: Kind | ''; collection?: string } = {}, more: Dataset | null = null): { ds: Dataset; token: Token } {
  const ds = more ?? createDataset('t');
  let token: Token | undefined;
  for (const m of ['light', 'dark'] as const) {
    const v = modes[m];
    if (v) token = addToken(ds, id, m, v, extra);
  }
  if (!token) throw new Error('no value');
  return { ds, token };
}

describe('classify kind', () => {
  it('uses the declared kind without resolving', () => {
    const { ds, token } = one('x', { light: lit('#fff') }, { type: 'dimension' });
    expect(classify(token, ds).kind).toBe('dimension');
  });

  it('infers from the resolved value when the kind is not declared', () => {
    const ds = createDataset();
    addToken(ds, 'base', 'light', lit('16px'));
    const { token } = one('alias', { light: ref('base') }, {}, ds);
    expect(classify(token, ds)).toMatchObject({ kind: 'dimension', category: 'spacing' });
  });

  it('infers from dark when the token has no light value', () => {
    const { ds, token } = one('x', { dark: lit('#000') });
    expect(classify(token, ds).kind).toBe('color');
  });

  it('prefers light over dark', () => {
    const { ds, token } = one('x', { light: lit('16px'), dark: lit('#000') });
    expect(classify(token, ds).kind).toBe('dimension');
  });

  it('skips a mode that does not resolve and tries the next', () => {
    const { ds, token } = one('x', { light: ref('missing'), dark: lit('150ms') });
    expect(classify(token, ds).kind).toBe('duration');
  });

  it('falls back to string when nothing resolves', () => {
    const { ds, token } = one('x', { light: ref('missing') });
    expect(classify(token, ds)).toMatchObject({ kind: 'string', category: 'other' });
  });

  it('ignores an unknown declared kind', () => {
    const ds = createDataset();
    const { token } = one('x', { light: lit('#fff') }, {}, ds);
    token.type = 'mystery' as Kind;
    expect(classify(token, ds).kind).toBe('color');
  });

  it.each([
    [{ fontSize: '16px' }, 'typography'],
    [[{ offsetX: '0px', blur: '1px' }], 'shadow'],
    [{ duration: '1s' }, 'transition'],
    [{ width: '1px', style: 'solid' }, 'border'],
    [{ mystery: 1 }, 'string'],
  ])('infers composite %j as %s', (comp, kind) => {
    const ds = createDataset();
    const t = addToken(ds, 'x', 'light', { comp });
    expect(classify(t, ds).kind).toBe(kind);
  });

  it('infers from a composite that is reached through an alias', () => {
    const ds = createDataset();
    addToken(ds, 'base', 'light', { comp: { fontSize: '16px' } });
    expect(classify(addToken(ds, 'alias', 'light', ref('base')), ds).kind).toBe('typography');
  });
});

describe('classify tier (tiered profile)', () => {
  const tier = (id: string, extra: { collection?: string } = {}, value: TokenValue = lit('#fff')): string => {
    const { ds, token } = one(id, { light: value }, extra);
    return classify(token, ds).tier;
  };

  it.each(['color-white', 'color-black', 'color-transparent', 'color-gray-50', 'color-blue-900'])('%s is foundation by id', (id) => {
    expect(tier(id, {}, ref('x'))).toBe('foundation');
  });

  it('does not treat color-gray-50-extra as a numbered step', () => {
    expect(tier('color-gray-50-extra', {}, ref('x'))).toBe('common');
  });

  it('puts color-palette-* in palette and surface/fg/border/bg in common, whatever the value', () => {
    expect(tier('color-palette-brand-solid')).toBe('palette');
    expect(tier('color-surface-base')).toBe('common');
    expect(tier('color-fg-base')).toBe('common');
    expect(tier('color-border-base')).toBe('common');
    expect(tier('color-bg-subtle')).toBe('common');
  });

  it('prefers id rules over the collection name', () => {
    expect(tier('color-surface-base', { collection: 'Primitives' })).toBe('common');
  });

  it.each([
    ['Foundations', 'foundation'], ['Primitive colors', 'foundation'], ['CORE', 'foundation'],
    ['Palette', 'palette'], ['Common', 'common'], ['Semantic', 'common'],
  ])('collection %j is %s', (collection, expected) => {
    expect(tier('space-4', { collection }, ref('x'))).toBe(expected);
  });

  it('checks the foundation words before palette and common', () => {
    expect(tier('x', { collection: 'Core palette' }, lit('1'))).toBe('foundation');
    expect(tier('x', { collection: 'Palette common' }, lit('1'))).toBe('palette');
  });

  it('treats an all-literal token as foundation and an aliasing one as common', () => {
    expect(tier('space-4', {}, lit('16px'))).toBe('foundation');
    expect(tier('space-4', {}, ref('base'))).toBe('common');
    expect(tier('space-4', {}, lit('calc(var(--a) * 2)'))).toBe('common');
    expect(tier('space-4', {}, { comp: { a: 1 } })).toBe('common');
  });

  it('is common when any mode aliases', () => {
    const { ds, token } = one('space-4', { light: lit('1px'), dark: ref('base') });
    expect(classify(token, ds).tier).toBe('common');
  });

  it('treats a token with no values as foundation', () => {
    const ds = createDataset();
    const token: Token = { id: 'x', label: 'x', modes: {}, type: '', source: '' };
    ds.tokens.set('x', token);
    expect(classify(token, ds).tier).toBe('foundation');
  });
});

describe('classify group (tiered profile)', () => {
  const group = (id: string, value: TokenValue = lit('#fff'), extra: { collection?: string } = {}): string => {
    const { ds, token } = one(id, { light: value }, extra);
    return classify(token, ds).group;
  };

  it.each([
    ['color-gray-50', 'gray'], ['color-blue-900', 'blue'], ['color-white', 'utility'], ['color-black', 'utility'],
  ])('foundation color %s is group %s', (id, expected) => {
    expect(group(id)).toBe(expected);
  });

  it('uses the role for palette colors and the second segment for common colors', () => {
    expect(group('color-palette-brand-solid')).toBe('brand');
    expect(group('color-surface-base')).toBe('surface');
    expect(group('color-fg-muted')).toBe('fg');
  });

  it('falls back to other when the group segment is empty', () => {
    expect(group('color-palette-')).toBe('other');
  });

  it('treats color-palette without a role as a two-segment foundation color', () => {
    expect(group('color-palette')).toBe('utility');
  });

  it('uses the category for non-color tokens', () => {
    expect(group('space-4', lit('16px'))).toBe('spacing');
    expect(group('radius-md', lit('4px'))).toBe('radius');
    expect(group('font-sans', lit('Inter, sans-serif'))).toBe('typography');
  });

  it('names a color-category token outside the color- prefix by its own segments', () => {
    expect(group('brand-primary', lit('#fff'), { collection: 'Common' })).toBe('primary');
    expect(group('brand', lit('#fff'), { collection: 'Common' })).toBe('brand');
    expect(group('accent', lit('#fff'), { collection: 'Palette' })).toBe('accent');
  });
});

describe('profiles', () => {
  const custom: Profile = {
    id: 'custom',
    tierOfId: (id) => (id.startsWith('ref-') ? 'foundation' : undefined),
    groupOfColor: (_tier, seg) => seg[0],
  };

  it('lets a profile decide tier and group', () => {
    const { ds, token } = one('ref-blue', { light: lit('#00f') });
    expect(classify(token, ds, custom)).toMatchObject({ tier: 'foundation', group: 'ref' });
  });

  it('falls through to the shared rules when a profile has no opinion', () => {
    const { ds, token } = one('sys-blue', { light: ref('x') });
    expect(classify(token, ds, custom).tier).toBe('common');
    expect(classify(one('sys-red', { light: lit('#f00') }).token, createDataset(), custom).tier).toBe('foundation');
  });

  it('defaults to the tiered profile', () => {
    const { ds, token } = one('color-gray-50', { light: lit('#fff') });
    expect(classify(token, ds)).toEqual(classify(token, ds, TIERED_PROFILE));
  });
});
