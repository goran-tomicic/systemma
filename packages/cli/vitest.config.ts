import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against core's source, so they do not need core to be built first.
export default defineConfig({
  resolve: { alias: { '@systemma/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
