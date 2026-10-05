import type { FileLike, Progress } from './types.js';

export const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|\.turbo|\.cache|storybook-static|vendor|\.svelte-kit|\.nuxt)(\/|$)/;
export const CODE_EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte|css|scss|less|html|mdx|astro)$/i;
export const SCRIPT_EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro|mdx)$/i;
export const STYLE_EXT = /\.(css|scss|less)$/i;

// Files over this size are bundles or data dumps, not hand-written styles or tokens.
export const MAX_FILE_BYTES = 1_500_000;

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const BATCH = 40;

// Reads files in batches so a large repo does not open thousands of reads at once. Within a batch the
// reads run together but the callback runs in file order, so results do not depend on which read finishes
// first. A file that cannot be read is skipped.
export async function readAll(files: FileLike[], fn: (file: FileLike, text: string) => void, onProgress?: Progress): Promise<void> {
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const texts = await Promise.all(batch.map((f) => f.text().catch((): null => null)));
    batch.forEach((f, k) => {
      const text = texts[k];
      if (text !== null && text !== undefined) fn(f, text);
    });
    onProgress?.(Math.min(i + BATCH, files.length), files.length);
  }
}
