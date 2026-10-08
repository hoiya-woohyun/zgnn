// 서버 워커 진입점(ADR-028) — `pnpm worker:build` 가 이 파일을 `worker/api/run.mjs` 로 묶는다(결정 9). 본체는 `scripts/lib/workerRemote.mjs` 이고,
// 여기는 Vercel 런타임에만 있는 것(프로세스 env · `waitUntil` · 프로덕션 URL)을 꽂는다.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { waitUntil } from '@vercel/functions';
import { WORKER_RUNTIME } from '../../scripts/analyze/extractPlaces.mjs';
import { HOP_HEADER, handleRun, runHop } from '../../scripts/lib/workerRemote.mjs';

const log = (line) => console.log(`[worker] ${line}`);
// `scripts/build-worker.mjs` 가 빌드 때 git sha 로 바꿔 박는다 — 서버에는 git 이 없다(심장의 version 칸).
const VERSION = process.env.ZGNN_WORKER_VERSION ?? null;

// ── 모듈 로드 때 한 번: `claude` 자식이 읽을 프로세스 env ─────────────────────
// 표식이 있어야 `claudeChildEnv` 가 setup-token 을 자식에 넘긴다(결정 6). HOME 은 쓸 수 있는 곳이어야 CLI 가 설정 파일을 만든다(/var/task 는 읽기 전용).
process.env.ZGNN_WORKER_RUNTIME = WORKER_RUNTIME;
process.env.HOME = '/tmp/claude-home';
process.env.TMPDIR = '/tmp';
try {
  mkdirSync(process.env.HOME, { recursive: true });
} catch (e) {
  log(`HOME 을 못 만듦(${e.message}) — claude 가 설정을 못 쓸 수 있다`);
}

// `runClaudeCli` 는 `spawn('claude')` 로 PATH 에서 찾는다. 플랫폼 패키지의 바이너리 폴더를 PATH 앞에 둔다 — 래퍼의 `bin/claude.exe` 는 postinstall 이
// 채우는데 빌드 머신과 런타임이 같아야 맞고, 이름이 `claude` 가 아니라 PATH 로는 안 잡힌다. 1MB 이하는 자리표시(셸 스텁)다.
// 못 찾아도 import 는 실패하지 않는다 — 첫 분석이 not_found 로 말한다(macOS 에서 번들을 import 하면 darwin 패키지라 여기로 온다).
const requireHere = createRequire(import.meta.url);
function claudeBinDir() {
  for (const pkg of ['@anthropic-ai/claude-code-linux-x64', '@anthropic-ai/claude-code']) {
    let dir;
    try {
      dir = dirname(requireHere.resolve(`${pkg}/package.json`));
    } catch {
      continue;
    }
    for (const name of ['claude', 'bin/claude']) {
      const file = join(dir, name);
      if (existsSync(file) && statSync(file).size > 1_000_000) return dirname(file);
    }
  }
  return null;
}
const binDir = claudeBinDir();
if (binDir) process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ''}`;
else log('claude 바이너리(linux-x64)를 못 찾음 — 분석은 not_found 로 실패한다');

/**
 * 다음 홉. 프로덕션 도메인으로만 — 배포 URL 은 Deployment Protection 뒤라 막히고, 프리뷰가 프로덕션 코드를 부르면 안 된다.
 * 깊이(`HOP_HEADER`)를 실어 받는 쪽이 `MAX_HOPS` 에서 끊게 한다. 응답 상태만 남긴다(본문·토큰은 찍지 않는다).
 */
async function chain(token, nextHop) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV !== 'production' || !host) {
    log('프로덕션이 아니라 사슬을 걸지 않는다 — 남은 일은 다음 버튼이나 로컬 워커가');
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, [HOP_HEADER]: String(nextHop) };
  const res = await fetch(`https://${host}/api/run`, { method: 'POST', headers, signal: AbortSignal.timeout(30_000) });
  await res.body?.cancel();
  log(`다음 홉(${nextHop + 1}) 호출 — ${res.status}`);
}

export function POST(request) {
  return handleRun(request, { waitUntil, startHop: (token, hop) => runHop(token, { hop, chain, version: VERSION }) });
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
