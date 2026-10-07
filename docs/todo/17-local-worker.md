# 17. 로컬 워커 — `pnpm data` 하나가 DB 를 보고 수집·분석·반영을 그때 돌리고, 화면이 진행을 실시간으로 본다

> 최종 수정: 2026-10-07 (v8: 리뷰 반영 — 아래 「리뷰 반영」 절. 돌지 못한 요청은 queued 로 되돌림(3번이면 done), 진척이면 바로 다시, `/admin` 승인은 approved 를 거치지 않음(쌍둥이), `requested_at` backfill 마이그레이션(미적용))
> 이전 2026-10-07 (v7: T6 구현 — 검수 대기 칸 맨 위 「저수지 N건 분석」(`adminRequests.ts` · `adminPageAnalyzeRequest.tsx`), 머리글 `· 요청 N건 대기`)
> 이전 2026-10-07 (v6: T5 구현 — `/admin/ops` 워커 칸(배지·단계·심장·진행 막대)·Realtime 구독(`adminOpsRealtime.ts`), `/admin` 머리글 워커 한 줄·경고 띠, `createAdminClient` 에 `accessToken` 콜백)
> 이전 2026-10-07 (v5: T4.1 구현 — 워커 Realtime 구독 `workerRealtime.mjs`, 채널 토큰은 `createSupabase` 의 `realtime.accessToken` 콜백(`setAuth` 는 heartbeat 가 되돌린다), 이벤트가 깨운 단계만 재시도 간격 건너뜀, `--no-realtime`)
> 이전 2026-10-07 (v4: T3 구현 — 상주 워커 `scripts/worker.mjs`(`pnpm data` · `once` · `once --dry-run`), 순수 판단 `workerLoop.mjs`, 세기 `workerQueue.mjs`, 심장 `workerHeartbeat.mjs`, `progress`·`--requested-only`·`requested_at` 찍기·재로그인·한도 휴식)
> 이전 2026-10-07 (v3: T2 원격 적용·롤백 실측 — publication 은 여섯 표)
> 이전 2026-10-07 (v2: T1 구현 — 죽은 스크립트 넷 삭제·진입점 `scripts/data.mjs`, `package.json` 의 `data:*` 13줄 → `data` 1줄)
> 이전 2026-10-07 (v1: 신설 — 설계·태스크. 코드 없음. 결정은 [ADR-024](../decisions/ADR-024-local-worker-and-db-queues.md))

**한 줄:** `package.json` 의 `data:*` 13줄을 `data` 한 줄로 줄이고, 그 명령이 터미널에 상주하며 `collect_requests` · `blog_posts.analyzed_at` · `candidates.approved` · `pipeline_requests` 를 보고 있다가 필요한 순간 collect → analyze → apply 를 돈다. 도는 동안 `workers` · `pipeline_runs.progress` 가 바뀌고 `/admin/ops` 가 그걸 구독해 "분석 중 12/40" 을 그린다.

규약은 [15](15-ops-dashboard.md) 와 같다 — 한 태스크 = 한 커밋, 태스크마다 파일·수용 기준·검증. `🧑` 는 사용자 터미널 몫, `🙋` 는 사용자가 정할 것.

## 이 계획이 서 있는 결정 — [ADR-024](../decisions/ADR-024-local-worker-and-db-queues.md)

1. 진입점 하나 `pnpm data <sub>`. 죽은 스크립트 다섯은 지운다.
2. 큐는 기존 표의 상태 칸. 새로 더하는 것은 `pipeline_requests` · `workers` 표, `pipeline_runs.progress` · `blog_posts.requested_at` 칸.
3. 워커는 터미널 상주. 깨우기 = Realtime(주) + 60초 폴링(안전망) + 하루 1회 타이머(키워드 수집). 전부 같은 멱등 `wake()`.
4. 자동 분석은 **요청 글**(`requested_at`)뿐. 저수지는 「지금 분석 N건」 요청으로만.
5. 세션 만료는 TTY 에서 그 자리에서 묻는다(ADR-016 유지). `claude` 한도는 `rate-limited` 로 잔다.
6. 화면은 `workers` · `pipeline_runs` 를 구독한다(ADR-023 v2).

## 순서와 의존

```
T1 스크립트 정리·진입점 ──▶ T3 워커 루프(폴링) ──▶ T4 Realtime(워커) ──▶ T5 화면 구독·배지·진행률 ──▶ T6 「지금 분석」 버튼
T2 마이그레이션 ──────────┘(T3 이 workers·progress 를 쓴다)                                    └──▶ 🧑 실측
```

T1 은 DB 와 무관하니 먼저. T2 는 🧑 `db push` 가 필요하다(쓰기 — 사용자 확인 뒤).

## 단계와 상태

### T1. 스크립트 정리와 진입점 `scripts/data.mjs`

