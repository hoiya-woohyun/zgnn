// `pnpm data <하위 명령>` — 데이터 명령의 진입점 하나(ADR-024 결정 1). package.json 의 `data:*` 13줄이 이 한 줄이 됐다.
// 코드를 옮기지 않는다 — 각 스크립트가 `main(argv)` 를 export 하고 여기는 고르기만 한다(직접 `node scripts/x.mjs` 도 그대로 돈다).
// 하위 명령의 모듈은 **고른 것만** 동적으로 불러온다: Vercel 빌드의 `pull` 이 수집·분석 의존성까지 읽지 않게, `eval` 의 확장자 훅이 그 전에 걸리게.
// 인자 없음은 상주 워커 자리다(docs/todo/17 T3) — 지금은 사용법만 찍는다.

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
  analyze   안 읽은 글을 Claude 로 읽어 장소 후보(candidates)를 만든다           --limit N · --dry-run · --no-geo · --no-verify · --no-homepage · --dump
  apply     승인된 후보를 places 에 반영한다(기존 장소는 빈 칸만 채움)             --dry-run
  once      collect(--only-requests) → analyze → apply 를 한 번 — 분석은 아직 기본 동작(미분석 최대 50건 · claude -p 최대 50회), 요청 글만은 T3
  pull      src/data/*.json 을 DB 최신으로(Vercel 빌드가 부른다) — 결과가 비면 덮지 않고 멈춘다
  logout    세션을 만료 전에 지운다
  eval      추출 정확도 — golden [--force] · extract [--limit N] [--only …] [--refresh] · score [--prompt 버전]

  (없음)    상주 워커 자리 — 상주 워커는 T3 에서 온다(docs/todo/17). 지금은 이 사용법만 찍는다.`;

async function runStep(name, argv) {
  const { main } = await STEPS[name]();
  return (await main(argv)) ?? 0;
}

const [sub, ...rest] = process.argv.slice(2);

try {
  if (sub === undefined) {
    console.log(USAGE);
  } else if (sub === 'once') {
    // 한 단계가 실패하면(던지거나 0 이 아닌 코드) 거기서 멈춘다 — 수집이 죽었는데 분석·반영을 이어 가면 무엇이 돌았는지 흐려진다.
    for (const [name, argv] of [['collect', ['--only-requests']], ['analyze', []], ['apply', []]]) {
      console.log(`\n▶ ${name}`);
      const code = await runStep(name, argv);
      if (code !== 0) {
        process.exitCode = code;
        break;
      }
    }
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
