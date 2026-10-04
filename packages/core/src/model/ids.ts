// Canonical id: lowercase and hyphen-joined, so "color/palette/brand" and "--color-palette-brand"
// refer to the same token across DTCG, CSS and Figma sources.
export function canon(s: string): string {
  return String(s)
    .trim()
    .replace(/^--/, '')
    .replace(/[/.\s]+/g, '-')
    .toLowerCase();
}