- [x] **T1.1 죽은 스크립트 삭제** — `scripts/fetch-blog-images.mjs` · `optimize-images.mjs` · `fill-homepage.mjs` · `review-candidates.mjs`(`scripts/analyze/reviewCandidates.mjs` 중 `/admin` 이 안 쓰는 부분도) 파일 삭제. `seed-db.mjs` · `normalize.mjs` 는 **파일만** 남기고 스크립트 줄에서 뺀다. 그 파일들만 보던 테스트·lib 가 있으면 같이 지운다(`placeFields` 는 pull 이 쓰니 남는다).
  수용 기준: `pnpm test` · `pnpm lint` 통과, `grep -rn "data:review\|data:homepage\|fetch-images" src scripts docs` 가 docs 의 이력 문장 말고는 0.
  ✅ 2026-10-07 — 파일 넷 삭제(`fetch-blog-images` · `optimize-images` · `fill-homepage` · `review-candidates`). `reviewCandidates.mjs` 는 `/admin` 이 쓰는 묶기·미리보기·표식만 남기고 출력(`formatGroup` · `formatMarkdown` · `factsLine`)·인자(`parseReviewArgs` · `resolveIds`)·라벨을 지웠다(테스트 셋도). `seed-db` · `normalize` 는 머리 주석에 직접 실행 한 줄. 계획과 다른 것: 반영 요약 줄의 `(pnpm data:review status)` 안내도 뺐다(없는 명령을 가리켰다) · `formatReviewSummary` 는 남겼다 — `/admin/ops` 가 옛 승인·반려 실행 행을 그 함수로 읽는다 · 삭제 넷은 같은 작업 트리의 다른 세션 커밋(`f427b35`)에 섞여 들어갔다.
- [x] **T1.2 진입점 `scripts/data.mjs`** — `pnpm data <sub>` 를 받아 분기. `collect-blog.mjs` · `analyze-candidates.mjs` · `apply-approved.mjs` · `pull-db.mjs` · `login.mjs` · `logout.mjs` · `eval-extract.mjs` 는 각각 `main(argv)` 를 export 하고, `import.meta.url` 이 진입점일 때만 스스로 돈다(기존 직접 실행도 깨지지 않게). `eval` 의 `--import ./scripts/lib/tsExtResolve.mjs` 는 `data.mjs` 가 `eval` 일 때 `register()` 로 건다.
  `package.json`: `data:*` 전부 삭제 → `"data": "node --experimental-strip-types --no-warnings scripts/data.mjs"`. `vercel.json` `buildCommand` → `pnpm data pull && pnpm build`.
  수용 기준: `pnpm data pull` 이 지금의 `data:pull` 과 같은 파일을 만든다(바이트 동일, `dataJson` 보장). `pnpm data` 인자 없음·모르는 하위 명령이면 사용법 한 화면. `pnpm data once` 는 T3 전까지 "collect(요청만) → analyze(요청 글만) → apply" 를 한 번 돈다.
  문서: README 「실행」 명령 표, [architecture/data-pipeline.md](../architecture/data-pipeline.md) 체인, CLAUDE.md 표의 `pnpm data:*` 언급.
  ✅ 2026-10-07 — `scripts/data.mjs` + 일곱 스크립트의 `export async function main(argv)` · 파일 끝 직접 실행 가드(`scripts/lib/isDirectRun.mjs` — realpath 비교, 일곱이 같이 쓴다). 하위 명령 모듈은 **고른 것만 동적 import** — `pull` 이 수집·분석 의존성을 안 읽고, `eval` 은 `tsExtResolve.mjs` 를 import 해 거는 것으로 충분했다(그 파일이 `registerHooks` — 동기·같은 스레드라 `module.register()` 가 필요 없다). `main` 은 exit code 를 돌려주고 진입점이 `process.exitCode` 로 싣는다(자연 종료 — 요약 줄이 안 잘린다). `pnpm data pull` 결과는 옛 `pull-db.mjs` 와 **바이트 동일**(같은 DB 상태에서 두 출력 `cmp`), `pnpm data eval score` 는 옛 명령과 출력이 같다. 안내 문구·화면 힌트(`/admin` 의 `pnpm data analyze` 등)도 새 이름으로.
  계획과 다른 것: ① analyze 의 키 확인 helper 안 `process.exit` 넷(`checkedKeys`·`resolveKeys`)은 남겼다 — 중첩 함수라 return 으로 못 바꾸고, 던지게 바꾸면 메시지 모양이 바뀐다. `once` 에서도 그 자리는 그대로 프로세스를 끝낸다. ② collect 의 SIGINT 핸들러는 끝나면 뗀다 — `once` 에서 뒤 단계의 Ctrl-C 가 끝난 수집 행을 실패로 덮지 않게. ③ `once` 는 한 단계가 던지거나 0 이 아닌 코드를 내면 거기서 멈추고 그 코드로 나간다. ④ `reviewer_note` 의 `[data:apply]`·`[data:review]` 태그는 DB 에 박힌 값이라 그대로 뒀다. ⑤ `once` 의 analyze 는 수용 기준의 "요청 글만" 이 **아니다** — `requested_at` 필터가 T3 몫이라 지금은 기본 동작(미분석 최대 50건, 요청 글 먼저)이다. 사용법·README 에 적어 뒀다.

### T2. 마이그레이션 `<ts>_local_worker.sql`

