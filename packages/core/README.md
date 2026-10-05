# @systemma/core

Reads design tokens from several formats into one graph, resolves aliases, classifies tokens into tiers, audits them against a set of cited rules, compares two sets, and does the color math for contrast and color-vision checks.

It is a plain TypeScript library: no DOM, no Node-only APIs, no network. It runs in a browser, in Node and in a worker. File access for the repo scan goes through a small `FileLike` interface.

> **Status.** Not published. The package name is a placeholder until it is checked. Parsers return values and never touch module state; the Figma parser is experimental (see [Limits](#limits)).

## The dataset

Every parser adds tokens to a `Dataset` and returns `{ count, warnings }`. Tokens are keyed by a canonical id (lowercase, hyphen-joined) and keep their authored label.

```ts
import { createDataset } from '@systemma/core';

const ds = createDataset('app');   // { name, tokens: Map, usage: [] }
```

A token has one value per mode (`light`, `dark`). A value is an alias (`{ ref }`), a literal (`{ lit }`) or a composite (`{ comp }`).

## Parsers

### DTCG and Tokens Studio JSON

```ts
import { parseTokensJson } from '@systemma/core';

parseTokensJson(ds, {
  color: { $type: 'color', brand: { $value: '#0066ff' }, link: { $value: '{color.brand}' } },
}, { mode: 'light', source: 'tokens.json' });
// { count: 2, warnings: [] }   ids: color-brand, color-link
// color-link, light: { ref: 'color-brand' }
```

For Tokens Studio files, whose top-level keys are set names, pass `stripSet: true`:

```ts
parseTokensJson(ds, { global: { color: { primary: { value: '#0066ff', type: 'color' } } } },
  { mode: 'light', stripSet: true });
// id: color-primary
```

Call it once per mode with the same `ds` to add a dark theme. Input that is not an object returns a warning instead of throwing.

### CSS custom properties

```ts
import { parseCss } from '@systemma/core';

parseCss(ds, ':root { --color-bg: #fff; } [data-theme="dark"] { --color-bg: #000; }', 'theme.css');
// { count: 2, warnings: [] }
// color-bg: { light: { lit: '#fff' }, dark: { lit: '#000' } }
```

Dark blocks are recognized from `prefers-color-scheme: dark`, `[data-theme=dark]`, `[data-mode=dark]`, `[data-color-mode=dark]`, `.dark`, `.theme-dark` and `.dark-mode`. A comment on the same line, or a sentence-length comment directly above, becomes the description.

### Figma variables (experimental)

```ts
import { parseFigmaVariables } from '@systemma/core';

parseFigmaVariables(ds, figmaVariablesResponse);   // the REST response, or its `meta` object
```

A collection with a mode whose name contains "dark" maps modes by name. Otherwise only the default mode is read.

### Usage data

```ts
import { parseUsage } from '@systemma/core';

parseUsage(ds, [{ component: 'Button', tokens: { background: 'color/brand', color: 'var(--color-fg)' } }]);
// ds.usage: { component: 'Button', file: '', prop: 'background', token: 'color-brand' }, ...
```

`tokens` may also be a list of strings or a list of `{ token, prop }`, and a record may use a single `token`. Token strings can be ids, slash or dot paths, `{aliases}` or `var(--x)`.

### Detecting a format

```ts
import { detectFormat } from '@systemma/core';

detectFormat(':root { --a: 1 }').kind;   // 'css'
detectFormat('[]').kind;                  // 'usage'
detectFormat('{"meta":{"variables":{}}}').kind;   // 'figma'
detectFormat('{"a":{"$value":1}}').kind;  // 'dtcg'
detectFormat('nope');                     // { kind: 'error', message: 'Unrecognized format. ...' }
```

## Resolving values

```ts
import { resolve } from '@systemma/core';

resolve(ds, 'color-link', 'light');
// { value: '#0066ff', chain: ['color-link', 'color-brand'] }
```

The result is a `{ value }`, a `{ composite }` (with references inside it replaced) or an `{ error: 'missing' | 'nomode' | 'cycle' }`, always with the `chain` that was followed. After the first hop a missing mode falls back to the light value, because primitives are usually mode-less.

## Analyzing and auditing

```ts
import { analyze } from '@systemma/core';

const a = analyze(ds);
a.info.get('color-link');          // { tier, group, kind, category }
a.dependents.get('color-brand');   // Set { 'color-link' }
a.findings;                        // [{ rule, set, severity, id, subject, message }, ...]
a.byId.get('color-link');          // findings about one token
```

`analyze` does not change the dataset. A token's tier and group depend on how the data is named, so classification uses a **profile**:

```ts
analyze(ds, { profile: 'auto' });      // the default
analyze(ds, { profile: 'generic' });   // no naming assumptions
analyze(ds, { profile: 'tiered' });    // the foundation / common / palette naming scheme
```

`'auto'` picks the tiered profile when the data follows that scheme (five or more `color-palette-*` or `color-surface-*` tokens) and the generic profile otherwise. The generic profile takes a token's tier from its collection name or from whether it is a raw value or an alias, and a color's group from its first segment after an optional leading `color`. You can also pass your own profile as data:

```ts
analyze(ds, { profile: { id: 'acme', tiers: { palette: ['^action-'] }, groupSegment: { palette: 1 } } });
// action-primary: { tier: 'palette', group: 'primary', kind: 'color', category: 'color' }
```

`tiers` lists regular expression sources matched against the canonical id (tried as foundation, then palette, then common). `groupSegment` gives the hyphen segment that names a color's group. A pattern that is not a valid regular expression throws an error that names it.

Rule sets and severities are options, not global switches:

```ts
analyze(ds, {
  enabledRulesets: new Set(['integrity', 'dtcg']),          // replaces the defaults
  severityOverrides: { 'dtcg-untyped': 'error', 'desc-missing': 'off' },
});
```

By default the contrast rules infer their text pairs from names. To say which pairs matter, declare them. Declared pairs replace the inferred ones:

```ts
analyze(ds, {
  contrastPairs: [
    { foreground: 'color/brand/text', background: 'color/brand/bg', level: 'AAA' },
    { foreground: 'color/fg/muted', background: 'color/surface/base', largeText: true },
  ],
});
// color/brand/text: on color/brand/bg · 4.54:1 (light), needs 7:1
```

Tokens can be named as ids, slash or dot paths, `{aliases}` or `var(--x)`. `level` is `AA` (the default) or `AAA`; large text needs 3:1 at AA and 4.5:1 at AAA, against 4.5:1 and 7:1 for other text. An empty list checks nothing, and a pair that names an undefined token is reported, not skipped.

`RULESETS` lists the rulesets and which are on by default. `RULE_META` has, for each of the 36 rules, its ruleset, title, description, default severity, source name, source URL and confidence.

```ts
import { RULE_META } from '@systemma/core';

RULE_META['contrast'].source.url;     // the WCAG page the rule cites
RULE_META['contrast'].confidence;     // 'high'
```

Confidence says how well the source supports the rule: `high` states it, `medium` supports it in part, `low` means the rule is a heuristic the source only motivates. Look at it before treating a finding as a standards violation.

## Comparing two sets

```ts
import { diff } from '@systemma/core';

diff(before, after);
// { onlyA: ['c-gone'], onlyB: ['c-fresh'], changed: [{ id: 'c-x', mode: 'light', a: '#fff', b: '#eee' }] }
```

Values are compared after alias resolution, per mode. Colors compare by channel, so `#fff` equals `rgb(255, 255, 255)`.

## Color math

```ts
import { contrastRatio, apcaLc, simulate, deltaE76, flatten } from '@systemma/core';

contrastRatio([0, 0, 0], [255, 255, 255]);          // 21
apcaLc([0, 0, 0], [255, 255, 255]);                 // about 106 (supplementary to WCAG 2, never a pass/fail check)
simulate([255, 0, 0], 'deuteranopia');              // about [163, 144, 0]
deltaE76([0, 0, 0], [255, 255, 255]);               // about 100 (CIE76, a coarse measure)
flatten([255, 0, 0, 0.5], [0, 0, 255]);             // [127.5, 0, 127.5]
```

Simulations are `protanopia`, `deuteranopia`, `tritanopia` and `grayscale`, with an optional severity from 0 to 1.

## Scanning a repository

The scan takes `FileLike` objects: a repo-relative `path`, a `size` and a `text()` method.

```ts
import { scanCandidates, scanUsage, createDataset } from '@systemma/core';

const files = [
  { path: 'src/tokens.css', size: 120, text: async () => ':root { --space-4: 4px; }' },
  { path: 'src/Card.tsx', size: 80, text: async () => "const s = { gap: 'var(--space-4)' };" },
];

const scan = await scanCandidates(files);        // token-file candidates, with a `checked` suggestion
const ds = createDataset('repo');
const summary = await scanUsage(scan, new Set(['src/tokens.css']), ds);
// ds.usage: { component: 'src/Card', file: 'src/Card.tsx', prop: 'gap', token: 'space-4' }
```

In a browser, build the paths from `File.webkitRelativePath` without its first segment. In Node, build them from `fs`.

## Limits

These are known and are tracked, not hidden.

- **Ids are lossy.** `a/b-c` and `a-b/c` both become `a-b-c` and merge into one token, and so do names that differ only by case (the second is recorded as a case variant). Some structure rules cannot see a collision that the id has already erased.
- **The tiered naming rules assume one vocabulary.** The tiered ruleset, the contrast pair inference and the role checks look for `color-surface-*`, `color-fg-*`, `color-palette-*` and similar names. Classification no longer depends on it, because the generic profile makes no assumptions, but those rules only mean something on data that uses that vocabulary.
- **Contrast pairs are inferred unless you declare them.** Without `contrastPairs`, only `color-fg-*` on the base surface and palette `-fg` on its background are checked. Border and focus contrast still use the base surface.
- **The Figma parser is experimental.** It is written from Figma's documentation and has not been checked against a real export.
- **Font weight names.** The DTCG format treats named weights as case-sensitive; the units check accepts any case.
- **A self-referencing `var()`** is cut off at the depth limit instead of reporting a cycle, and a `var()` fallback ends at its first closing parenthesis.
- **The repo scan reads the property from the nearest preceding declaration**, which is right for CSS and approximate for JavaScript object literals.
