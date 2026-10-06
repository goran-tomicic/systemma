import type { Analysis, Dataset, Finding, Severity } from '@systemma/core';
import type { FailOn } from './args.js';

export interface ReportFinding {
  rule: string;
  set: string;
  severity: Severity;
  id: string | null;
  // The token's authored name, or the subject of a finding that is not about a token.
  subject: string;
  message: string;
  // The file the token came from, when the finding is about a token.
  source: string | null;
}

export interface Report {
  version: 1;
  summary: { files: number; tokens: number; errors: number; warnings: number; infos: number; usages: number };
  failOn: FailOn;
  findings: ReportFinding[];
  inputWarnings: string[];
}

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function buildReport(ds: Dataset, analysis: Analysis, files: number, inputWarnings: string[], failOn: FailOn): Report {
  const toReport = (f: Finding): ReportFinding => ({
    rule: f.rule, set: f.set, severity: f.severity, id: f.id, subject: f.subject, message: f.message,
    source: (f.id !== null ? ds.tokens.get(f.id)?.source : undefined) || null,
  });
  // Most severe first. The sort is stable, so findings of equal severity keep the order the audit raised them in.
  const findings = analysis.findings.map(toReport).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const count = (s: Severity): number => findings.filter((f) => f.severity === s).length;
  return {
    version: 1,
    summary: { files, tokens: ds.tokens.size, errors: count('error'), warnings: count('warn'), infos: count('info'), usages: ds.usage.length },
    failOn, findings, inputWarnings,
  };
}

export const exitCodeFor = (r: Report): 0 | 1 =>
  r.summary.errors > 0 || (r.failOn === 'warn' && r.summary.warnings > 0) ? 1 : 0;

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatText(r: Report): string {
  const lines: string[] = [];
  const bySource = new Map<string, ReportFinding[]>();
  for (const f of r.findings) {
    const key = f.source ?? '(not tied to a file)';
    const list = bySource.get(key);
    if (list) list.push(f);
    else bySource.set(key, [f]);
  }
  const ruleWidth = Math.max(0, ...r.findings.map((f) => f.rule.length));
  const sevWidth = 5;
  for (const [source, list] of bySource) {
    lines.push(source);
    for (const f of list) lines.push(`  ${f.severity.padEnd(sevWidth)}  ${f.rule.padEnd(ruleWidth)}  ${f.subject}  ${f.message}`);
    lines.push('');
  }
  const { errors, warnings, infos, tokens, files } = r.summary;
  const scope = `${plural(tokens, 'token')} in ${plural(files, 'file')}`;
  lines.push(r.findings.length
    ? `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info across ${scope}.`
    : `No findings across ${scope}.`);
  return lines.join('\n') + '\n';
}

export const formatJson = (r: Report): string => JSON.stringify(r, null, 2) + '\n';
