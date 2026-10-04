import { defineConfig } from 'vitest/config';

// The same suite runs under Node and jsdom, which is how we check the core stays portable.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node', include: ['test/**/*.test.ts'] } },
      { test: { name: 'jsdom', environment: 'jsdom', include: ['test/**/*.test.ts'] } },
    ],
  },
});