- [x] **T2.1 표·칸** —
  `pipeline_requests`: `id uuid pk default gen_random_uuid()` · `kind text check in ('collect','analyze','apply')` · `args jsonb`(`{limit: 20}` 같은 수만) · `status text check in ('queued','taken','done') default 'queued'` · `requested_at timestamptz default now()` · `requested_by uuid default auth.uid()` · `taken_at` · `run_id uuid references pipeline_runs`. 인덱스 `(status, requested_at)`.
  `workers`: `host text pk` · `last_seen_at timestamptz` · `phase text check in ('idle','collect','analyze','apply','login-needed','rate-limited')` · `run_id uuid` · `started_at` · `version text`(git sha 짧게).
  `pipeline_runs` 에 `progress jsonb`. `blog_posts` 에 `requested_at timestamptz`(인덱스 `(analyzed_at, requested_at)` 부분 — `where analyzed_at is null`).
  권한: 둘 다 RLS `is_operator()`, `grant select, insert, update … to authenticated`(delete 없음 — `narrow_grants` 뒤라 명시). anon 없음.
  Realtime: `alter publication supabase_realtime add table workers, pipeline_runs;` + `alter table … replica identity full`(UPDATE 의 old 값이 필요 없으니 default 로 충분한지 확인 — 필요 없으면 default).
  수용 기준: 롤백 트랜잭션 실측 — 운영자 insert/update 되고 delete 42501, anon 전부 42501. `select * from pg_publication_tables where pubname='supabase_realtime'` 에 두 표.
  🧑 `db push --linked`(쓰기 — 사용자 확인). → [ADR-016](../decisions/ADR-016-secrets-by-login.md)·[05](05-security.md) 표에 두 줄.
  ✅ 2026-10-07 `supabase/migrations/20261007140000_local_worker.sql`(b335ce8) **원격 적용**(사용자 터미널 `db push` — Claude 의 push 는 권한 분류기가 막는다). 롤백 실측: 운영자 insert/update·upsert 됨 · 운영자 delete 42501 · 비운영자 insert 42501 · anon select 42501 · 잔여 0행 · publication 에 **여섯 표**(`blog_posts`·`candidates`·`collect_requests`·`pipeline_requests`·`pipeline_runs`·`workers` — 워커가 T4 에서 앞 넷을 구독하므로 계획의 둘이 아니라 여섯). 계획과 다른 것: `blog_posts` 인덱스는 `(requested_at) where analyzed_at is null`(조건 안에서 `analyzed_at` 은 늘 null), `workers.run_id` 에 FK 없음(실행 행보다 심장이 먼저 쓰인다), replica identity default 라 UPDATE 이벤트에 old 값이 없다 — "`requested_at` 이 새로 생김" 은 구별 못 하고 `wake()` 멱등에 기댄다.
  ⏳ **backfill 미적용** — `20261007150000_requested_at_backfill.sql`(리뷰 1): 칸이 생기기 전에 끝난 추가 수집 요청의 글 24건(2026-10-07 원격 실측, 롤백 트랜잭션으로 24행 갱신 확인 · 잔여 0)에 `requested_at = done_at`. 🧑 `db push` 전까지 그 24건은 요청 글 앞줄에서 빠진다 — 분석이 `collect_requests.post_urls` 를 따로 읽던 길을 걷어내서다(리뷰 14).
- [x] **T2.2 `ops_overview` 에 워커** — `workers` 전부(`host`·`last_seen_at`·`phase`·`run_id`)와 `pipeline_requests` 의 queued 수를 json 에 더한다. 화면 첫 그림용(구독은 그 뒤 갱신).
  ✅ 2026-10-07 같은 마이그레이션 안. `src/lib/adminOps.ts` 의 `TOpsOverview` 에 `workers?`·`requestsQueued?`, `TPipelineRun` 에 `progress?`(optional). `RUN_COLUMNS` 에는 `progress` 를 아직 안 넣었다 — T5 에서.

### T3. 워커 루프(폴링부터)

- [x] **T3.1 `scripts/lib/workerLoop.mjs`** — 순수 부분: `wake()` 디바운스("도는 중이면 끝난 뒤 한 번 더" — 플래그 하나), 한 바퀴 순서, 요청 집기(`queued` → `taken`, `taken` 10분 초과도 다시 집는다), 다음 타이머 시각(09:00 KST). 단위 테스트.
  ✅ 2026-10-07 — `createWaker` · `nextDailyAt` · `pickRequests` · `planCycle` · `isDue`/`recordRun` · `claudeResetAt` · `parseOnceArgs` + `workerLoop.test.mjs`(26). 세기는 `scripts/lib/workerQueue.mjs`(`head: true` count 셋 + `pipeline_requests` 행. 스키마 확인은 행을 받는 `limit(1)` — head 응답은 오류 code 가 비어 온다).
  계획과 다른 것: ① `planCycle` 은 바퀴 앞에서 한 번이 아니라 **단계마다 다시** 부른다(이미 돈 단계는 `done` 이 거른다) — 수집이 찍은 `requested_at`·분석이 넣은 auto `approved` 를 같은 바퀴가 이어받게. ② **재시도 간격**(`isDue`)을 더했다 — 계속 403 인 요청 글·반영이 안 되는 승인 후보는 지워지지 않아, 그대로면 60초마다 analyze·apply 를 다시 돌려 `pipeline_runs` 가 분당 한 행씩 쌓인다. 끝난 직후 다시 센 수보다 늘었거나 30분이 지나야 폴링이 다시 깨운다(명시 요청·정기 수집은 예외). ③ `pipeline_requests` kind=collect 는 `--only-requests` 가 아니라 **키워드 전체** — 요청만이면 추가 수집 요청이 없을 때 아무것도 안 한다. ④ kind=analyze 는 요청 글 분석과 **따로** `--limit N`(여러 개면 가장 큰 수 · 없으면 10 · 상한 100). ⑤ 09:00 은 긴 `setTimeout` 이 아니라 **60초 폴링이 시각을 넘었는지 본다** — 맥이 잠든 동안 타이머 시계가 멈춰 하루짜리 타이머는 몇 시간 늦는다.
