import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests do not use the React plugin: vitest brings its own Vite, and esbuild's JSX transform is all they need.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@systemma/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
