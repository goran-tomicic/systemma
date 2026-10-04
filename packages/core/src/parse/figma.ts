import { canon } from '../model/ids.js';
import { unitRgbToHex } from '../model/color.js';
import type { Dataset, Kind, Mode, TokenValue } from '../model/types.js';
import { addToken } from './add-token.js';
import type { ParseResult } from './types.js';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

interface FigmaMode { modeId: string; name: string }

function readModes(col: Rec | undefined): FigmaMode[] {
  const modes = col?.['modes'];
  if (!Array.isArray(modes)) return [];
  return modes.filter(isRec).map((m) => ({ modeId: String(m['modeId']), name: typeof m['name'] === 'string' ? m['name'] : '' }));
}

function kindOf(resolvedType: unknown, scopes: string[]): Kind {
  if (resolvedType === 'COLOR') return 'color';
  if (resolvedType === 'FLOAT') {
    if (scopes.includes('FONT_WEIGHT')) return 'fontWeight';
    return scopes.includes('OPACITY') ? 'number' : 'dimension';
  }
  if (resolvedType === 'STRING' && scopes.includes('FONT_FAMILY')) return 'fontFamily';
  return 'string';
}

/**
 * Reads the Figma REST variables response (`GET /v1/files/:key/variables/local`), either the whole
 * response or its `meta` object.
 *
 * @experimental Written from Figma's documentation. No real export has been checked against it yet,
 * so field names and mode handling may change once one is added as a fixture.
 */
export function parseFigmaVariables(ds: Dataset, json: unknown): ParseResult {
  const warnings: string[] = [];
  if (!isRec(json)) return { count: 0, warnings: ['Expected a JSON object.'] };
  const meta = isRec(json['meta']) ? json['meta'] : json;
  const vars = isRec(meta['variables']) ? meta['variables'] : {};
  const cols = isRec(meta['variableCollections']) ? meta['variableCollections'] : {};
  let count = 0;

  for (const raw of Object.values(vars)) {
    if (!isRec(raw)) continue;
    const name = String(raw['name']);
    const colRaw = cols[String(raw['variableCollectionId'])];
    const col = isRec(colRaw) ? colRaw : undefined;
    const modes = readModes(col);
    const colName = typeof col?.['name'] === 'string' ? col['name'] : '';
    // A collection that names a dark mode maps modes by name. Otherwise only the default mode is
    // read: a Desktop/Mobile split is not a light/dark split, and there is nowhere to put the second value.
    const named = modes.length > 1 && modes.some((m) => /dark/i.test(m.name));
    const scopes = strings(raw['scopes']);
    const kind = kindOf(raw['resolvedType'], scopes);
    const valuesByMode = isRec(raw['valuesByMode']) ? raw['valuesByMode'] : {};

    for (const [modeId, val] of Object.entries(valuesByMode)) {
      let mode: Mode = 'light';
      if (named) mode = /dark/i.test(modes.find((m) => m.modeId === modeId)?.name ?? '') ? 'dark' : 'light';
      else if (modes.length > 1 && modeId !== col?.['defaultModeId']) continue;

      let value: TokenValue;
      if (isRec(val) && val['type'] === 'VARIABLE_ALIAS') {
        const target = vars[String(val['id'])];
        // An alias to a variable outside this export (another library) keeps a recognizable placeholder id.
        value = { ref: isRec(target) ? canon(String(target['name'])) : 'figma-' + String(val['id']) };
      } else if (isRec(val) && 'r' in val) {
        value = { lit: unitRgbToHex({ r: Number(val['r']), g: Number(val['g']), b: Number(val['b']), ...(typeof val['a'] === 'number' ? { a: val['a'] } : {}) }) };
      } else {
        value = { lit: kind === 'dimension' ? `${String(val)}px` : String(val) };
      }

      const t = addToken(ds, name, mode, value, {
        type: kind, source: 'Figma', format: 'figma', collection: colName,
        description: typeof raw['description'] === 'string' ? raw['description'] : '',
      });
      t.scopes = scopes;
      if (isRec(raw['codeSyntax'])) t.codeSyntax = raw['codeSyntax'] as Record<string, string>;
      count++;
    }
  }
  return { count, warnings };
}