- [x] **T3.2 한 바퀴** — `collect(--only-requests)` → 요청 글에 `requested_at` 찍기(`collect-blog.mjs` 안) → `analyze` 는 `requested_at is not null` 만(기본 limit 은 그 수) → `apply`. `pipeline_requests` kind 별로는 그 단계만(analyze 는 `args.limit` 으로 저수지 포함). 타이머는 `collect`(키워드 전체)만.
  `adminReanalyze.ts` 가 `analyzed_at = null` 로 되돌릴 때 `requested_at = now()` 도 찍는다.
  ✅ 2026-10-07 — `scripts/worker.mjs` 가 `data.mjs` 의 `runStep` 으로 각 `main` 을 부른다. `once` 는 할 것이 없으면 "할 일 없음" exit 0, `once --dry-run` 은 상태·계획만(단계 모듈을 부르지 않는다 · 모르는 인자는 exit 2). analyze `--requested-only` 는 기본 고르기(집중 제목·한 가게 블로그·추가 수집 앞줄)를 **통째로 건너뛰고** `requested_at` 오래된 순(블로그당 상한은 유지), 0건이면 실행 행 없이 exit 0. collect 는 요청이 담은 **미분석** 글에만 별도 update 로 `requested_at`(upsert 가 `ignoreDuplicates` 라) — 실패는 경고 한 줄. 요청 행은 단계 앞 `taken`(taken_at) → 뒤 `done`(run_id 는 실행 행이 선 뒤라 done 때 — FK), **실패해도 done**(남기면 10분마다 같은 실패).
  계획과 다른 것: ① 같은 프로세스에서 두 번 부르면 깨지던 것 둘을 고쳤다 — analyze 잠금이 exit 훅에만 풀려 두 번째 분석이 자기 pid 잠금에 막혔다(이제 `main` 끝에서 풀고 훅도 뗀다) · `readNaverCalls()` 가 프로세스 누계라 실행 행의 `naverCalls` 가 부풀었다(collect·analyze 가 시작 값을 뺀다). ② 워커는 한 단계가 실패해도 다음 단계로 간다(승인 반영은 분석 실패와 무관). `once` 는 T1 대로 멈춘다.
- [x] **T3.3 `workers` 심장과 `progress`** — 워커가 시작할 때 `workers` upsert(`phase: idle`), 15초마다 `last_seen_at`, 단계 들어갈 때 `phase`·`run_id`. `runLog.mjs` 에 `progress({done, total, current})` — 5초에 한 번만 쓴다(`tick` 과 같은 모양). `analyze` 가 글마다 부른다(`current` 는 글 제목 앞 20자 — `candidates` 에 이미 이름이 있으니 `error` 처럼 지울 이유가 없다).
  종료(SIGINT) 때 `phase: idle` · `run_id: null` 로 닫고 나간다 — 못 닫고 죽으면 `last_seen_at` 이 5분 넘어 "워커 없음".
  ✅ 2026-10-07 — `scripts/lib/workerHeartbeat.mjs`(시작 upsert 만 던진다 — 표가 없으면 거기서 멈춰 말한다. 그 뒤는 fail-soft 로 끊긴 순간·다시 붙은 순간만 한 줄). `version` 은 `git rev-parse --short HEAD`, 실패하면 null. SIGINT·SIGTERM 둘 다 잡고, 닫기를 3초와 race 한 뒤 exit(130·143). `runLog.mjs` 에 `progress()`(5초 스로틀, 심장과 따로 센다) · `PROGRESS_MS` · `NO_RUN.progress`, analyze 가 글마다 부른다(`current` = 제목 앞 20자).
  계획과 다른 것: ① `run_id` 를 밖으로 꺼낼 길이 없어(`main` 은 exit code 만) `runLog.mjs` 에 리스너 하나(`setRunListener`)를 뒀다 — 행이 선 뒤에만 알리고, 던져도 본업은 그대로. ② 수집 중 Ctrl-C 는 collect 자신의 핸들러도 실행 행을 닫고 exit 하려 해 **둘이 경쟁한다** — 먼저 끝난 쪽이 끝낸다. 워커 행이 못 닫혀도 5분 뒤 "워커 없음" 이라 들키는 쪽이다. ③ `once` 는 `workers` 행을 쓰지 않는다(상주가 아니다). ④ 인자 없는 `pnpm data` 는 T1 때 사용법만 찍던 무해한 명령이었는데 이제 진짜 수집·분석을 돌고 셸을 붙잡는다 — **Claude Code 세션 안(`CLAUDECODE`)이면 상주 워커를 거부**한다(사용법은 `pnpm data help`, 계획은 `once --dry-run` — 그 둘은 열려 있다).
  알고 두는 것: `kill`(SIGTERM)이 워커에만 가면 돌던 `claude -p` 자식은 남는다(타임아웃 5분이 거둔다). 워커는 네이버 키가 env 나 `~/.zgnn-naver.env` 에 있어야 한다 — 숨김 입력으로만 넣으면 `process.env` 에 안 남아 단계마다 다시 묻고, 묻는 동안 phase 가 `collect`·`analyze` 인 채 심장만 뛴다.
