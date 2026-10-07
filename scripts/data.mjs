// `pnpm data <하위 명령>` — 데이터 명령의 진입점 하나(ADR-024 결정 1). package.json 의 `data:*` 13줄이 이 한 줄이 됐다.
// 코드를 옮기지 않는다 — 각 스크립트가 `main(argv)` 를 export 하고 여기는 고르기만 한다(직접 `node scripts/x.mjs` 도 그대로 돈다).
// 하위 명령의 모듈은 **고른 것만** 동적으로 불러온다: Vercel 빌드의 `pull` 이 수집·분석 의존성까지 읽지 않게, `eval` 의 확장자 훅이 그 전에 걸리게.
// 인자 없음은 상주 워커, `once` 는 그 한 바퀴다(scripts/worker.mjs, docs/todo/17 T3). 둘 다 단계를 아래 `runStep` 으로 부른다.

const STEPS = {
  login: () => import('./login.mjs'),
  logout: () => import('./logout.mjs'),
  pull: () => import('./pull-db.mjs'),
  collect: () => import('./collect-blog.mjs'),
  analyze: () => import('./analyze-candidates.mjs'),
  apply: () => import('./apply-approved.mjs'),
  eval: async () => {
    // 앱의 TS(eligibility.ts)가 확장자 없는 상대 import 를 쓴다 — 예전 `--import ./scripts/lib/tsExtResolve.mjs` 와 같은 훅을 불러오기 전에 건다.
    await import('./lib/tsExtResolve.mjs');
    return import('./eval-extract.mjs');
  },
};

const USAGE = `사용법: pnpm data <하위 명령> [인자…]

  login     운영자 로그인 — 세션을 키체인에 넣는다(하루 한 번, 사용자 터미널에서만)
  collect   네이버 검색 API 로 글 목록(제목·링크·날짜)을 blog_posts 에 모은다      --only-requests
  analyze   안 읽은 글을 Claude 로 읽어 장소 후보(candidates)를 만든다           --limit N · --requested-only · --dry-run · --no-geo · --no-verify · --no-homepage · --dump
  apply     승인된 후보를 places 에 반영한다(기존 장소는 빈 칸만 채움)             --dry-run
  once      워커의 한 바퀴 — 할 것만: 추가 수집 요청 → 요청 글 분석(requested_at) → 승인 반영. 없으면 "할 일 없음"   --dry-run(계획만)
  pull      src/data/*.json 을 DB 최신으로(Vercel 빌드가 부른다) — 결과가 비면 덮지 않고 멈춘다
  logout    세션을 만료 전에 지운다
  eval      추출 정확도 — golden [--force] · extract [--limit N] [--only …] [--refresh] · score [--prompt 버전]

  (없음)    상주 워커 — 터미널에 떠서 60초마다 DB 를 보고 once 를 돈다. 매일 09:00(KST) 키워드 전체 수집. 끝내려면 Ctrl-C
            저수지(요청 안 된 미분석 글)는 자동으로 읽지 않는다 — /admin 의 「지금 분석」 요청으로만(ADR-024 결정 4)
  help      이 사용법`;

async function runStep(name, argv, hooks) {
  const { main } = await STEPS[name]();
  return (await main(argv, hooks)) ?? 0;
}

async function runWorker(mode, argv) {
  const { main } = await import('./worker.mjs');
  return main(argv, { mode, runStep });
}

const [sub, ...rest] = process.argv.slice(2);

try {
  if (sub === undefined) {
    process.exitCode = await runWorker('resident', []);
  } else if (sub === 'once') {
    // 한 단계가 실패하면(던지거나 0 이 아닌 코드) 거기서 멈춘다 — 수집이 죽었는데 분석·반영을 이어 가면 무엇이 돌았는지 흐려진다.
    process.exitCode = await runWorker('once', rest);
  } else if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(USAGE);
  } else if (Object.hasOwn(STEPS, sub)) {
    process.exitCode = await runStep(sub, rest);
  } else {
    console.error(`모르는 하위 명령: ${sub}\n\n${USAGE}`);
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
