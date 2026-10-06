#!/usr/bin/env bash
# Runs `systemma check` for the GitHub Action, from its inputs. The action passes each input as an INPUT_*
# environment variable instead of pasting it into this script, so a value cannot be read as a command.
set -u -o pipefail
set -f # the inputs are paths and globs, which the shell must not expand

# The non-empty lines of $1, with surrounding blanks removed. Lists are one entry per line, so a path may
# contain spaces.
lines() {
  local line
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    if [ -n "$line" ]; then printf '%s\n' "$line"; fi
  done <<< "$1"
}

args=(check)
while IFS= read -r line; do args+=("$line"); done < <(lines "${INPUT_PATHS:-}")
while IFS= read -r line; do args+=(--usage "$line"); done < <(lines "${INPUT_USAGE:-}")
if [ -n "${INPUT_CONFIG:-}" ]; then args+=(--config "$INPUT_CONFIG"); fi
if [ -n "${INPUT_BASELINE:-}" ]; then args+=(--baseline "$INPUT_BASELINE"); fi
format="${INPUT_FORMAT:-text}"
args+=(--format "$format" --fail-on "${INPUT_FAIL_ON:-error}")

bin="${SYSTEMMA_BIN:-${GITHUB_ACTION_PATH:?GITHUB_ACTION_PATH is not set}/packages/cli/dist/bin.js}"
report="$(mktemp)"
trap 'rm -f "$report"' EXIT

# Errors and warnings about the input go to stderr and show in the log as they happen. The report is read
# back so it can go to the job summary as well.
node "$bin" "${args[@]}" > "$report"
code=$?
cat "$report"

if [ "$format" = text ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo '### systemma check'
    echo
    echo '```'
    cat "$report"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi
exit "$code"