- [x] **T3.4 세션 만료·한도** — 세션 401/만료면 `phase: login-needed` → `login.mjs` 의 숨김 입력으로 재로그인 → 이어서. TTY 가 아니면(파이프) 멈추고 exit 1. `claude -p` 한도 문구면 `phase: rate-limited` 로 리셋 시각까지(모르면 30분) 잔다.
  수용 기준: `pnpm data` 를 켜 두고 `/admin` 「추가 수집」 → 60초 안에 collect 가 돌고 `/admin/ops` 에 실행 행이 선다. 후보 승인 → 60초 안에 apply. `kill -9` → 5분 뒤 "워커 없음".
  ✅ 2026-10-07 — 세션은 **단계를 부르기 전에** 본다: `createSupabase` 가 만료면 `process.exit(1)` 이라 401 을 잡을 자리가 없어서다. `resolveSupabaseCredentials` 의 로그인 계열 거부(없음·JWT 아님·만료·skew 창)에만 `loginNeeded: true` 표식을 달았고(service 키 트립와이어·project-ref 불일치·하루 넘는 토큰엔 없다 — 묻기를 되풀이하지 않게, 테스트), 워커는 그때 `phase: login-needed` → `login.mjs` 의 `main()` → 클라이언트 재생성. TTY 가 아니면 안내 뒤 exit 1, 로그인 실패면 다음 바퀴에 다시 묻는다. `login.mjs` 이메일 칸의 Ctrl-C 는 readline 이 삼켜 멈춤만 됐다 — 진짜 SIGINT 로 다시 올린다.
  계획과 다른 것: ① `RUN_ERROR` 에 한도 문구가 **없었다**(Claude 한도는 글 단위 건너뜀이었다) — `RUN_ERROR.claudeLimit = 'Claude 한도'` 와 `isQuotaExhausted`(extractPlaces — `limit` 중 429·`limit reached` 류. 5xx·overloaded 는 아니다)를 더했고, analyze 는 한도에서 **루프를 끊는다**(남은 글마다 본문을 받고 claude 를 불러 헛돌았다). 워커는 `main` 의 둘째 인자 `{ onRateLimit }` 로 듣는다. ② `LIMIT_RE` 가 구독 창 문구(`5-hour limit reached` · `hit your limit`)를 못 읽어 api_error 로 샜다 — 더했다. 맨 `limit reached` 는 **받지 않는다**(앞말 `5-hour|weekly|usage|session` 이 붙은 것만): `Context limit reached` 같은 글 단위 오류를 한도로 읽으면 analyze 가 루프를 끊고, 요청 글은 오래된 순이라 그 글이 리셋 뒤에도 맨 앞에서 또 세워 분석이 굶는다(아닌 문구를 테스트가 붙잡는다). ③ 리셋 시각은 `|<epoch초>` 와 `resets 3pm`/`resets at 15:30` 두 모양만 읽고 못 읽으면 30분. 쉬는 동안은 **분석만** 빠진다(수집·반영은 돈다).
  알고 두는 것: 「지금 분석 N건」 이 한도로 중간에 끊겨도 그 요청은 `done` 이다(실패해도 done 규칙) — 남은 건수를 다시 세워 주지 않는다. T6 버튼을 만들 때 다시 볼 자리.
  → 리뷰 3 뒤: 한도로 끊긴 **실패**(exit ≠ 0)는 `queued` 로 되돌아가 리셋 뒤 다시 돈다(최대 3번, 같은 N건). 일부라도 읽고 끝난 실행(exit 0)은 여전히 done.

### T4. Realtime(워커)

- [x] **T4.1 구독** — `supabase.channel('worker').on('postgres_changes', …)` 로 `collect_requests`(INSERT) · `pipeline_requests`(INSERT) · `candidates`(UPDATE, `status=approved`) · `blog_posts`(UPDATE, `requested_at` 가 생김) → `wake()`. 구독 실패·끊김은 경고 한 줄, 폴링이 받친다. 세션 토큰을 `realtime.setAuth` 로 넘긴다(RLS). `pipeline_requests` 에 realtime publication 을 더하는 건 T2.1 에 같이.
  수용 기준: 「추가 수집」 뒤 **5초 안에** collect 시작. 웹소켓을 끊어도(네트워크 off/on) 다음 폴링에서 집는다.
  ✅ 2026-10-07 — `scripts/lib/workerRealtime.mjs`(`REALTIME_BINDINGS` 넷 · 순수 `shouldWake(table, eventType, newRow)` · `startRealtime` → `restart`/`close`) + 테스트 8. `blog_posts` UPDATE 는 `requested_at` 있음 · `analyzed_at` 없음만 깨운다(분석이 글마다 찍는 UPDATE 는 거른다). 상태는 **바뀔 때만** 한 줄(`realtime 연결` / `realtime 끊김(…) — 폴링으로`) — 만료·절전 뒤 자동 재연결이 CHANNEL_ERROR 를 되풀이한다. 직접 재시도 루프 없음. 상주에서만 연다(`once` 는 웹소켓이 이벤트 루프를 잡아 안 끝난다). `pnpm data --no-realtime` = 폴링만 — `data.mjs` 가 `--` 로 시작하는 첫 인자를 상주로 보내고 워커가 모르는 인자를 거부한다(`parseResidentArgs`).
  구독만 하는 실측(쓰기 없음): 채널 넷이 서버 바인딩과 맞아 `SUBSCRIBED`, heartbeat(25초)를 넘긴 30초 뒤에도 채널 토큰이 세션 JWT(불리언만 확인).
  계획과 다른 것: ① **`realtime.setAuth(token)` 은 안 붙는다** — supabase-js 가 Realtime 에 토큰 콜백을 늘 넘기는데, 그 콜백은 auth 세션(헤더로만 붙어 없다)을 못 찾아 publishable 키로 떨어지고, 콜백이 있으면 `setAuth` 한 값을 heartbeat 마다 콜백 값으로 되돌린다. 그 결과 `SUBSCRIBED` 인데 RLS 가 anon 이라 이벤트 0건 — 테스트·구독 상태 어느 쪽도 모른다(고치기 전 실측: 3초 뒤부터 토큰이 JWT 가 아니었다). 그래서 `createSupabase` 가 세션이 있을 때 `realtime: { accessToken }` 콜백을 세션 토큰으로 준다. ② 재로그인 뒤 할 일도 `setAuth` 가 아니라 **새 클라이언트로 다시 구독**(`restart`) — 옛 클라이언트의 콜백은 옛 토큰을 쥐고 있다. ③ 재시도 간격 건너뛰기는 바퀴 단위가 아니라 **단계 key 단위**(`planCycle` 의 `forced` — collect_requests→collect · blog_posts→analyze:requested · candidates→apply, pipeline_requests 는 원래 늘 돈다)이고 그 단계가 **시작할 때** 지운다. 워커 자신의 쓰기도 이벤트를 내므로(수집이 찍는 `requested_at`, 반영이 approved 인 채로 쓰는 `match_place_id`) 바퀴 통째로 건너뛰면 방금 돈 단계를 다시 돈다. 도는 중에 온 이벤트는 다시 서서 다음 바퀴가 한 번 본다 — 그 한 번(멱등)이 대가다. ④ **승인 이벤트는 5초 묵혀 깨운다**(`APPROVED_SETTLE_MS`) — `/admin` 「맞아요」 는 approved → places insert → `match_place_id` → merged 순이라, 1초 만에 깬 apply 가 그 사이를 읽으면 같은 가게를 한 번 더 insert 한다(쌍둥이). 줄일 뿐 없애지는 못한다(폴링에도 같은 창이 있었다) — 근본은 브라우저가 approved 를 거치지 않거나 apply 가 `/admin` 의 진행 중 행을 건너뛰는 것, 열린 것.

