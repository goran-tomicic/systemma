import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDataset, parseTokensJson, simulate } from '@systemma/core';
import { App } from '../src/App';
import { colorOf, contrastRows, inkOn, peerRows, peerTokens, rgbHex, surfaceRgb, verdictOf } from '../src/lib/simulate';

const color = (v: string) => ({ $type: 'color', $value: v });
const TOKENS = {
  color: {
    surface: { base: color('#ffffff') },
    fg: { base: color('#111111'), danger: color('#c0352b'), success: color('#2f8f4e'), brand: color('#c0352b') },
    palette: { red: { solid: color('#c83030') }, green: { solid: color('#2f9e44') } },
    glass: color('#00000080'),
    size: { $type: 'dimension', $value: '4px' },
  },
};
function dataset() {
  const ds = createDataset();
  parseTokensJson(ds, TOKENS, { mode: 'light' });
  return ds;
}

describe('rgbHex and inkOn', () => {
  it('rounds and clamps', () => {
    expect(rgbHex([0, 127.6, 300])).toBe('#0080ff');
    expect(rgbHex([-4, 5, 255])).toBe('#0005ff');
  });
  it('picks the text that reads better', () => {
    expect(inkOn([255, 255, 255])).toBe('#111111');
    expect(inkOn([0, 0, 0])).toBe('#ffffff');
  });
});

describe('verdictOf', () => {
  it.each([[0, 'hard'], [9.9, 'hard'], [10, 'close'], [19.9, 'close'], [20, '']])('%s is %j', (d, v) => {
    expect(verdictOf(d)).toBe(v);
  });
});

describe('colors', () => {
  it('colorOf resolves a color and refuses a non-color', () => {
    const ds = dataset();
    expect(colorOf(ds, 'color-fg-base', 'light')).toEqual([17, 17, 17, 1]);
    expect(colorOf(ds, 'color-size', 'light')).toBeNull();
    expect(colorOf(ds, 'color-fg-base', 'dark')).toBeNull();
  });
  it('surfaceRgb falls back to white', () => {
    expect(surfaceRgb(dataset(), 'light')).toEqual([255, 255, 255]);
    expect(surfaceRgb(createDataset(), 'dark')).toEqual([255, 255, 255]);
  });
});

describe('peers', () => {
  it('pairs a palette step with the same step in other palettes', () => {
    expect(peerTokens(dataset(), 'color-palette-red-solid')).toEqual(['color-palette-green-solid']);
  });
  it('pairs a status text with the other status texts that exist', () => {
    expect(peerTokens(dataset(), 'color-fg-danger').sort()).toEqual(['color-fg-brand', 'color-fg-success']);
  });
  it('has none for other tokens', () => {
    expect(peerTokens(dataset(), 'color-surface-base')).toEqual([]);
  });
  it('measures each pair normally and simulated, and flags one that collapses', () => {
    const ds = dataset();
    const rows = peerRows(ds, 'color-palette-red-solid', 'light', [200, 48, 48], 'deuteranopia', 1);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.normal).toBeGreaterThan(row.simulated);
    expect(row.verdict).toBe(verdictOf(row.simulated));
  });
  it('gives identical colors no distance and a hard verdict', () => {
    const rows = peerRows(dataset(), 'color-fg-danger', 'light', [192, 53, 43], 'protanopia', 1);
    const brand = rows.find((r) => r.id === 'color-fg-brand')!;
    expect(brand.normal).toBe(0);
    expect(brand.verdict).toBe('hard');
  });
  it('at severity 0 nothing changes', () => {
    const ds = dataset();
    const rows = peerRows(ds, 'color-fg-danger', 'light', [192, 53, 43], 'tritanopia', 0);
    for (const r of rows) expect(r.simulated).toBeCloseTo(r.normal, 5);
  });
});

