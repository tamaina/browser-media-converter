import js from '@eslint/js';
import misskey from '@misskey-dev/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/playground-output/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      '@misskey-dev': misskey,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@misskey-dev/no-null': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
