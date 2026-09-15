import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next', 'out', 'node_modules', 'public', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      /*
       * 정적 내보내기(output: 'export')라 next/image 의 최적화 서버가 없다.
       * images.unoptimized 로 켜 두면 next/image 는 <img> 를 그대로 그리면서
       * 런타임만 더한다. 그래서 장소 사진은 <img> 로 둔다.
       */
      '@next/next/no-img-element': 'off',
    },
  },
  {
    /*
     * Untitled UI 에서 그대로 가져온 소스. 우리가 손으로 고치는 파일이 아니라
     * `npx untitledui add` 로 다시 받으면 덮어쓰이는 자리다.
     * 그래서 상류 코드 스타일을 우리 규칙에 맞추려 편집하지 않고, 이 폴더에서만 규칙을 끈다.
     * 우리 코드(src/components/layout, src/screens 등)에는 규칙이 그대로 적용된다.
     */
    files: ['src/components/base/**/*.{ts,tsx}', 'src/components/foundations/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // 서비스워커는 브라우저 문서가 아니라 워커 전역에서 돈다.
    files: ['src/app/sw.ts'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
);
