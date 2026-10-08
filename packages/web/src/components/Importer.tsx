import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { ScanData, SourceSet } from '../lib/sources';
import { ScanPanel } from './ScanPanel';

export interface NewSource {
  name: string;
  text: string;
  readError?: string;
  scan?: ScanData;
}

// Reads dropped or chosen files. A file that cannot be read still becomes a source, carrying its error, so it
// shows in the list instead of silently going missing.
export async function readFiles(files: ArrayLike<File>): Promise<NewSource[]> {
  return Promise.all(Array.from(files).map(async (file): Promise<NewSource> => {
    const name = file.webkitRelativePath || file.name;
    try {
      return { name, text: await file.text() };
    } catch (e) {
      return { name, text: '', readError: `Could not read this file (${e instanceof Error ? e.message : String(e)}).` };
    }
  }));
}

export function Importer({ onAdd, onExample, onExampleCompare, target, onTarget, open, onOpen }: {
  onAdd(items: NewSource[]): void;
  onExample(): void;
  onExampleCompare(): void;
  target: SourceSet;
  onTarget(t: SourceSet): void;
  open: boolean;
  onOpen(open: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState('pasted.json');
  const [text, setText] = useState('');

  const add = async (files: ArrayLike<File>): Promise<void> => {
    if (files.length) onAdd(await readFiles(files));
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    void add(e.dataTransfer.files);
  };

  return (
    <details className="importer" open={open} onToggle={(e) => { if (e.currentTarget.open !== open) onOpen(e.currentTarget.open); }}>
      <summary>Add tokens</summary>
      <fieldset className="target">
        <legend>Add to</legend>
        <label><input type="radio" name="target" checked={target === 'base'} onChange={() => onTarget('base')} /> These tokens</label>
        <label><input type="radio" name="target" checked={target === 'compare'} onChange={() => onTarget('compare')} /> Compare against</label>
      </fieldset>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <p>Drop token files here: DTCG or Tokens Studio JSON, a Figma variables export, CSS custom properties, or usage JSON.</p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={() => input.current?.click()}>Choose files</button>
          <button className="btn" type="button" onClick={onExample}>Load an example</button>
          <button className="btn" type="button" onClick={onExampleCompare}>Load an example to compare</button>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Choose token files"
          accept=".json,.css,.scss,.less,application/json,text/css"
          onChange={(e) => { void add(e.target.files ?? []); e.target.value = ''; }}
        />
      </div>
      <ScanPanel onAdd={onAdd} />
      <form
        className="paste"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAdd([{ name: name.trim() || 'pasted.json', text }]);
          setText('');
        }}
      >
        <label>
          <span>Or paste text</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false} placeholder='{ "color": { "brand": { "$value": "#0066ff", "$type": "color" } } }' />
        </label>
        <div className="actions">
          <label className="inline">
            <span>Name it</span>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name for the pasted text" />
          </label>
          <button className="btn" type="submit" disabled={!text.trim()}>Add pasted text</button>
        </div>
        <p className="hint">A name with &ldquo;dark&rdquo; in it is read as the dark mode.</p>
      </form>
    </details>
  );
}
