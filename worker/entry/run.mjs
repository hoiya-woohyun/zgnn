// 서버 워커 진입점(ADR-028) — `pnpm worker:build` 가 이 파일을 `worker/api/run.mjs` 로 묶는다(결정 9).
// T1: 번들이 단계 진입점을 품고 레포 밖에서 import 되는지만 본다. 인증·홉은 T5 에서 이 파일을 갈아 끼운다.
import { PROMPT_VERSION } from '../../scripts/analyze/extractPlaces.mjs';
import { createWorkerCycle } from '../../scripts/lib/workerCycle.mjs';
import { PIPELINE_STEPS } from '../../scripts/lib/workerSteps.mjs';

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') return new Response('Not Found', { status: 404 });
  const steps = {};
  for (const [name, load] of Object.entries(PIPELINE_STEPS)) steps[name] = typeof (await load()).main;
  return Response.json({ promptVersion: PROMPT_VERSION, cycle: typeof createWorkerCycle, steps });
}
