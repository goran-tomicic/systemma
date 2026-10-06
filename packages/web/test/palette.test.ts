import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@systemma/core';

// The app is an accessibility checker, so its own colors have to meet the bar it checks others against. This
// reads the stylesheet's variables for each theme and holds every text-on-background pair to 4.5:1.
// Vitest runs from packages/web; import.meta.url is not a file path under jsdom.
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function variables(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  return out;
}
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const light = variables(css.slice(css.indexOf(':root {'), css.indexOf('@media')));
const dark = variables(css.slice(css.indexOf('@media (prefers-color-scheme: dark)')));

// [text, background]. Fills (tiers, severity dots) are shapes, not text, so they are not listed.
const PAIRS: [string, string][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink2', 'bg'], ['ink2', 'surface'], ['ink2', 'line2'],
  ['ink3', 'bg'], ['ink3', 'surface'], ['ink3', 'line2'],
  ['err', 'surface'], ['warn', 'surface'], ['err', 'bg'], ['warn', 'bg'],
  ['on-fill', 'err'], ['on-fill', 'warn'], ['bg', 'ink'],
];

describe.each([['light', light], ['dark', dark]] as const)('%s theme', (name, theme) => {
  const merged = { ...light, ...theme };
  it('defines the colors the pairs use', () => {
    for (const [a, b] of PAIRS) {
      expect(merged[a], `${name}: --${a}`).toBeDefined();
      expect(merged[b], `${name}: --${b}`).toBeDefined();
    }
  });

  it.each(PAIRS)('--%s on --%s is at least 4.5:1', (a, b) => {
    const ratio = contrastRatio(rgb(merged[a] ?? '#000000'), rgb(merged[b] ?? '#000000'));
    expect(ratio, `${name}: ${merged[a]} on ${merged[b]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
