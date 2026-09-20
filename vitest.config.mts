import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/*
 * 테스트는 순수 함수(lib/petPolicy, lib/appHistory, scripts/ 의 수집·병합 로직)만 다룬다. DOM 이 필요 없어 jsdom 도 두지 않는다.
 * Next 빌드와는 완전히 별개의 파이프라인이라 vite 쪽 설정이 여기 따로 있다.
 *
 * React 플러그인은 두지 않는다. 그 플러그인이 주는 것은 Fast Refresh 와 JSX 변환인데,
 * 테스트에 화면이 없어 새로고침이 필요 없고 JSX 는 vite 의 esbuild 가 tsconfig 의
 * `jsx: react-jsx` 를 그대로 따라 변환한다. 나중에 .tsx 테스트를 더해도 마찬가지다.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
  },
});
