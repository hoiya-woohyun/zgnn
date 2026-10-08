// 서버 워커 번들(ADR-028 결정 9, todo/20 T1) — `worker/entry/run.mjs` 와 거기서 닿는 `scripts/`·`src/lib/` 를 `worker/api/run.mjs` 한 파일로 묶는다.
// 왜 묶나: Vercel 은 `worker/` 에만 의존성을 설치한다. `../scripts` 를 그대로 import 하면 scripts/lib 에서 시작한 패키지 해석이 레포 루트 node_modules 를 찾다 실패하고,
// 앱 TS(확장자 없는 import 포함)도 끼어 있다. esbuild 는 둘 다 푼다. 밖에 남기는 것은 `claude` 바이너리 패키지뿐이다(worker/vercel.json 의 includeFiles).
// 결과는 커밋하지 않는다(worker/.gitignore). 배포: `pnpm worker:build && cd worker && vercel deploy --prod`(git 자동 배포는 꺼져 있다 — 결정 2).
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTFILE = fileURLToPath(new URL('../worker/api/run.mjs', import.meta.url));

// 번들이 반드시 품어야 하는 것 — 빠지면 배포는 되고 첫 버튼에서야 죽는다.
const REQUIRED_INPUTS = ['scripts/collect-blog.mjs', 'scripts/analyze-candidates.mjs', 'scripts/apply-approved.mjs', 'scripts/lib/workerCycle.mjs', 'scripts/lib/workerRemote.mjs'];

// 단계 스크립트는 파일 끝에서 `isDirectRun(import.meta.url)` 이면 스스로 돈다. 한 파일로 묶이면 import.meta.url 이 셋 다 번들 하나라,
// 누가 `node worker/api/run.mjs` 를 치는 순간 수집·분석·반영이 한꺼번에 돈다. 번들 안에서는 늘 거짓이다.
const neverDirectRun = {
  name: 'never-direct-run',
  setup(b) {
    b.onResolve({ filter: /\/isDirectRun\.mjs$/ }, () => ({ path: 'isDirectRun', namespace: 'zgnn-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'zgnn-stub' }, () => ({ contents: 'export const isDirectRun = () => false;', loader: 'js' }));
  },
};

// 서버에는 git 이 없다 — 심장의 version 칸(`workers.version`)에 실릴 sha 를 빌드 때 박는다. 못 읽으면 'unknown'.
function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

const result = await build({
  entryPoints: [fileURLToPath(new URL('../worker/entry/run.mjs', import.meta.url))],
  outfile: OUTFILE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@anthropic-ai/*'],
  // 묶인 CJS 의존성이 `require` 를 찾는다 — ESM 출력에는 없다.
  banner: { js: "import { createRequire as __zgnnCreateRequire } from 'node:module';\nconst require = __zgnnCreateRequire(import.meta.url);" },
  plugins: [neverDirectRun],
  define: { 'process.env.ZGNN_WORKER_VERSION': JSON.stringify(gitSha()) },
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const inputs = new Set(Object.keys(result.metafile.inputs).map((p) => relative(ROOT, p)));
const missing = REQUIRED_INPUTS.filter((p) => !inputs.has(p));
if (missing.length > 0) {
  console.error(`번들에 빠진 진입점: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`worker/api/run.mjs — ${(statSync(OUTFILE).size / 1024).toFixed(0)}KB · 입력 ${inputs.size}개`);
