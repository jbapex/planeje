// Gradual adoption; measured warnings are documented in docs/quality.md.
// Keep the existing ESLint 8/runtime and do not autoformat legacy source.
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import quality from './scripts/toolkit/eslint-rules/index.cjs';

const safety = {
  // Initial measurement: zero violations for each of these rules.
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-sparse-arrays': 'error',
  'no-unsafe-finally': 'error',
  'valid-typeof': 'error',
};

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', '.agents/**',
    'graphify-out/**', 'scripts/**/vendor/**', '**/generated/**'] },
  {
    files: ['src/**/*.{js,jsx}', 'planeje-mcp/src/**/*.ts', 'supabase/functions/**/*.{js,ts}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 } },
    plugins: { quality },
    rules: { ...safety, 'quality/max-lines': ['warn', { max: 350 }] },
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, globals: { ...globals.node, Deno: 'readonly' } },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'no-undef': 'warn', 'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn' },
  },
];
