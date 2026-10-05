import tseslint from 'typescript-eslint';

// Core must run in a browser, Node and a worker, so DOM globals and Node built-ins are banned in src.
const DOM_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'File', 'FileReader', 'fetch', 'XMLHttpRequest', 'process', 'Buffer', '__dirname', '__filename']
  .map((name) => ({ name, message: 'packages/core must not depend on DOM or Node globals. Use FileLike for file access.' }));

export default tseslint.config(
  // Fixtures are sample input for the parsers and the scan, not code to lint.
  { ignores: ['**/dist/**', '**/node_modules/**', 'prototype/**', 'fixtures/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...DOM_GLOBALS],
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'os', 'child_process', 'crypto', 'url'], message: 'No Node-only imports in core.' }] }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
