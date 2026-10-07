import type { Analysis, Dataset, Mode } from '@systemma/core';
import { shortLabel } from '../lib/tokens';
import { Preview } from './Preview';

// A token named in a sentence: its swatch and name. With an `onSelect` it is a button that selects the token; without
// one it is plain text, for a token that the detail panel has nothing to say about (one from the other set in a
// comparison). A name that no token has is marked.
export function TokenChip({ ds, analysis, id, mode, onSelect, extra }: {
  ds: Dataset;
  analysis: Analysis;
  id: string;
  mode: Mode;
  onSelect?: (id: string) => void;
  extra?: string;
}) {
  const token = ds.tokens.get(id);
  const body = (
    <>
      <Preview ds={ds} id={id} mode={mode} size="sm" info={analysis.info.get(id)} />
      <span>{token ? shortLabel(token) : id}</span>
      {extra && <em>{extra}</em>}
    </>
  );
  const cls = `chip${token ? '' : ' bad'}`;
  return onSelect
    ? <button type="button" className={cls} onClick={() => onSelect(id)} title={token?.label ?? `${id} is not defined`}>{body}</button>
    : <span className={cls} title={token?.label ?? `${id} is not defined`}>{body}</span>;
}
