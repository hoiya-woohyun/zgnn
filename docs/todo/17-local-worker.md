# 17. 로컬 워커 — `pnpm data` 하나가 DB 를 보고 수집·분석·반영을 그때 돌리고, 화면이 진행을 실시간으로 본다

> 최종 수정: 2026-10-07 (v4: T3 구현 — 상주 워커 `scripts/worker.mjs`(`pnpm data` · `once` · `once --dry-run`), 순수 판단 `workerLoop.mjs`, 세기 `workerQueue.mjs`, 심장 `workerHeartbeat.mjs`, `progress`·`--requested-only`·`requested_at` 찍기·재로그인·한도 휴식)
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
  계획과 다른 것: ① `run_id` 를 밖으로 꺼낼 길이 없어(`main` 은 exit code 만) `runLog.mjs` 에 리스너 하나(`setRunListener`)를 뒀다 — 행이 선 뒤에만 알리고, 던져도 본업은 그대로. ② 수집 중 Ctrl-C 는 collect 자신의 핸들러도 실행 행을 닫고 exit 하려 해 **둘이 경쟁한다** — 먼저 끝난 쪽이 끝낸다. 워커 행이 못 닫혀도 5분 뒤 "워커 없음" 이라 들키는 쪽이다. ③ `once` 는 `workers` 행을 쓰지 않는다(상주가 아니다).
- [x] **T3.4 세션 만료·한도** — 세션 401/만료면 `phase: login-needed` → `login.mjs` 의 숨김 입력으로 재로그인 → 이어서. TTY 가 아니면(파이프) 멈추고 exit 1. `claude -p` 한도 문구면 `phase: rate-limited` 로 리셋 시각까지(모르면 30분) 잔다.
  수용 기준: `pnpm data` 를 켜 두고 `/admin` 「추가 수집」 → 60초 안에 collect 가 돌고 `/admin/ops` 에 실행 행이 선다. 후보 승인 → 60초 안에 apply. `kill -9` → 5분 뒤 "워커 없음".
  ✅ 2026-10-07 — 세션은 **단계를 부르기 전에** 본다: `createSupabase` 가 만료면 `process.exit(1)` 이라 401 을 잡을 자리가 없어서다. `resolveSupabaseCredentials` 의 로그인 계열 거부(없음·JWT 아님·만료·skew 창)에만 `loginNeeded: true` 표식을 달았고(service 키 트립와이어·project-ref 불일치·하루 넘는 토큰엔 없다 — 묻기를 되풀이하지 않게, 테스트), 워커는 그때 `phase: login-needed` → `login.mjs` 의 `main()` → 클라이언트 재생성. TTY 가 아니면 안내 뒤 exit 1, 로그인 실패면 다음 바퀴에 다시 묻는다. `login.mjs` 이메일 칸의 Ctrl-C 는 readline 이 삼켜 멈춤만 됐다 — 진짜 SIGINT 로 다시 올린다.
  계획과 다른 것: ① `RUN_ERROR` 에 한도 문구가 **없었다**(Claude 한도는 글 단위 건너뜀이었다) — `RUN_ERROR.claudeLimit = 'Claude 한도'` 와 `isQuotaExhausted`(extractPlaces — `limit` 중 429·`limit reached` 류. 5xx·overloaded 는 아니다)를 더했고, analyze 는 한도에서 **루프를 끊는다**(남은 글마다 본문을 받고 claude 를 불러 헛돌았다). 워커는 `main` 의 둘째 인자 `{ onRateLimit }` 로 듣는다. ② `LIMIT_RE` 가 구독 창 문구(`5-hour limit reached` · `hit your limit`)를 못 읽어 api_error 로 샜다 — 더했다. ③ 리셋 시각은 `|<epoch초>` 와 `resets 3pm`/`resets at 15:30` 두 모양만 읽고 못 읽으면 30분. 쉬는 동안은 **분석만** 빠진다(수집·반영은 돈다).

### T4. Realtime(워커)

- [ ] **T4.1 구독** — `supabase.channel('worker').on('postgres_changes', …)` 로 `collect_requests`(INSERT) · `pipeline_requests`(INSERT) · `candidates`(UPDATE, `status=approved`) · `blog_posts`(UPDATE, `requested_at` 가 생김) → `wake()`. 구독 실패·끊김은 경고 한 줄, 폴링이 받친다. 세션 토큰을 `realtime.setAuth` 로 넘긴다(RLS). `pipeline_requests` 에 realtime publication 을 더하는 건 T2.1 에 같이.
  수용 기준: 「추가 수집」 뒤 **5초 안에** collect 시작. 웹소켓을 끊어도(네트워크 off/on) 다음 폴링에서 집는다.

### T5. 화면 — 워커 배지·진행률·구독

- [ ] **T5.1 `adminOpsHealth.ts`** — `worker` 판정: `last_seen_at` 5분 초과 = 없음(안내 "`pnpm data` 를 켜 주세요"), `login-needed`·`rate-limited` 는 그대로 문구. 단위 테스트.
- [ ] **T5.2 `/admin/ops` 구독** — `workers` · `pipeline_runs` 의 `postgres_changes` 를 받아 상태만 갱신(전체 다시 안 부름). 60초 폴링은 남긴다. 워커 칸: 배지(살아 있음/없음/로그인 필요/한도) + 지금 단계 + 진행 막대(`progress.done/total`, `current` 한 줄).
- [ ] **T5.3 `/admin` 머리글** — 워커 한 줄(`운영 현황 →` 옆). 없음이면 경고 띠에 한 줄.

### T6. 「지금 분석」 버튼

- [ ] **T6.1 `src/lib/adminRequests.ts`** — `pipeline_requests` insert(`kind: 'analyze', args: {limit}`), 같은 kind 의 queued 가 있으면 안 넣는다(멱등). 검수 대기 탭 결정 줄에 버튼 "저수지 N건 분석" (limit 는 10/30 선택). 워커가 없으면 비활성 + "워커를 켜 주세요".

### 🧑 실측(T3·T4·T5 뒤)

T3 만으로 먼저 볼 수 있는 것(사용자 터미널, 이 순서):

```bash
pnpm data login            # 세션이 없거나 곧 끝나면
pnpm data once --dry-run   # 상태·계획만 — 아무것도 안 돌린다(마이그레이션 미적용이면 그렇게 말하고 exit 1)
pnpm data                  # 워커 — 켜 둔 채로 /admin 「추가 수집」 → 60초 안에 "[hh:mm:ss] 수집 시작 — 추가 수집 요청 1건" → 요청 글 분석 → (auto 면) 반영
# 다른 터미널에서 kill <워커 pid>(SIGTERM) → 워커가 "워커 끝" 을 찍고 workers.phase 가 idle 로 닫히는지
```

그다음(T4·T5 뒤):

- 터미널에서 `pnpm data` → `/admin` 「추가 수집」 → 터미널 로그와 `/admin/ops` 진행률이 같은 수를 보이는지 · 승인 → apply → 재빌드 `queued` 까지 한 줄로 이어지는지 · 맥 잠자기 10분 뒤 깨어나 폴링이 이어 가는지.

## 열린 것

- 🙋 JWT exp 를 7일로 늘릴지 — 하루 한 번 비밀번호가 성가셔지면. ADR-016 의 숫자 하나.
- 🙋 정기 키워드 수집 시각 — 09:00 KST 로 두었다. 무료 티어 7일 일시정지 대책([05](05-security.md))도 이 타이머가 대신한다.
