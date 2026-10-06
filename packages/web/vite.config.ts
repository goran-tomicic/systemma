import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app uses core's source directly, so it needs no build of core first, and a change in core shows up at once.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@systemma/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
});