### T5. 화면 — 워커 배지·진행률·구독

- [x] **T5.1 `adminOpsHealth.ts`** — `worker` 판정: `last_seen_at` 5분 초과 = 없음(안내 "`pnpm data` 를 켜 주세요"), `login-needed`·`rate-limited` 는 그대로 문구. 단위 테스트.
  ✅ 2026-10-07 — `workerHealth(workers, now)` → `{state: none|alive|stale|login-needed|rate-limited, tone, label, host, phase, runId, ageSec, others, hint}` · `WORKER_STALE_MS`(5분) · `WORKER_PHASE_LABEL`. 행이 여럿이면 가장 최근에 뛴 하나, 나머지는 `others`. 계획과 다른 것: 행 없음(`none`)과 심장 멎음(`stale`)을 갈랐다(없음은 켜 달라, 멎음은 터미널을 봐 달라 — 할 일이 다르다). **로그인 기다림·한도 휴식이 멎음보다 먼저** — 로그인을 기다리는 워커는 세션이 끝나 심장 쓰기(`workerHeartbeat.mjs`)도 실패하므로 5분 규칙을 먼저 보면 그 배지가 안 뜬다. 그때 심장이 멎었으면 문구에 "꺼졌을 수도" 를 붙인다(테스트가 순서를 붙잡는다).
- [x] **T5.2 `/admin/ops` 구독** — `workers` · `pipeline_runs` 의 `postgres_changes` 를 받아 상태만 갱신(전체 다시 안 부름). 60초 폴링은 남긴다. 워커 칸: 배지(살아 있음/없음/로그인 필요/한도) + 지금 단계 + 진행 막대(`progress.done/total`, `current` 한 줄).
  ✅ 2026-10-07 — `RUN_COLUMNS` 에 `progress`. `src/lib/adminOpsRealtime.ts`: 순수 합치기(`runFromRow` · `workerFromRow` · `upsertWorker` · `runMatchesFilter` · `upsertRun` · `applyRunToOverview`, 테스트 13) + `subscribeOps`(채널 `ops:N` — 구독마다 순번, 같은 이름은 떠나는 중인 채널을 돌려받아 StrictMode·HMR 재구독이 던진다 · `postgres_changes_options.wait`). 화면 `adminOpsPageWorker.tsx`(다섯 칸 위). 실행 행은 목록(걸러 보기에 맞을 때만, 안 맞게 된 행은 뺀다) · `runsLatest`/`runsLastOk`(다섯 칸이 진행 막대와 같은 말을 하게) · 링크로 연 행을 함께 고친다. 끊겼다 다시 `SUBSCRIBED` 면 한 번 조용히 다시 읽는다, 아니면 머리글에 `실시간 꺼짐 — 60초마다`.
  계획과 다른 것: **`realtime.setAuth(token)` 만으로는 안 된다**(T4 와 같은 함정) — supabase-js 는 Realtime 에 늘 토큰 콜백을 넘기고 세션 없는 클라이언트의 콜백은 publishable 키를 줘, 하트비트·재연결마다 수동 토큰을 덮는다(RLS 표의 변경이 에러 없이 0건). `createAdminClient` 에 `accessToken: async () => token` 을 줬다(`client.auth` 는 던지는 Proxy 가 되지만 이 클라이언트는 auth 를 안 쓴다 — 로그인은 따로 만든 클라이언트). 진행 행은 실행 기록 목록이 아니라 `runsLatest` 에서 `run_id` 로 찾는다(목록은 걸러져 있다).
  ⚠️ 화면 실측 못 함 — Chrome 에 운영자 세션이 없어 로그인 폼에서 멈췄다(비밀번호는 넣지 않는다). 🧑 실측 때 같이 본다.
