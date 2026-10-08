// `node --import ./scripts/lib/tsExtResolve.mjs` — 앱 TS 를 node 에서 부를 때 번들러가 메워 주던 두 가지를 메운다.
// 1. 확장자 없는 상대 import(`./dogFee`)를 `.ts` 로 한 번 더 찾는다. 앱 코드(src/lib)는 번들러 해석(moduleResolution: bundler)이라
//    확장자를 안 쓰고, node 의 --experimental-strip-types 는 확장자를 추측하지 않는다. petPolicy.ts 는 런타임 import 가 전부 `.mjs` 라
//    그냥 되지만 eligibility.ts 는 안 된다.
// 2. `.json` import 에 `with { type: 'json' }` 를 얹는다. places.ts 가 `import placesJson from '../data/places.json'` 이라 node 는
//    ERR_IMPORT_ATTRIBUTE_MISSING 으로 멈춘다(`pnpm data coverage` 가 PLACES 를 그대로 쓴다 — 판정 입력을 따로 만들면 화면과 갈린다).
// 앱 코드의 import 경로를 고치는 대신(tsconfig 까지 번진다) 스크립트 쪽에서 메운다. `@/` 별칭은 다루지 않는다 — 판정 경로에 없다.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.json') && !context.importAttributes?.type) {
      const importAttributes = { ...context.importAttributes, type: 'json' };
      return { ...nextResolve(specifier, { ...context, importAttributes }), importAttributes };
    }
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
