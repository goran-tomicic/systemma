import { InputError } from './errors.js';

// What identifies a finding across runs: the rule, the token it is about (its canonical id, or the subject
// when it is not about a token) and its message. Severity and source file are left out on purpose, so
// recoloring a rule or moving a token between files does not make an old finding look new. The message is
// in, so a finding whose numbers changed (a contrast ratio, say) is reported again, since something changed.
interface Identified {
  rule: string;
  id: string | null;
  subject: string;
  message: string;
}

export const findingKey = (f: Identified): string => `${f.rule}\u0000${f.id ?? f.subject}\u0000${f.message}`;

export interface BaselineEntry {
  rule: string;
  id: string | null;
  subject: string;
  message: string;
  // How many identical findings are accepted. Omitted when it is one.
  count?: number;
}

export interface Baseline {
  version: 1;
  findings: BaselineEntry[];
}

// Entries are readable and sorted, so a change to the file can be reviewed in a diff.
export function buildBaseline(findings: readonly Identified[]): Baseline {
  const entries = new Map<string, BaselineEntry>();
  for (const f of findings) {
    const key = findingKey(f);
    const existing = entries.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else entries.set(key, { rule: f.rule, id: f.id, subject: f.subject, message: f.message });
  }
  const sortKey = (e: BaselineEntry): string => `${e.rule}\u0000${e.id ?? e.subject}\u0000${e.message}`;
  const list = [...entries.values()].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  return { version: 1, findings: list };
}

export const serializeBaseline = (b: Baseline): string => JSON.stringify(b, null, 2) + '\n';

export function parseBaseline(text: string, where: string): Baseline {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new InputError([`baseline ${where}: invalid JSON (${e instanceof Error ? e.message : String(e)}).`]);
  }
  const fail = (message: string): never => { throw new InputError([`baseline ${where}: ${message}`]); };
  if (!json || typeof json !== 'object' || Array.isArray(json)) return fail('expected a JSON object.');
  const obj = json as Record<string, unknown>;
  if (obj['version'] !== 1) fail(`unsupported version ${JSON.stringify(obj['version'])}. This tool reads version 1.`);
  if (!Array.isArray(obj['findings'])) fail('expected a "findings" list.');
  const findings = (obj['findings'] as unknown[]).map((raw, i): BaselineEntry => {
    if (!raw || typeof raw !== 'object') return fail(`findings[${i}]: expected an object.`);
    const e = raw as Record<string, unknown>;
    if (typeof e['rule'] !== 'string' || typeof e['subject'] !== 'string' || typeof e['message'] !== 'string') return fail(`findings[${i}]: expected rule, subject and message as text.`);
    if (e['id'] !== null && typeof e['id'] !== 'string') return fail(`findings[${i}].id: expected text or null.`);
    if (e['count'] !== undefined && (typeof e['count'] !== 'number' || !Number.isInteger(e['count']) || e['count'] < 2)) return fail(`findings[${i}].count: expected a whole number of 2 or more, or no count.`);
    return { rule: e['rule'], id: e['id'] as string | null, subject: e['subject'], message: e['message'], ...(typeof e['count'] === 'number' ? { count: e['count'] } : {}) };
  });
  return { version: 1, findings };
}

export interface Applied<T extends Identified> {
  // Findings the baseline does not account for, in their original order.
  fresh: T[];
  accepted: number;
  // Baseline entries (counting repeats) that matched no finding this run.
  stale: number;
}

// A finding is accepted while the baseline still has an entry left for it, so a finding that now occurs
// twice where the baseline recorded it once reports the second.
export function applyBaseline<T extends Identified>(findings: readonly T[], baseline: Baseline): Applied<T> {
  const left = new Map<string, number>();
  for (const e of baseline.findings) left.set(findingKey(e), (left.get(findingKey(e)) ?? 0) + (e.count ?? 1));
  const fresh: T[] = [];
  let accepted = 0;
  for (const f of findings) {
    const key = findingKey(f);
    const n = left.get(key) ?? 0;
    if (n > 0) { left.set(key, n - 1); accepted++; }
    else fresh.push(f);
  }
  let stale = 0;
  for (const n of left.values()) stale += n;
  return { fresh, accepted, stale };
}
