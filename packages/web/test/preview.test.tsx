import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { analyze, createDataset, parseTokensJson } from '@systemma/core';
import type { Mode } from '@systemma/core';
import { Preview } from '../src/components/Preview';
import type { PreviewSize } from '../src/components/Preview';

function show(tokens: unknown, id: string, opts: { mode?: Mode; size?: PreviewSize; dark?: unknown } = {}): HTMLElement {
  const ds = createDataset();
  parseTokensJson(ds, tokens, { mode: 'light' });
  if (opts.dark) parseTokensJson(ds, opts.dark, { mode: 'dark' });
  const analysis = analyze(ds, { profile: 'generic' });
  const { container } = render(<Preview ds={ds} id={id} mode={opts.mode ?? 'light'} size={opts.size ?? 'md'} info={analysis.info.get(id)} />);
  return container;
}
const style = (el: Element | null): string => el?.getAttribute('style') ?? '';

describe('Preview of a color', () => {
  const color = { x: { $type: 'color', $value: '#2563eb' } };
  it('paints a swatch with the color', () => expect(style(show(color, 'x').querySelector('.sw'))).toContain('--c: #2563eb'));
  it('keeps list swatches in the same cell as other previews, and detail swatches large', () => {
    expect(show(color, 'x', { size: 'md' }).querySelector('.pvcell.w .sw')).toBeTruthy();
    expect(show(color, 'x', { size: 'sm' }).querySelector('.pvcell')).toBeNull();
    expect(show(color, 'x', { size: 'lg' }).querySelector('.sw.lg')).toBeTruthy();
  });
  it('shows a hatched box for a color it cannot paint', () => expect(show({ x: { $type: 'color', $value: 'notacolor' } }, 'x').querySelector('.sw.none')).toBeTruthy());
  it('shows a hatched box for a mode with no value', () => expect(show(color, 'x', { mode: 'dark' }).querySelector('.sw.none')).toBeTruthy());
  it('uses the dark value in dark mode', () => expect(style(show(color, 'x', { mode: 'dark', dark: { x: { $type: 'color', $value: '#111111' } } }).querySelector('.sw'))).toContain('--c: #111111'));
  it('is hidden from assistive technology, since the value is in words beside it', () => expect(show(color, 'x').querySelector('[aria-hidden="true"]')).toBeTruthy());
});

describe('Preview of a length', () => {
  const dim = (name: string, v: string) => ({ [name]: { $type: 'dimension', $value: v } });
  it('draws a space as a bar, capped to the cell', () => {
    expect(style(show(dim('space-4', '4px'), 'space-4').querySelector('.pvbar'))).toContain('width: 4px');
    expect(style(show(dim('space-4', '400px'), 'space-4', { size: 'md' }).querySelector('.pvbar'))).toContain('width: 52px');
    expect(style(show(dim('space-4', '400px'), 'space-4', { size: 'lg' }).querySelector('.pvbar'))).toContain('width: 200px');
    expect(style(show(dim('space-4', '400px'), 'space-4', { size: 'sm' }).querySelector('.pvbar'))).toContain('width: 20px');
  });
  it('converts rem', () => expect(style(show(dim('space-2', '1rem'), 'space-2').querySelector('.pvbar'))).toContain('width: 16px'));
  it('draws a radius as a rounded corner, capped', () => {
    expect(style(show(dim('radius-md', '6px'), 'radius-md').querySelector('.pvb'))).toContain('border-radius: 6px');
    expect(style(show(dim('radius-md', '99px'), 'radius-md', { size: 'md' }).querySelector('.pvb'))).toContain('border-radius: 11px');
    expect(style(show(dim('radius-md', '99px'), 'radius-md', { size: 'lg' }).querySelector('.pvb'))).toContain('border-radius: 28px');
  });
  it('draws a border width as a line, between 1px and 8px', () => {
    expect(style(show(dim('border-width', '3px'), 'border-width').querySelector('.pvline'))).toContain('height: 3px');
    expect(style(show(dim('border-width', '30px'), 'border-width').querySelector('.pvline'))).toContain('height: 8px');
  });
  it('shows a type size as sample text, capped', () => {
    const el = show(dim('font-size-lg', '32px'), 'font-size-lg', { size: 'md' }).querySelector('.pvt');
    expect(el?.textContent).toBe('Aa');
    expect(style(el)).toContain('font-size: 20px');
  });
  it('writes the number when it cannot draw one', () => expect(show({ 'space-x': { $type: 'dimension', $value: 'calc(100% - 2px)' } }, 'space-x').querySelector('.pvn')?.textContent).toBe('calc(100% - 2px)'));
});

