import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/*
 * 테스트는 순수 함수(lib/petPolicy)만 다룬다. DOM 이 필요 없어 jsdom 도 두지 않는다.
 * Next 빌드와는 완전히 별개의 파이프라인이라 vite 쪽 설정이 여기 따로 있다.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
