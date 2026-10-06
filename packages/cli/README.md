# @systemma/cli

Audits design tokens from the command line, using [`@systemma/core`](../core/README.md). It reads token files, runs the rules and prints a report, with an exit code you can fail a build on.

> **Status.** Not published; the package name is a placeholder. This first version checks and reports. It does not write files, fix anything, or keep a baseline of accepted findings yet.

## Usage

```
systemma check [paths...] [options]
```

Paths are token files, directories or globs:

| Kind | What is read |
| --- | --- |
| a file | Anything you name must be a token file, or the run fails |
| a directory | Every `.json`, `.css`, `.scss` and `.less` inside, skipping `node_modules`, `dist`, `build`, `.git` and similar |
| a glob | `tokens/**/*.json` (`*` within a folder, `**` across folders, `**/` may match none) |

Each file is recognized by its content: DTCG or Tokens Studio JSON, a Figma variables export, CSS custom properties, or usage JSON. A file found by a directory or glob that is not a token file is skipped with a warning; a file you named outright is an error.

All files go into one dataset, in path order. The first file to define a name keeps it. A JSON file with `dark` anywhere in its path is read as the dark mode; every other file is light.

| Option | |
| --- | --- |
| `--usage <path>` | A directory or file of code to scan for where tokens are used. Repeatable. See below |
| `-c, --config <file>` | Config file. Default: `./systemma.config.json`, if it exists |
| `-f, --format <format>` | `text` (default) or `json` |
| `--fail-on <level>` | `error` (default) or `warn` |
| `-h, --help`, `-v, --version` | |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No finding at or above `--fail-on` |
| 1 | At least one finding at or above `--fail-on` |
| 2 | A usage or input error: a bad option, a missing or unreadable file, an invalid config |

`info` findings never fail a run.

## Finding where tokens are used

Some rules need to know where tokens are used in code: `broken-usage`, `unused`, `usage-role`, `contrast-focus`, `foundation-direct` and `pairing`. Without usage data they have nothing to say, so `unused` stays quiet instead of calling everything unused.

```
systemma check tokens --usage src
```

`--usage` scans the code under a directory (or a single file) for `var(--token)` in style files and components, and for quoted token paths such as `'space.8'` in script files. Each use records the component, file, CSS property and token. Test and spec files, `node_modules`, `dist`, `build` and similar folders are skipped.

- **The token files you loaded are not scanned.** A token file's own aliases (`--gap: var(--space-4)`) are not use, and counting them would make every aliased token look used.
- **A token-shaped name that nothing declares is recorded.** `var(--color-fg-gone)` in code, when the tokens have `color-fg-*` and no style file declares it, becomes a `broken-usage` finding. A component's own custom property (`--button-pad` declared in its stylesheet) is not.
- **It adds to usage from a usage JSON file** you also pass, rather than replacing it.
- **The property is read from the nearest declaration.** That is exact for CSS and approximate for JavaScript object literals.
- If a scan finds no use of any token, that is reported as a warning, since it usually means the wrong directory.

## The text report

Findings are grouped by the file their token came from, most severe first. Findings that are not about a token, such as a broken usage record, are listed apart. Warnings about the input go to stderr.

```
tokens/light.json
  error  broken-ref    color/border/base  light: references color-nope, which isn't defined
  error  contrast      color/fg/muted  on color/surface/base · 2.81:1 (light)
  warn   mode-gap      color/fg/base  has a light value but no dark value
  warn   dtcg-untyped  mystery  no $type on the token or a parent group
  info   base-unit     space/13  13px is not a multiple of the 4px base unit

(not tied to a file)
  error  broken-usage  Button  uses color-fg-missing (color), which isn't defined

3 errors, 4 warnings, 3 info across 14 tokens in 4 files.
```

## The JSON report

`--format json` prints one object. `version` changes if the shape does.

```json
{
  "version": 1,
  "summary": { "files": 4, "tokens": 14, "errors": 3, "warnings": 4, "infos": 3, "usages": 2 },
  "failOn": "error",
  "findings": [
    {
      "rule": "broken-usage",
      "set": "integrity",
      "severity": "error",
      "id": null,
      "subject": "Button",
      "message": "uses color-fg-missing (color), which isn't defined",
      "source": null
    }
  ],
  "inputWarnings": ["tokens/broken.json: skipped. Invalid JSON: ..."]
}
```

`files` counts the token files read, and `usages` the use records, from usage JSON files and `--usage` together. `id` is the token's canonical id and `subject` its authored name, or the subject of a finding that is not about a token. `source` is the file the token came from. Findings are ordered most severe first; within a severity they keep the order the rules raised them in. Input warnings are in the JSON, not on stderr.

## The config file

```json
{
  "sources": ["tokens/**/*.json", "src/**/*.css"],
  "usage": ["src"],
  "profile": "auto",
  "rulesets": { "wcag-aaa": true, "m3": false },
  "rules": {
    "contrast": {
      "severity": "error",
      "pairs": [
        { "foreground": "color/fg/base", "background": "color/surface/base", "level": "AA" },
        { "foreground": "color/fg/muted", "background": "color/surface/base", "largeText": true }
      ]
    },
    "desc-missing": "off"
  },
  "ignore": { "unused": ["color/palette/**"] },
  "modeGapKinds": ["color", "dimension"]
}
```

| Option | |
| --- | --- |
| `sources` | Paths, directories or globs, relative to the config file. Paths on the command line replace it |
| `usage` | Directories or files to scan for token usage, relative to the config file. `--usage` on the command line replaces it |
| `profile` | `"auto"` (default), `"tiered"`, `"generic"`, or a profile object (`id`, `tiers`, `groupSegment`). See the core README |
| `rulesets` | `true` or `false` per ruleset, applied on top of the defaults |
| `rules` | Per rule: `"off"`, `"error"`, `"warn"` or `"info"`, or `{ "severity", "pairs" }`. Only `contrast` takes `pairs` |
| `ignore` | Per rule, globs for the tokens to leave alone |
| `modeGapKinds` | Which kinds of token the `mode-gap` rule expects to have a dark value. Default `["color"]` |
| `stripSets` | `true` for Tokens Studio files, whose top-level keys are set names |

Declared `pairs` replace the contrast pairs the rules would infer from token names. The config is checked strictly: an unknown option, a wrong type or an unknown rule is an error that names it, and every problem is listed at once. `baseline` is reserved and rejected for now.

## Using it in CI

```
systemma check tokens --format json > systemma-report.json
```

The exit code does the gating, so no other step is needed: `--fail-on warn` for a strict check, the default to fail on errors only.