describe('Preview of type', () => {
  it('shows a font family as a sample in that family', () => {
    expect(style(show({ f: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } }, 'f').querySelector('.pvt'))).toContain('font-family: Inter, sans-serif');
  });
  it('shows a font weight', () => expect(style(show({ 'font-weight-bold': { $type: 'fontWeight', $value: 700 } }, 'font-weight-bold').querySelector('.pvt'))).toContain('font-weight: 700'));
  const body = { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, letterSpacing: '1px', lineHeight: 1.5 };
  it('shows a typography style as a sample with each property applied', () => {
    const el = show({ t: { $type: 'typography', $value: body } }, 't').querySelector('.pvt');
    expect(style(el)).toContain('font-family: Inter');
    expect(style(el)).toContain('font-size: 16px');
    expect(style(el)).toContain('letter-spacing: 1px');
    expect(el?.textContent).toBe('Aa');
  });
  it('shows a sentence in the large preview', () => expect(show({ t: { $type: 'typography', $value: body } }, 't', { size: 'lg' }).querySelector('.pvt')?.textContent).toBe('The quick brown fox'));
  it('applies a family only when it is made of ordinary characters', () => {
    const el = show({ t: { $type: 'typography', $value: { ...body, fontFamily: 'x; background: red' } } }, 't').querySelector('.pvt');
    expect(style(el)).not.toContain('background');
    expect(style(el)).not.toContain('font-family');
  });
});

describe('Preview of a shadow, border, stroke, duration or easing', () => {
  it('shows a shadow as a box with that shadow', () => {
    const el = show({ s: { $type: 'shadow', $value: { color: '#000000', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' } } }, 's').querySelector('.pvs');
    expect(style(el)).toContain('box-shadow');
    expect(style(el)).toContain('8px');
  });
  it('shows a border as a box with that border', () => {
    expect(style(show({ b: { $type: 'border', $value: { color: '#ff0000', width: '2px', style: 'dashed' } } }, 'b').querySelector('.pvb'))).toContain('border');
  });
  it('shows a stroke style as a line with that style', () => {
    expect(style(show({ 'stroke-style': { $type: 'strokeStyle', $value: 'dashed' } }, 'stroke-style').querySelector('.pvline'))).toContain('dashed');
    expect(show({ 'stroke-style': { $type: 'strokeStyle', $value: 'wavy' } }, 'stroke-style').querySelector('.pvline')).toBeNull();
  });
  it('shows a duration as a bar that grows with time, capped', () => {
    expect(style(show({ d: { $type: 'duration', $value: { value: 500, unit: 'ms' } } }, 'd', { size: 'md' }).querySelector('.pvbar.mot'))).toContain('width: 26px');
    expect(style(show({ d: { $type: 'duration', $value: { value: 5, unit: 's' } } }, 'd', { size: 'md' }).querySelector('.pvbar.mot'))).toContain('width: 52px');
  });
  it('draws an easing curve for a cubic bezier and for a transition that has one', () => {
    expect(show({ e: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] } }, 'e').querySelector('svg')).toBeTruthy();
    expect(show({ t: { $type: 'transition', $value: { duration: '1s', delay: '0s', timingFunction: [0.4, 0, 0.2, 1] } } }, 't').querySelector('svg')).toBeTruthy();
    expect(show({ t: { $type: 'transition', $value: { duration: '1s', delay: '0s', timingFunction: 'ease' } } }, 't').querySelector('svg')).toBeNull();
  });
  it('shows a hatched box for a kind it has no picture for', () => {
    expect(show({ label: { $type: 'string', $value: 'hello' } }, 'label').querySelector('.sw.none')).toBeTruthy();
  });
});
