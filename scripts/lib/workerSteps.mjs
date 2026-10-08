// 파이프라인 단계 셋(수집·분석·반영)의 진입점 표 — 각 스크립트가 export 하는 `main(argv, hooks)`. 로컬(`scripts/data.mjs`)과 서버 워커(`worker/entry/run.mjs`, ADR-028)가
// 같은 표를 쓴다. 동적 import 라 고른 것만 읽는다(Vercel 사이트 빌드의 `pull` 이 수집·분석 의존성까지 읽지 않게 — data.mjs 머리 주석). 번들(esbuild)은 문자열 상수 import 를 그대로 품는다.
export const PIPELINE_STEPS = Object.freeze({
  collect: () => import('../collect-blog.mjs'),
  analyze: () => import('../analyze-candidates.mjs'),
  apply: () => import('../apply-approved.mjs'),
});

/** 단계 하나를 같은 프로세스에서 부른다. `main` 이 아무것도 안 돌려주면 0. */
export async function runPipelineStep(name, argv, hooks) {
  if (!Object.hasOwn(PIPELINE_STEPS, name)) throw new Error(`모르는 단계: ${name}`);
  const { main } = await PIPELINE_STEPS[name]();
  return (await main(argv, hooks)) ?? 0;
}