- [x] **T5.3 `/admin` 머리글** — 워커 한 줄(`운영 현황 →` 옆). 없음이면 경고 띠에 한 줄.
  ✅ 2026-10-07 — 이미 부르던 `ops_overview`(`loadOpsStages`)의 `workers` 를 같은 `workerHealth` 로 판정, 따로 select 하지 않는다. 열 때 한 번, 구독 없음. `none`·`stale` 이면 경고 띠 맨 아래에 "로컬 워커가 없어요(멎은 듯해요) — 추가 수집·재분석 요청이 처리되지 않아요". 계획(지시)의 "승인이 반영되지 않아요" 는 뺐다 — 승인은 `/admin` 이 곧바로 `places` 에 쓴다(ADR-018, `adminApply.approveGroup`). 집계를 못 읽었거나 `workers` 키가 없으면 둘 다 말하지 않는다.

### T6. 「지금 분석」 버튼

- [x] **T6.1 `src/lib/adminRequests.ts`** — `pipeline_requests` insert(`kind: 'analyze', args: {limit}`), 같은 kind 의 queued 가 있으면 안 넣는다(멱등). 검수 대기 탭 결정 줄에 버튼 "저수지 N건 분석" (limit 는 10/30 선택). 워커가 없으면 비활성 + "워커를 켜 주세요".
  ✅ 2026-10-07 — `requestAnalyze(client, {limit})`(대기 중 analyze 를 `head` count 로 먼저 세고 insert 만 — `.select()` 없음 · 세기 실패는 넣지 않고 던진다 · 표 없음은 insert 오류가 "미적용") · 순수 `isAnalyzeLimit`(10·30·100) · `analyzeRequestView(worker, backlog, limit)` + 테스트 11. 화면 `adminPageAnalyzeRequest.tsx`(`[10건 ▾] 미분석 M건 중 N건 분석`, secondary). M 은 `/admin` 이 이미 받는 `ops_overview` 의 `backlog.count`, 요청 뒤 그 집계를 다시 읽는다.
  계획과 다른 것: ① 버튼은 카드의 결정 줄이 아니라 **검수 대기 칸 맨 위에 하나** — 저수지는 어느 후보에도 딸리지 않아 카드마다 서면 수십 번 반복된다. 걸러 보기 줄 밖이라 목록이 비어도 선다. ② `/admin` 머리글엔 요청 대기 수를 그리는 곳이 없었다 — 워커 한 줄 뒤에 `· 요청 N건 대기`(0 이면 안 말한다)를 새로 붙였다. ③ 로그인 기다림도 켜 둔다(요청은 남고 로그인 뒤 돈다) · 워커를 모르면(집계 못 읽음) 켜 둔다 · 저수지 0 이면 끈다. ④ 세기와 넣기는 원자적이지 않다 — 겹쳐 들어가도 워커의 `requestLimit` 이 가장 큰 limit 하나로 합쳐 돈다.
  알고 두는 것: 한도로 분석이 끊겨도 요청은 `done`(T3.4) — 화면이 대신 한도 휴식 힌트에 "한도로 끊기면 다시 눌러 주세요" 를 붙였다. 남은 건수를 워커가 다시 세우는 것은 아직 없다.
  → 리뷰 3 뒤: 한도로 끊긴 실패는 `queued` 로 되돌아가(최대 3번) 버튼이 대기 중으로 꺼져 있다 — 그 힌트 문구는 고칠 자리(화면 파일은 이번 리뷰 범위 밖).
  ⚠️ 화면 실측 못 함 — Chrome 에 운영자 세션이 없다(T5 와 같다). 🧑 실측 때 같이 본다.

### 🧑 실측(T3·T4·T5 뒤)

T3 만으로 먼저 볼 수 있는 것(사용자 터미널, 이 순서):

```bash
pnpm data login            # 세션이 없거나 곧 끝나면
pnpm data once --dry-run   # 상태·계획만 — 아무것도 안 돌린다(마이그레이션 미적용이면 그렇게 말하고 exit 1)
pnpm data                  # 워커 — 켜 둔 채로 /admin 「추가 수집」 → 60초 안에 "[hh:mm:ss] 수집 시작 — 추가 수집 요청 1건" → 요청 글 분석 → (auto 면) 반영
# 다른 터미널에서 kill <워커 pid>(SIGTERM) → 워커가 "워커 끝" 을 찍고 workers.phase 가 idle 로 닫히는지
```

그다음(T4·T5 뒤):

- `pnpm data` 를 켜면 `realtime 연결 — 바뀌면 바로 깬다` 한 줄 → `/admin` 「추가 수집」 뒤 **5초 안에** `수집 시작 — 추가 수집 요청 1건`(60초 폴링이 아니라 이벤트로 깼는지).
- Wi-Fi 를 끄고 30초 뒤 켠다 → `realtime 끊김(…) — 폴링으로` 한 줄(되풀이 없이) → 끈 동안 넣은 요청을 다음 폴링(60초 안)이 집고, 재연결되면 `realtime 연결` 이 다시 찍히는지.
- 터미널에서 `pnpm data` → `/admin` 「추가 수집」 → 터미널 로그와 `/admin/ops` 진행률이 같은 수를 보이는지 · 승인 → apply → 재빌드 `queued` 까지 한 줄로 이어지는지 · 맥 잠자기 10분 뒤 깨어나 폴링이 이어 가는지.

## 리뷰 반영(2026-10-07, 커밋 `7285380`~`21ac6d3` 독립 리뷰)

번호는 리뷰 번호다.

