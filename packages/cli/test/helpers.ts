import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Env } from '../src/run.js';

// Tests run from packages/cli, so the shared fixtures are two levels up.
export const fixtureDir = (name: string): string => resolve(process.cwd(), '../../fixtures', name);

export interface Captured {
  env: Env;
  out: () => string;
  err: () => string;
}

export function capture(cwd: string): Captured {
  let out = '';
  let err = '';
  return { env: { cwd, stdout: (s) => { out += s; }, stderr: (s) => { err += s; } }, out: () => out, err: () => err };
}

// A throwaway directory of files, removed by the returned cleanup function.
export function tempProject(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'systemma-cli-'));
  for (const [path, text] of Object.entries(files)) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const tokens = (json: unknown): string => JSON.stringify(json);
