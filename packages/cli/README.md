# @systemma/cli

Audits design tokens from the command line, using [`@systemma/core`](../core/README.md). It reads token files, runs the rules and prints a report, with an exit code you can fail a build on.

> **Status.** Not published; the package name is a placeholder. It checks and reports, and can record today's findings as a baseline. It does not fix anything.

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

A DTCG resolver document (Resolver Module 2025.10, usually `*.resolver.json`) is recognized by its `resolutionOrder`. It is loaded together with the files it references (paths relative to the resolver, local files only), and those files are not read again on their own. The modifier whose contexts are `light` and `dark` becomes the two modes. Any other modifier is read with its `default` context, and a warning names the contexts that were left out; one without a default is skipped, with a warning. Later entries in `resolutionOrder` win.

All files go into one dataset, in path order. The first file to define a name keeps it. A JSON file with `dark` anywhere in its path is read as the dark mode; every other file is light.

| Option | |
| --- | --- |
| `--usage <path>` | A directory or file of code to scan for where tokens are used. Repeatable. See below |
| `--baseline <file>` | Leave out the findings recorded in this file. See below |
| `--update-baseline` | Record every current finding in the baseline file, then exit 0 |
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

Some rules need to know where tokens are used in code: `broken-usage`, `unused`, `usage-role`, `contrast-focus`, `foundation-direct`, `pairing` and `hardcoded-value`. Without usage data they have nothing to say, so `unused` stays quiet instead of calling everything unused.

```
systemma check tokens --usage src
```

`--usage` scans the code under a directory (or a single file) for `var(--token)` in style files and components, and for quoted token paths such as `'space.8'` in script files. Each use records the component, file, CSS property and token. Test and spec files, `node_modules`, `dist`, `build` and similar folders are skipped.

- **The token files you loaded are not scanned.** A token file's own aliases (`--gap: var(--space-4)`) are not use, and counting them would make every aliased token look used.
- **A token-shaped name that nothing declares is recorded.** `var(--color-fg-gone)` in code, when the tokens have `color-fg-*` and no style file declares it, becomes a `broken-usage` finding. A component's own custom property (`--button-pad` declared in its stylesheet) is not.
- **It adds to usage from a usage JSON file** you also pass, rather than replacing it.
- **Raw values are recorded too.** A color (`#hex`, `rgb()`, `hsl()`) or a `px` or `rem` length written in a declaration, in a style file or a style object, is reported by `hardcoded-value` when a token already has that value: `padding: 4px is the value of space-4`. Colors are compared as colors (`#fff` equals `rgb(255, 255, 255)`), lengths in pixels (`1rem` equals `16px`). A value no token has is not reported. A token that code should use is chosen from the non-foundation tier first, and `(and 1 more)` says other tokens have the same value. Custom property definitions, `var()` fallbacks and test files are left out. It is a warning, so it fails a run only with `--fail-on warn`; turn it off with `"hardcoded-value": "off"` under `rules`.
- **The property is read from the nearest declaration.** That is exact for CSS and approximate for JavaScript object literals.
- If a scan finds no use of any token, that is reported as a warning, since it usually means the wrong directory.

## As a GitHub Action

The repository root is an action. It builds the command line from its own source the first time it runs (about 30 to 60 seconds, and it needs no npm package), then runs `systemma check`. The job fails when the exit code is 1 or 2, and a text report is added to the job summary.

```yaml
steps:
  - uses: actions/checkout@<a commit hash>
  - uses: goran-tomicic/systemma@<a commit hash>
    with:
      paths: tokens
      usage: src
      baseline: systemma.baseline.json
```

| Input | |
| --- | --- |
| `paths` | Token files, directories or globs, one per line. Empty uses `sources` from the config file |
| `usage` | Directories or files of code to scan for token usage, one per line |
| `config` | Config file. Default: `systemma.config.json` in the working directory, if it exists |
| `baseline` | Baseline file of accepted findings |
| `fail-on` | `error` (default) or `warn` |
| `format` | `text` (default) or `json`. Only a text report goes to the job summary |
| `working-directory` | Where to run. Default: the repository root |

Pin the action to a commit hash, as you would any third-party action: the repository's name and layout may still change. The action's own checks run in this repository's CI, on a clean project (must pass) and on one with errors (must fail).

## Adopting it on an existing project: the baseline

A project with a long history will have findings you cannot fix today. Record them once, then fail only on new ones:

```
systemma check tokens --baseline systemma.baseline.json --update-baseline   # record what is there now
systemma check tokens --baseline systemma.baseline.json                     # from now on, only new findings
```

Commit the baseline file. The first command writes every current finding and exits 0. The second hides the findings the file lists, from the report and from the exit code, and says how many it accepted.

```
No new findings across 14 tokens in 4 files.
10 findings accepted by the baseline (systemma.baseline.json).
```

- **What counts as the same finding.** The rule, the token it is about (its id, or the subject for a finding that is not about a token) and the message. Severity and source file are not part of it, so recoloring a rule or moving a token between files does not bring old findings back. A finding whose message changes, such as a contrast ratio that moved, is reported as new, because something changed.
- **Repeats.** The file counts identical findings. If a finding occurred once when you recorded it and now occurs twice, the second is new.
- **Fixed problems.** An entry that no longer matches anything is reported as stale and never fails a run. `--update-baseline` rewrites the file and removes it.
- **`--update-baseline` replaces the file** with everything found now, including new problems. Review the diff before you commit it: that is how accepting a problem becomes a visible decision.
- **The file is readable and sorted**, so a change to it can be reviewed in a pull request.
- **The path** can be set once as `baseline` in the config file (relative to that file). A missing baseline file is an error that says how to create it, so a typo in the path cannot silently disable the check.

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
  "inputWarnings": ["tokens/broken.json: skipped. Invalid JSON: ..."],
  "baseline": null
}
```

`files` counts the token files read, and `usages` the use records, from usage JSON files and `--usage` together. `id` is the token's canonical id and `subject` its authored name, or the subject of a finding that is not about a token. `source` is the file the token came from. Findings are ordered most severe first; within a severity they keep the order the rules raised them in. Input warnings are in the JSON, not on stderr. `baseline` is `null` unless a baseline is in use, and then `{ "file", "accepted", "stale" }`; accepted findings are not in `findings` or the summary.

## The config file

```json
{
  "sources": ["tokens/**/*.json", "src/**/*.css"],
  "usage": ["src"],
  "baseline": "systemma.baseline.json",
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
| `baseline` | Where accepted findings are recorded, relative to the config file. `--baseline` on the command line replaces it |
| `profile` | `"auto"` (default), `"tiered"`, `"generic"`, or a profile object (`id`, `tiers`, `groupSegment`). See the core README |
| `rulesets` | `true` or `false` per ruleset, applied on top of the defaults |
| `rules` | Per rule: `"off"`, `"error"`, `"warn"` or `"info"`, or `{ "severity", "pairs" }`. Only `contrast` takes `pairs` |
| `ignore` | Per rule, globs for the tokens to leave alone |
| `modeGapKinds` | Which kinds of token the `mode-gap` rule expects to have a dark value. Default `["color"]` |
| `stripSets` | `true` for Tokens Studio files, whose top-level keys are set names |

Declared `pairs` replace the contrast pairs the rules would infer from token names. The config is checked strictly: an unknown option, a wrong type or an unknown rule is an error that names it, and every problem is listed at once.

## Using it in CI

```
systemma check tokens --format json > systemma-report.json
```

The exit code does the gating, so no other step is needed: `--fail-on warn` for a strict check, the default to fail on errors only. With a committed baseline, a pull request fails only for findings it introduces.
