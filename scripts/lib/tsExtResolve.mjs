// `node --import ./scripts/lib/tsExtResolve.mjs` — 확장자 없는 상대 import(`./dogFee`)를 `.ts` 로 한 번 더 찾아 준다.
// 앱 코드(src/lib)는 번들러 해석(moduleResolution: bundler)이라 확장자를 안 쓰고, node 의 --experimental-strip-types 는
// 확장자를 추측하지 않는다. petPolicy.ts 는 런타임 import 가 전부 `.mjs` 라 그냥 되지만 eligibility.ts 는 안 된다.
// 앱 코드의 import 경로를 고치는 대신(tsconfig 까지 번진다) 스크립트 쪽에서 메운다. `@/` 별칭은 다루지 않는다 — 판정 경로에 없다.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw e;
    }
  },
});
