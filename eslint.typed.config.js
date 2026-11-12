import { fileURLToPath } from 'node:url';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import fastConfig from './eslint.config.js';

// Only the existing TypeScript service has a real tsconfig. Deno functions and
// JSX are checked separately; do not fabricate a typed project for them.
export default [
  ...fastConfig,
  {
    files: ['planeje-mcp/src/**/*.ts'],
    languageOptions: { parserOptions: {
      project: './planeje-mcp/tsconfig.json',
      tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
    } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // Initial measurement: zero floating promises; one legacy misused promise.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'warn',
    },
  },
];
