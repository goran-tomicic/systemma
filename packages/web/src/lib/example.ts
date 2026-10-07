// A small made-up token set for trying the app: light and dark colors in the tiered style, a stylesheet, and usage.
// It has a few deliberate problems so the audit has something to show. A second, changed copy of the tokens is
// there to try the comparison with.
const json = (v: unknown): string => JSON.stringify(v, null, 2);

const LIGHT = {
  color: {
    $type: 'color',
    white: { $value: '#ffffff' },
    black: { $value: '#0b0f19' },
    gray: { 100: { $value: '#f3f4f6' }, 500: { $value: '#6b7280' }, 900: { $value: '#111827' } },
    blue: { 500: { $value: '#2563eb' }, 600: { $value: '#1d4ed8' } },
    surface: {
      base: { $value: '{color.white}', $description: 'Page background' },
      raised: { $value: '{color.gray.100}', $description: 'Cards and panels' },
    },
    fg: {
      base: { $value: '{color.gray.900}', $description: 'Body text' },
      muted: { $value: '#9ca3af', $description: 'Secondary text' },
    },
    border: { base: { $value: '#e5e7eb', $description: 'Default border' } },
    palette: {
      brand: {
        solid: { $value: '{color.blue.500}', $description: 'Brand button background' },
        'solid-fg': { $value: '{color.white}', $description: 'Text on the brand button' },
        subtle: { $value: '{color.blue.600}', $description: 'Brand tint background' },
      },
      danger: {
        solid: { $value: '#dc2626', $description: 'Destructive button background' },
        'solid-fg': { $value: '{color.white}', $description: 'Text on the danger button' },
      },
    },
    accent: { $value: '{color.nope}', $description: 'Accent color' },
  },
  space: {
    $type: 'dimension',
    1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '12px' }, 4: { $value: '16px' }, 5: { $value: '13px' },
  },
  radius: { $type: 'dimension', sm: { $value: '4px' }, md: { $value: '8px' } },
  motion: { $type: 'duration', fast: { $value: { value: 150, unit: 'ms' } } },
  shadow: {
    $type: 'shadow',
    card: { $value: { color: '#0000001a', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' } },
  },
  mystery: { $value: '#123456' },
};

const DARK = {
  color: {
    $type: 'color',
    surface: { base: { $value: '#0b0f19' }, raised: { $value: '#161b26' } },
    fg: { base: { $value: '#f3f4f6' } },
    border: { base: { $value: '#2a313b' } },
  },
};

const CSS = ':root {\n  --focus-ring: #93c5fd; /* Focus outline for interactive elements */\n  --elevation-1: 0 1px 2px rgba(0, 0, 0, 0.2);\n}\n';

const USAGE = [
  { component: 'Button', file: 'Button.tsx', tokens: { background: 'color/palette/brand/solid', color: 'color/palette/brand/solid-fg', 'border-color': 'color/border/base' } },
  { component: 'Card', file: 'Card.tsx', tokens: { background: 'color/surface/raised', color: 'color/fg/missing', 'box-shadow': 'shadow/card' } },
  { component: 'Input', file: 'Input.tsx', tokens: { 'focus-ring': 'color/gray/500', background: 'color/fg/base' } },
];

export const EXAMPLE_SOURCES: { name: string; text: string }[] = [
  { name: 'example/tokens.light.json', text: json(LIGHT) },
  { name: 'example/tokens.dark.json', text: json(DARK) },
  { name: 'example/theme.css', text: CSS },
  { name: 'example/usage.json', text: json(USAGE) },
];

// The same tokens a release later: a value changed or two, a token dropped, a token added. Nothing else differs.
type Group = Record<string, unknown>;
const copy = (v: unknown): Record<string, Group> => JSON.parse(JSON.stringify(v)) as Record<string, Group>;

const changed = copy(LIGHT);
const color = changed['color'] as Group;
(color['fg'] as Group)['muted'] = { $value: '#6b7280', $description: 'Secondary text' };
((color['palette'] as Group)['danger'] as Group)['solid'] = { $value: '#b91c1c', $description: 'Destructive button background' };
delete color['accent'];
color['info'] = { base: { $value: '{color.blue.500}', $description: 'Informational text' } };
(changed['space'] as Group)['5'] = { $value: '12px' };
(changed['radius'] as Group)['lg'] = { $value: '12px' };

const changedDark = copy(DARK);
(((changedDark['color'] as Group)['surface']) as Group)['base'] = { $value: '#0f1420' };

export const EXAMPLE_COMPARE_SOURCES: { name: string; text: string }[] = [
  { name: 'example/v2/tokens.light.json', text: json(changed) },
  { name: 'example/v2/tokens.dark.json', text: json(changedDark) },
  { name: 'example/v2/theme.css', text: CSS },
];
