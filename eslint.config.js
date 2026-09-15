import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    /*
     * Untitled UI 에서 그대로 가져온 소스. 우리가 손으로 고치는 파일이 아니라
     * `npx untitledui add` 로 다시 받으면 덮어쓰이는 자리다.
     * 그래서 상류 코드 스타일을 우리 규칙에 맞추려 편집하지 않고, 이 폴더에서만 규칙을 끈다.
     * 우리 코드(src/components/layout, src/pages 등)에는 규칙이 그대로 적용된다.
     */
    files: ['src/components/base/**/*.{ts,tsx}', 'src/components/foundations/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
);