- **1** `requested_at` backfill 마이그레이션 — T2.1 의 ⏳ 줄(원격 적용은 🧑).
- **2** `isDue` — 지난 실행이 수를 **줄였으면**(진척) 바로 다시 돈다. 30분은 수가 그대로일 때만(`recordRun` 이 단계 앞뒤 수로 `progressed`).
- **3** 요청 닫기 — 실행 행 없이 실패했거나 Claude 한도로 끊긴 실패만 `queued` 로(`taken_at` null), 나머지는 `done`. `args.attempts` 3번째면 `done` + 경고(`requestClose`). 실행 행 없이 **성공**한 것(요청 글 0건 · 실행 기록 insert 실패)은 done — 되돌리면 같은 수집을 세 번 한다. 손 `pnpm data analyze` 가 잠금을 쥔 동안의 「지금 분석」 은 약 3분 만에 포기된다(알고 둔다).
- **4** done/queued 쓰기 직전에 `ensureSession()`.
- **5** 단계 hooks `nonInteractive`(키를 묻지 않는다) — analyze 키 게이트의 `process.exit` 넷은 문구를 찍은 뒤 표식 오류를 던지고 `main` 이 그 코드를 돌려준다(T1 의 문구 그대로). collect 는 원래 return 이었다. raw 모드 `exit` 리스너는 `readHidden.restoreTtyOnExit` 하나로(login · collect · analyze 공용, 프로세스에 한 번).
- **6** collect — `requested_at` 표시가 칸 없음(`isSchemaMissing` — PostgREST 는 update 의 모르는 칸을 42703 이 아니라 `PGRST204` 로 준다) 말고 실패하면 요청을 done 으로 적지 않고 대기로 둔다. `markedRequested` 는 `count: 'exact'`.
- **7** `prompt is too long` · `context limit|length|window` · `output token limit` 은 `too_long`(permanent — 429·5xx·한도 문구면 아니다. 맨 `token limit` 은 분당 토큰 한도와 섞여 뺐다) — 그 전엔 400 이라 **fatal**(실행 전체가 멈춤)이었다. 한도 문구가 섞이면 한도가 먼저. 그 글은 성공 0 인 실행에서도 닫는다(워커의 요청 글은 한두 건씩이라 성공 0 가드에 걸려 영영 안 닫혔다). 닫는 모양은 기존 `analysis.skip`.
- **8** progress — 루프 끝에 `{done: 손댄 글 수, total}` 를 스로틀 없이(`force`), `end()` 도 마지막 값을 같이 쓴다(끊긴 실행은 total 이 아니라 손댄 수).
- **9** 상태를 못 읽은 바퀴는 실패(`once` exit 1), 정기 수집을 맡은 바퀴가 한 단계도 못 돌면 `daily` 를 **다음 wake** 에 얹는다(`createWaker` — 그 자리에서 다시 돌면 오프라인일 때 빈 바퀴가 쉬지 않는다).
- **10** `once` 도 `--dry-run` 이 아니면 `CLAUDECODE` 에서 거부.
- **11** 이번 지시 목록에 없었다(리드 판단) — 내용은 리드에게 확인 중.
- **12** collect 는 `ownsSignals: false` 면 SIGINT 를 안 단다. `setRunListener` 가 실행 행의 `end` 도 넘겨, 워커가 신호를 받으면 도는 단계의 행(`abortRun` → `failed · 중단(SIGINT)`)과 `workers` 행을 같이 닫는다 — analyze·apply 행도 이제 닫힌다.
- **13** 「지금 분석」 이 여럿이면 가장 오래된 하나만 집는다(`requestLimit` 은 행 하나).
- **14** 요청 글의 정본은 `requested_at` 하나 — 기본 분석의 앞줄도 `requested_at is not null` 오래된 순, `recentRequestUrls`·`REQUEST_PRIORITY_DAYS` 삭제.
- **15** `package.json` `engines.node >=22.15`.
- **16** `scripts/data.mjs` 머리 주석 — 직접 실행 플래그(`--experimental-strip-types --no-warnings`, eval 은 `--import ./scripts/lib/tsExtResolve.mjs` 더).
- **17** `worker.mjs` 의 `runOne`/`runCycle` 을 `scripts/lib/workerCycle.mjs`(의존 주입)로 떼고 테스트 8 — 실패→queued · 한도 휴식 · 단계 뒤 다시 세기 · once 첫 실패 정지 · 진척 · abortRun. `workerHeartbeat.test.mjs`(경고 1회·다시 붙음·`setClient`) · `workerQueue.test.mjs`(fail-soft · `isSchemaMissing` · 행마다 닫기).
- **18** 쌍둥이 장소 경쟁 — **(a)+(b) 둘 다**. (a) `/admin` 승인은 approved 를 거치지 않는다: pending → (places 쓰기) → `merged` 한 번, 승인 메모·`reviewed_at` 도 그 update 에(트리거는 merged 에 안 찍어, 안 실으면 운영 현황의 승인 수가 0). 끊기면 pending 이고 다시 누르면 짝으로 합친다(테스트). (b) apply 와 워커의 세기가 같은 식으로 `reviewed_at` 60초 안의 approved 를 건너뛴다(`settledApprovedFilter` — analyze 의 auto insert 는 `reviewed_at` null 이라 바로). 승인 이벤트 지연도 61초로. → [ADR-024](../decisions/ADR-024-local-worker-and-db-queues.md) 「결과」, [ADR-018](../decisions/ADR-018-in-app-admin-review.md) v8.

## 열린 것

- 🙋 JWT exp 를 7일로 늘릴지 — 하루 한 번 비밀번호가 성가셔지면. ADR-016 의 숫자 하나.
- 🙋 정기 키워드 수집 시각 — 09:00 KST 로 두었다. 무료 티어 7일 일시정지 대책([05](05-security.md))도 이 타이머가 대신한다.
