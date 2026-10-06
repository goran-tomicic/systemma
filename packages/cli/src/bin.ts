#!/usr/bin/env node
import { run } from './run.js';

// exitCode, not exit(), so buffered output is flushed before the process ends.
process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});
