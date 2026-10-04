import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/.expo/**', '**/dist/**', 'supabase/functions/_shared/core.mjs', 'apps/web/next-env.d.ts', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-undef': 'off',
    },
  },
  { files: ['**/*.cjs', '**/*.js', 'scripts/**/*.mjs', 'apps/mobile/scripts/**/*.mjs'], languageOptions: { globals: { process: 'readonly', module: 'writable', require: 'readonly', console: 'readonly', __dirname: 'readonly' } }, rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['supabase/functions/**/*.ts', 'tests/**/*.ts', 'apps/mobile/src/lib/log.ts'], rules: { 'no-console': 'off' } },
);
