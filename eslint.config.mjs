import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.tmp/**', '**/.cache/**'],
  },

  // ── Base configs ────────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,

  // ── TypeScript source rules ─────────────────────────────
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      // ── Unused vars: allow underscore-prefixed ──
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Explicit return types — off for flexibility ──
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // ── Allow empty functions (lifecycle hooks etc.) ──
      '@typescript-eslint/no-empty-function': 'off',

      // ── no-explicit-any: warn (dynamic JSON parsing codebase) ──
      '@typescript-eslint/no-explicit-any': 'warn',

      // ── Prefer const ──
      'prefer-const': 'warn',

      // ── Console: warn by default (overridden for CLI below) ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ── CLI files — console.log is expected output ──────────
  {
    files: ['packages/core/src/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── Config / test files — relaxed ───────────────────────
  {
    files: ['**/*.config.ts', '**/*.config.mjs', '**/tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
