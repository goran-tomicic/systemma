import type { Dataset, Token } from '../../src/index.js';
import { addToken as add } from '../../src/parse/add-token.js';

// For tests that build datasets by hand and never expect a collision: the token, or an error that says
// the fixture collided, so a typo in a fixture does not turn into a confusing failure further on.
export function addToken(ds: Dataset, ...args: Parameters<typeof add> extends [Dataset, ...infer R] ? R : never): Token {
  const t = add(ds, ...args);
  if (!t) throw new Error(`fixture collision: ${String(args[0])}`);
  return t;
}
