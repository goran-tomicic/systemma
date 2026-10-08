// Raw colors and lengths written in a declaration (`color: #fff`, or `color: '#fff'` in a style object).
export interface FoundLiteral {
  prop: string;
  value: string;
  kind: 'color' | 'length';
}

const DECLARATION = /([\w-]+)\s*:\s*([^;{}\n]+)/g;
// In a script a comma ends a property (`{ color: '#fff', gap: '12px' }`), except inside parentheses.
const SCRIPT_DECLARATION = /([\w-]+)\s*:\s*((?:[^;{},\n()]|\([^()\n]*\))+)/g;
const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgb|hsl)a?\([^)]*\)/g;
// px and rem only: the units a token set holds. The lookbehind keeps "1.5px" from also matching as "5px".
const LENGTH = /(?<![\w.#])-?\d*\.?\d+(?:px|rem)\b/g;
const VAR = /var\((?:[^()]|\([^()]*\))*\)/g;

// In a style file a comma belongs to the value (`box-shadow: 0 1px #000, 0 2px #111`).
export function findLiterals(text: string, script = false): FoundLiteral[] {
  const out: FoundLiteral[] = [];
  for (const m of text.matchAll(script ? SCRIPT_DECLARATION : DECLARATION)) {
    const prop = m[1] ?? '';
    // A custom property's value is a definition, not a use.
    if (prop.startsWith('--')) continue;
    // A var() fallback is a decision to use the token, so what is inside it is left alone.
    const value = (m[2] ?? '').replace(VAR, ' ');
    for (const c of value.matchAll(COLOR)) out.push({ prop, value: c[0], kind: 'color' });
    // Colors are removed first so digits inside rgb(...) are not read as lengths.
    for (const l of value.replace(COLOR, ' ').matchAll(LENGTH)) out.push({ prop, value: l[0], kind: 'length' });
  }
  return out;
}