describe('contrastRows', () => {
  it('reads a text against surfaces, then white and black', () => {
    const rows = contrastRows(dataset(), 'color-fg-base', 'light', [17, 17, 17]);
    expect(rows.map((r) => r.id)).toEqual(['color-surface-base', null, null]);
    expect(rows.slice(1).map((r) => r.label)).toEqual(['White', 'Black']);
    const white = rows.find((r) => r.label === 'White')!;
    expect(white.ratio).toBeCloseTo(18.88, 1);
    expect(white.id).toBeNull();
  });
  it('reads a background with the texts that sit on it, leaving out itself', () => {
    const rows = contrastRows(dataset(), 'color-surface-base', 'light', [255, 255, 255]);
    expect(rows.some((r) => r.id === 'color-surface-base')).toBe(false);
    expect(rows.some((r) => r.id === 'color-fg-base')).toBe(true);
  });
  it('skips a translucent surface when reading a text', () => {
    const ds = createDataset();
    parseTokensJson(ds, { color: { surface: { base: color('#ffffff'), elevated: color('#ffffff80') }, fg: { base: color('#111111') } } }, { mode: 'light' });
    const ids = contrastRows(ds, 'color-fg-base', 'light', [17, 17, 17]).map((r) => r.id);
    expect(ids).toContain('color-surface-base');
    expect(ids).not.toContain('color-surface-elevated');
  });
});

describe('the Color vision tab', () => {
  function open() {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: JSON.stringify(TOKENS) } });
    fireEvent.change(screen.getByLabelText('Name for the pasted text'), { target: { value: 'tokens.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Color vision' }));
    return within(screen.getByRole('region', { name: 'Color vision' }));
  }

  it('lists every color token and no other', () => {
    const view = open();
    const rows = Array.from(document.querySelectorAll('.list .row'));
    expect(rows).toHaveLength(8);
    expect(view.queryByText(/size/i, { selector: '.list b' })).toBeNull();
  });

  it('shows normal and simulated hex for a token', () => {
    const view = open();
    fireEvent.click(view.getByTitle(/fg.*danger/i));
    const out = within(screen.getByLabelText('Simulation result'));
    expect(out.getByText(/Normal/)).toBeTruthy();
    expect(out.getByText(/Deuteranopia/)).toBeTruthy();
    expect(screen.getByLabelText('Simulation result').textContent).toContain(rgbHex(simulate([192, 53, 43], 'deuteranopia', 1)));
  });

  it('changes the condition and applies severity only where it means something', () => {
    const view = open();
    expect(view.getByLabelText('Severity')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Grayscale' }));
    expect(view.queryByLabelText('Severity')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Protanopia' }));
    expect(view.getByLabelText('Severity')).toBeTruthy();
  });

  it('flags a peer that the condition makes hard to tell apart', () => {
    const view = open();
    fireEvent.click(view.getByRole('button', { name: 'Protanopia' }));
    fireEvent.click(view.getByTitle(/fg.*danger/i));
    expect(within(screen.getByLabelText('Simulation result')).getByText('hard to tell apart')).toBeTruthy();
  });

  it('uses a filter note, not a matrix, for low vision', () => {
    const view = open();
    fireEvent.click(view.getByRole('button', { name: 'Low vision' }));
    fireEvent.click(view.getByTitle(/fg.*base/i));
    expect(screen.getByText(/not a clinical simulation/)).toBeTruthy();
    expect(document.querySelector('.lvbox span')?.getAttribute('style')).toContain('blur');
  });

  it('filters the list', () => {
    const view = open();
    fireEvent.change(view.getByLabelText('Filter colors'), { target: { value: 'palette' } });
    expect(document.querySelectorAll('.list .row')).toHaveLength(2);
    fireEvent.change(view.getByLabelText('Filter colors'), { target: { value: 'zzz' } });
    expect(view.getByText('No colors match that filter.')).toBeTruthy();
  });

  it('says so when the mode has no colors', () => {
    const view = open();
    fireEvent.click(view.getByRole('button', { name: 'Dark' }));
    expect(view.getByText(/No token resolves to a color in dark mode/)).toBeTruthy();
  });
});
