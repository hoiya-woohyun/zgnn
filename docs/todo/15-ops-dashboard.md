# 15. 운영 현황 화면 — 파이프라인이 돌고 있는지를 `/admin/ops` 에서 보고, 실패는 Slack 으로 받는다

> 최종 수정: 2026-10-06 (v2: T1.1·T1.2·T2 구현 — 마이그레이션 `20261006120000_pipeline_runs` 원격 적용·롤백 실측, 쓰기 스크립트 넷이 실행 기록을 남기고 요약 줄은 `src/lib/runSummary.ts` 하나. T1.3 은 T5·T6 와 함께로 미룸. T2 의 수용 기준 실측은 🧑 터미널 몫이라 아직. stats 표를 구현에 맞춰 고쳤다)
> 이전 2026-10-06 (v1: 신설 — 설계·UI/UX·태스크. 코드 없음. 결정은 [ADR-023](../decisions/ADR-023-ops-dashboard-and-run-log.md), 화면은 [features/ops-dashboard.md](../features/ops-dashboard.md))

**한 줄:** 수집·분석·반영 스크립트가 실행마다 `pipeline_runs` 한 행을 남기고, `/admin/ops` 가 그 행과 기존 표로 "어디가 막혔나" 다섯 칸을 그리고, 실패는 DB 트리거가 Slack 으로 보낸다. 지금은 **`rebuild_log` 하나 빼고 아무 기록도 없다** — "지난주에 수집 돌렸던가" 의 답이 터미널 스크롤백뿐이다.

규약은 [08](08-usability-and-process-plan.md) 과 같다 — 한 태스크 = 한 커밋, 태스크마다 파일·수용 기준·검증 명령. `🧑` 는 사용자 터미널·Studio 에서만 되는 일, `🙋` 는 사용자가 정할 것.

## 이 계획이 서 있는 결정 — [ADR-023](../decisions/ADR-023-ops-dashboard-and-run-log.md)

1. 정본은 `pipeline_runs` 표 하나. **스크립트가 쓴다**(시작 insert → 끝 update, 긴 실행은 heartbeat). 기록 실패는 작업을 막지 않는다.
2. 화면은 `/admin/ops` — `/admin` 의 세션·wide 레이아웃·밀도 고정을 그대로 받는다. 본체는 `adminOpsPage.tsx` 로 따로.
3. 건강 판정은 저장하지 않고 화면에서 계산(`adminOpsHealth.ts`, 순수 함수). 집계는 rpc `ops_overview(days)` 하나.
4. Slack 은 **DB 가** 보낸다 — Vault `slack_webhook_url` + `pg_net`, Deploy Hook 과 같은 함수 모양. 메시지에 수·스크립트명·에러 한 줄만.
5. "안 돌았다" 알림(pg_cron)은 보류 — 기록이 쌓인 뒤 켠다.

## 순서와 의존

```
T1 표·RLS·rpc ──▶ T2 스크립트가 쓴다 ──▶ T3 화면 ──▶ T4 /admin 연결
                                     └──▶ T5 Slack 트리거 ──▶ 🧑 Vault ──▶ T6 테스트 버튼
T7 pg_cron(보류) 은 T2 로 한 달쯤 쌓인 뒤
```

**T1 → T2 를 먼저 끝내고 일주일 돌린다.** 화면(T3)은 기록이 몇 행 있어야 만들면서 볼 수 있다. T5 는 T2 와 독립이라 병렬 가능.

## 단계와 상태

### T1. 표와 권한 — `pipeline_runs` · `ops_overview` · `ops_slack_test`

- [x] **T1.1 마이그레이션 `pipeline_runs`** — `supabase/migrations/<ts>_pipeline_runs.sql`.
  컬럼: `id uuid pk default gen_random_uuid()` · `script text check in ('collect','analyze','apply','approve','reject')` · `status text check in ('running','ok','partial','failed')` · `started_at timestamptz default now()` · `ended_at` · `heartbeat_at` · `args jsonb`(플래그 목록, 값 없음) · `stats jsonb` · `error text` · `alert jsonb`(`{state:'sent'|'missing'|'error', requestId, responseStatus, respondedAt, note}`) · `operator uuid default auth.uid()`.
  권한: `alter table … enable row level security` 명시(`rebuild_log.sql:47` 과 같이), `grant select, insert, update on pipeline_runs to authenticated`(delete 없음, `narrow_grants` 뒤라 명시 필수), RLS 세 정책 전부 `(select is_operator())`. anon 은 아무것도 없음. **`rebuild_log` 와 다른 점**: 운영자가 행을 직접 update 할 수 있다(스크립트가 운영자 세션으로 쓰기 때문) — 위조 방지 표가 아니라 운영자 자신의 메모장이다(ADR-023 「결과」).
  인덱스: `(script, started_at desc)`.
  수용 기준: 운영자 세션으로 insert/update 가 되고 anon 은 42501. `id` 가 uuid 라 시퀀스 usage 없이 insert 된다.
  검증: `./node_modules/.bin/supabase db query --linked` 로 롤백 트랜잭션 안에서 insert → select → rollback(값은 안 본다). → [ADR-016](../decisions/ADR-016-secrets-by-login.md)·[05](05-security.md) 표에 한 줄.
  ✅ 2026-10-06 `supabase/migrations/20261006120000_pipeline_runs.sql` **원격 적용**(`db push --linked`, 그 파일 하나만 대기 중이었다). 롤백 트랜잭션 실측(`set local role` + `request.jwt.claims` 로 역할을 바꿔 — postgres 그대로면 RLS 우회): 운영자 insert·update 1행 · delete 42501 · anon select/insert 42501 · 비운영자 insert 42501, 롤백 뒤 0행. `heartbeat_at` 은 `default now()` 로 두었다(tick 을 한 번도 못 부르고 죽은 실행도 "멎은 심장" 으로 읽히게).
- [x] **T1.2 rpc `ops_overview(days int default 7)`** — security definer, 첫 줄에서 `auth.uid()` 가 `operators` 에 있는지 확인(없으면 42501, `rebuild_status` 와 같은 모양). 돌려주는 json 하나:
  `runsLatest`(스크립트별 마지막 행) · `funnel`(수집·분석·후보·승인·제외·보류·반영·재빌드 — [features](../features/ops-dashboard.md) ② 표의 기준) · `backlog`(미분석 글 수 · 가장 오래된 미분석 `fetched_at`) · `pending`(수 · 가장 오래된 `created_at`) · `stranded`(approved 인데 merged 아님) · `usage30d`(토큰 합 · 네이버 호출 · 재빌드 2xx) · `rebuildRecent`(`rebuild_status(5)` 와 같은 5행, `response_status` 포함 — 재빌드 칸 판정이 이 행을 직접 읽는다) · **`slackConfigured`**(Vault 에 `slack_webhook_url` 이름이 있는지 boolean — URL 은 돌려주지 않는다. 화면을 여는 것으로 Slack 에 아무것도 가지 않게 하려고 테스트 rpc 와 분리한다).
  `backlog` 는 `/admin` 의 `adminPosts.fetchPostBacklog` 와 같은 수를 SQL 로 한 번 더 세는 것이다 — 두 벌임을 인정한다. `/admin` 수집 완료 탭은 그대로 두고, 이 화면은 왕복 하나로 끝내는 쪽을 택한다.
  부수 효과: 불릴 때 `net._http_response` 에서 `alert.requestId` 가 있는 행의 응답을 `alert` 에 옮겨 적는다(`rebuild_status` 수법, 실패해도 넘어감).
  anon·PUBLIC 실행 권한 회수. 검증: 운영자 세션으로 호출해 키가 전부 있는지, anon 은 42501.
  ✅ 같은 마이그레이션. 실측: 키 `backlog·days·funnel·pending·rebuildRecent·runsLastOk·runsLatest·slackConfigured·stranded·usage30d` 전부, `runsLatest` 행에 `operator` 없음, `rebuildRecent` 5행에 `responded_at` 포함, `slackConfigured=false`(Vault 비어 있음), 숫자가 아닌 `stats` 칸(`"calls":"x"`)은 합에서 빠지고 함수는 산다 · anon/비운영자 rpc 42501. 스펙과 다른 것 둘은 아래 「계획과 다르게 간 것」(`runsLastOk` 추가 · `rebuildRecent` 는 `rebuild_status` 를 `perform` 한 뒤 표를 직접 읽음).
- [ ] **T1.3 rpc `ops_slack_test()`** — ⏸ 2026-10-06 T5·T6 와 함께 하기로 미룸(🙋 "Slack 은 T2 가 한 주 쌓인 뒤" 권장안). 존재 확인(`slackConfigured`)은 T1.2 에 들어갔다. — **버튼 전용**(T6). definer, 운영자 확인, Vault 에 `slack_webhook_url` 없으면 `{state:'missing'}`, 있으면 고정 문구로 POST 하고 `{state:'sent', requestId}`. URL 을 돌려주지 않는다. 존재 확인에는 쓰지 않는다(그건 T1.2 의 `slackConfigured`). 검증: Vault 비어 있을 때 `missing`.

### T2. 스크립트가 기록을 남긴다 — `scripts/lib/runLog.mjs`

- [x] **T2.1 `runLog.mjs`** — `beginRun(client, {script, args}) → {id, tick(), end({status, stats, error})}`. insert 실패 시 `⚠️ 실행 기록 못 남김: <이유 한 줄>` 만 찍고 `id=null` 인 no-op 핸들을 돌려준다(fail-soft, ADR-023 결정 2). `tick()` 은 60초에 한 번만 `heartbeat_at` 을 갱신(호출은 자주 해도 됨). `end()` 는 `ended_at=now()`. `error` 는 **분류 문구만** 받는다("Claude 인증 실패" · "네이버 검색 429" · "DB 쓰기 실패" · "중단(SIGINT)" · "알 수 없음") — 원문은 콘솔에만. 그래도 `https?://\S+` 는 `<url>` 로 지운다. `runLog.mjs` 는 **DB 호출만** 맡는다.
  **`src/lib/runSummary.ts`** — 콘솔 요약 문장은 **새로 만들지 않는다.** `scripts/analyze/analyzeCandidates.mjs:542` 의 `formatSummary(stats, meterSummary, {dryRun})` 와 `collect`·`apply` 의 요약 줄을 이 TS 모듈로 옮기고, 스크립트가 `../src/lib/runSummary.ts` 를 읽는다(`review-candidates.mjs:16` 이 `../src/lib/petPolicy.ts` 를 읽는 선례. 반대 방향 — `src/` 가 `scripts/lib/*.mjs` 를 import — 은 열려 있지 않다). `stats` jsonb 에는 그 함수가 읽는 수 전부(meter 수치 포함)가 들어가야 한다.
  단위 테스트: 옮긴 함수가 지금 콘솔 줄과 글자까지 같다(기존 요약 줄을 fixture 로).
  ✅ 2026-10-06 `scripts/lib/runLog.mjs`(+`runLog.test.mjs` — insert 거부·throw 에도 핸들이 돌아오고 tick/end 가 throw 하지 않는다 · end 실패(오류·0행·throw)는 "기록 못 닫음" 한 줄) · `src/lib/runSummary.ts`(+`runSummary.test.ts` — 옮기기 **전** 코드가 찍은 줄을 fixture 로 얼렸다: collect 2 · analyze 2 · apply 3(published 보강·pending 되돌림·draft `?`) · approve/reject). 옮긴 것: `naverBlog.mjs` 의 `formatSummary`·`formatElapsed`, `analyzeCandidates.mjs` 의 `formatSummary`, `createUsageMeter().summary()` 의 문장(이제 `formatUsageSummary` 를 부른다), apply·review 의 인라인 템플릿. 스크립트는 `node --experimental-strip-types` 로 그 `.ts` 를 직접 읽는다(`data:collect`·`data:analyze`·`data:apply` 에 플래그를 더했다 — `data:review` 와 같은 모양).

  **`stats` 키(스크립트별 — 여기가 정본, 바뀌면 여기부터)** — 2026-10-06 구현에 맞춰 고쳤다: 키 이름은 **요약 함수(`runSummary.ts`)가 읽는 이름 그대로**다(번역 층을 두지 않는다 — 아래 「계획과 다르게 간 것」).

  | script | 키 |
  |---|---|
  | `collect` | `fetched` · `new` · `existing` · `excludedOld` · `excludedOther` · `durationMs` · `naverCalls`(T2.7) · `truncatedKeywords` |
  | `analyze` | 스크립트의 `stats` 그대로 — `analyzed` · `skipped` · `dropped` · `candidates` · `auto`(일치) · `ask`(확인요청) · `new`(신규) · `dup` · `edited` · `update` · `fill` · `excluded{other,notJeju,notAllowed,sameAsSite,stale,weak,blocked,noPetEvidence}` · `verify{checked,noEvidence,notAllowed,failed}` · `propose{places,done,failed}` + `meters{extract,verify,propose}`(각 `{calls,input,output,cacheRead,cacheWrite}` — `createUsageMeter().totals()`) · `geo{searched,picked,failed,geocode{chance,tried,picked,failed}}` · `homepage{tried,card,image,failed}` · `naverCalls`(T2.7) |
  | `apply` | `applied` · `patched` · `patchedPublished` · `inserted` · `failed` · `revertedToPending` · `draftWaiting`(못 셌으면 null) |
  | `approve`/`reject` | `requested` · `done` · `failed` |
- [x] **T2.2 `collect-blog.mjs`** — 시작 `beginRun('collect', {keywords: n})`, 끝 `end({status:'ok', stats:{fetched, new, existing, excludedOld, excludedOther, durationMs, naverCalls, truncatedKeywords}})`. 예외는 `end({status:'failed', error})` 뒤 다시 throw(exit 1 유지). Ctrl-C(130)도 `failed` 로 닫는다(`SIGINT` 핸들러 — 이미 있으면 거기에).
  수용 기준: 돌리면 행이 `running → ok` 로 바뀌고 `stats.new` 가 콘솔의 신규 수와 같다.
  ✅ 2026-10-06 구현 — 시작 기록은 키·키워드 검사 뒤(그 앞의 exit 1 은 "안 돈 것"), 본체를 try 로 감싸 실패는 `failed` + 분류(429 → `네이버 검색 429`, upsert → `DB 쓰기 실패`, 그 밖 `알 수 없음`) 뒤 다시 throw, Ctrl-C 는 `process.once('SIGINT')` 가 3초 안에 `중단(SIGINT)` 으로 닫고 130. 요약 줄과 stats 가 **같은 객체**다. ⏳ 수용 기준 실측은 🧑(`data:collect` 는 사용자 터미널).
- [x] **T2.3 `analyze-candidates.mjs`** — `--dry-run` 이면 기록 안 함. **`beginRun` 의 위치는 사전 점검이 전부 끝난 뒤, 실제 작업 직전**이다 — 컬럼 검사(`:231`)·`focusedOnly` 빈 앞줄(`:325`)·`places` 비어 있음(`:343`)의 `process.exit(1)` 보다 앞에 두면 그 종료가 전부 거짓 "중단된 듯" 이 된다(`process.on('exit')` 안에선 await 를 못 쓴다). 그 뒤의 fatal 경로는 `await end({status:'failed', error})` 뒤 `process.exitCode=1` 로 끝낸다(`process.exit` 금지). 글 하나 끝날 때마다 `tick()`. `stats` 키는 T2.1 표. 상태: 지금 exit 1 식(`:813`, `fatal || (posts.length>0 && stats.analyzed===0)`)이 참이면 `failed`, 건너뛴 글이 있으면 `partial`, 아니면 `ok` — **글이 0건이면 `ok` + `analyzed:0`**("돌았는데 할 게 없었다" 도 기록이다). `runLock` 에 막혀 exit 1 하는 경우는 **기록하지 않는다**(돈 게 아니다).
  수용 기준: 돌다가 `kill -9` 하면 행이 `running` + 멎은 심장으로 남는다(화면이 "중단된 듯" 으로 읽을 재료). `places` 0행으로 멈추면 행이 생기지 않는다.
  ✅ 2026-10-06 구현 — `beginRun` 은 사전 점검·`candidates`/`place_blocks` 읽기까지 다 지난 루프 직전(스펙의 `:343` 뒤가 아니라 그보다 아래 — 그 사이의 `pending` 조회도 throw 할 수 있다). `tick` 은 글마다 + "분석 불가" 닫기 루프 + **제안 루프**(장소마다 Claude 한 번이라 그 루프만으로 10분을 넘길 수 있다). fatal 은 `fatalError` 를 남겨 분류(`ClaudeCliError` auth → `Claude 인증 실패`, 네이버 429 → `네이버 검색 429`, 그 밖 `알 수 없음`). 상태는 지금의 exit 식 그대로. SIGINT 핸들러는 **두지 않았다** — `claude -p` 자식도 같은 신호를 받는데, 끝내지 않는 핸들러를 두면 루프가 계속 돈다. Ctrl-C 한 analyze 는 running 으로 남아 10분 뒤 "중단된 듯" — 실제로 멈춘 것이라 맞는 말이다. 예상 못 한 예외도 같다. ⏳ 수용 기준 실측(`kill -9` · places 0)은 🧑.
- [x] **T2.4 `apply-approved.mjs`** — `stats:{applied, patched, inserted, failed, revertedToPending, draftWaiting}`. `failed>0` 이면 `partial`(exit code 는 지금처럼 실패 수). `--dry-run` 은 기록 안 함.
  ✅ 2026-10-06 구현 — 시작은 places 비어 있음 검사 뒤, 후보마다 `tick`. stats 에 `patchedPublished` 를 더했다(콘솔 줄이 원래 따로 말한다). ⏳ 실측은 🧑(`data:apply` — 승인된 후보가 있을 때).
- [x] **T2.5 `review-candidates.mjs approve|reject`** — `script:'approve'|'reject'`, `stats:{requested, done, failed}`. `list`·`status` 는 기록 안 함(읽기).
  ✅ 2026-10-06 구현 — 대상이 정해진 뒤 시작(못 찾음 exit 1 · 대상 없음 exit 0 은 기록 안 함). 상태: 실패 0 → ok · 성공 0 → failed · 섞이면 partial, 실패가 있으면 `DB 쓰기 실패`. args 는 플래그 이름만(`--note` 의 문장은 싣지 않는다).
- [x] **T2.6 문서** — [architecture/data-pipeline.md](../architecture/data-pipeline.md) 에 "실행마다 `pipeline_runs` 한 행" 절, 각 스크립트 `--help`/머리 주석에 한 줄.
  ✅ 2026-10-06 data-pipeline v45 「실행 기록」 절 · 네 스크립트 머리 주석 한 줄씩 · CLAUDE.md 길잡이 표 한 줄.
- [x] **T2.7 네이버 호출 카운터** — 지금 코드에 `naverCalls` 는 **없다**. `scripts/lib/naverBlog.mjs`(수집)와 `scripts/analyze` 의 상호·지역 검색 호출 자리에 카운터 하나(모듈 수준 `let`, `readNaverCalls()`), `collect`·`analyze` 의 `stats.naverCalls` 로 싣는다. 이게 없으면 ④ 사용량의 네이버 칸을 뺀다(🙋 표 참조).
  ✅ 2026-10-06 — 카운터는 `scripts/lib/naverSearchApi.mjs`(검색 API 규격 한 자리 — 블로그·지역이 둘 다 이걸 쓴다)에 `countNaverCall()`·`readNaverCalls()`. 블로그 검색의 fetch 는 `naverBlog.mjs`(순수 함수)가 아니라 `collect-blog.mjs` 의 `searchBlog` 에 있다. fetch **앞에서** 센다(실패 응답도 쿼터를 깎는다). Geocoding 은 다른 쿼터라 세지 않는다. 🙋 권장안(넣는다)대로.

### T3. 화면 — `/admin/ops`

- [ ] **T3.1 라우트** — `src/app/admin/ops/page.tsx`(메타 · `robots noindex`, `/admin` 과 같이) + `adminOpsRouteClient.tsx`(`dynamic(..., {ssr:false})` + `<div data-admin-dense>` + `adminDensity.css` import — `adminRouteClient.tsx` 를 그대로 본뜬다). `next.config.mjs` 프리캐시엔 넣지 않는다(`/admin` 과 같이). → [ARCHITECTURE.md](../ARCHITECTURE.md) 라우트 표 한 줄.
- [ ] **T3.2 `src/lib/adminOps.ts`** — `fetchOpsOverview(client, days)`(rpc 호출 + 타입) · `fetchRuns(client, {script?, failedOnly?, before?, limit})`(무한 스크롤 페이지) · `fetchRun(client, id)`. 타입은 rpc json 에서 파생. 요약 문장은 `src/lib/runSummary.ts`(T2.1) 를 import.
- [ ] **T3.3 `src/lib/adminOpsHealth.ts`** — 순수 함수 `stageHealth(overview, now) → TStageHealth[5]`(칸 · 상태 `ok|warn|fail|none` · 첫째 수 · 둘째 수 · 이유 문장). 규칙과 임계값 상수는 [features](../features/ops-dashboard.md) ① 표. 재빌드 칸은 `overview.rebuildRecent`(`TRebuildEntry[]` 의 `response_status`·`hook`·`responded_at`)를 직접 읽는다 — `rebuildHeadline()` 은 `{tone, text}` 만 돌려주므로 그 문장을 파싱하지 않는다. `runState(run, now) → 'ok'|'partial'|'failed'|'running'|'stalled'`(심장 10분).
  **테스트 필수 케이스**: running+심장 11분 → `stalled` · running+심장 2분 → `running` · collect 마지막 ok 8일 → `warn` · 행 0 → `none` · pending 0 → `ok`(비었어요) · stranded 2 → 반영 `warn` · 재빌드 404 → `fail`.
- [ ] **T3.4 `src/screens/adminOpsPage.tsx`** — 세션 확인(`adminSession`·`adminSupabase`·`adminPageLogin` 재사용, 로그인 뒤 머무는 곳만 다름) → `ops_overview` + 첫 페이지 runs 를 `Promise.all` → 60초 interval 새로고침(탭이 숨겨지면 멈춤 `document.visibilityState`). 머리글: 제목 · `← 검수 화면` · 새로고침 · "N초 전" · `rebuildHeadline` 한 줄(`adminRebuild` 재사용) · 주의 띠(가장 심한 하나).
- [ ] **T3.5 `adminOpsPageStageStrip.tsx`** — 다섯 칸. 상태점 색은 `theme.css` 의 시맨틱 토큰(`text-success-primary` · `text-warning-primary` · `text-error-primary` 계열, 배경은 같은 계열의 `bg-*-secondary`) + 회색(`text-quaternary`). 원시 색값 금지. 칸 클릭 → ③ 필터. 높이 고정(로딩 때 뛰지 않게). 모바일 가로 스크롤.
- [ ] **T3.6 `adminOpsPageFunnel.tsx`** — 7일/30일 토글, 줄 일곱(신규 글 · 분석 · 후보 · 승인+제외 · 반영 · 재빌드 · **지금 보류**), 비율 막대는 `div` 너비(**가장 큰 줄 100%** — 줄들이 부분집합이 아니다), 승인·제외는 한 줄에 둘, 지금 보류만 `warning` 이고 기간 토글의 영향을 받지 않는다. 0 은 막대 없이 수만. 구현 전 `dataviz` 스킬의 stat tile·비율 막대 절 확인.
- [ ] **T3.7 `adminOpsPageRunsTable.tsx`** — `adminTable` + `adminInfiniteScroll` 재사용, 열 여섯, 칩 필터(스크립트 · 실패만), 행 펼침(stats 키-값 · args · error · alert). `?run=<id>` 면 그 행을 받아 펼친 채 스크롤 — `useSearchParams` 가 아니라 effect 안의 `window.location.search`(정적 내보내기의 Suspense 요구 회피, 화면은 `ssr:false`). `stalled` 행 아래 한 줄: "죽었으면 그냥 다시 돌리면 돼요(`runLock` 이 죽은 pid 의 잠금을 이어받는다). 살아 있는데 멎었으면 그 프로세스를 끊고 다시". 손으로 상태를 바꾸는 버튼은 **없다**.
- [ ] **T3.8 `adminOpsPageUsage.tsx` · `adminOpsPageAlerts.tsx`** — 사용량 한 줄 세 묶음(금액 환산 없음 · 각주 한 줄) · Slack 묶음(`missing` 이면 "켜려면 → 15 §T5" 로 접힘, 테스트 버튼은 T6).
- [ ] **T3.9 문서** — [features/ops-dashboard.md](../features/ops-dashboard.md) 를 `> 상태: 구현 중` 으로, 계획과 다르게 간 것은 아래 「계획과 다르게 간 것」 에.

### T4. `/admin` 과 잇는다

- [ ] **T4.1 머리글 링크** — `adminPage.tsx` 머리글 오른쪽 `운영 현황 →`(`Link`, 텍스트). 
- [ ] **T4.2 경고 띠 한 줄** — `/admin` 의 `start()` 가 fire-and-forget 으로 `ops_overview(7)` 를 받아 `stageHealth` 의 `warn|fail` 중 가장 심한 하나를 기존 경고 띠에 "… · 운영 현황 →" 로 더한다. 재빌드 warn 과 겹치면 재빌드가 먼저(이미 있는 줄). 실패해도 `/admin` 은 그대로(try/catch, 조용히).
  수용 기준: `pipeline_runs` 가 비어 있으면 띠에 아무것도 더해지지 않는다(`none` 은 띠 대상이 아니다 — 첫날부터 노랗게 보이면 안 된다).

### T5. Slack — DB 가 보낸다

- [ ] **T5.1 마이그레이션 `notify_ops_slack()`** — `pipeline_runs` AFTER UPDATE OF status, 행 단위. 조건: `old.status='running'`(두 번 안 보낸다 — `partial→failed` 같은 사후 수정은 **일부러** 안 알린다) 이고, `new.status='failed'` 또는 (`new.status='partial'` and `jsonb_typeof(new.stats->'failed')='number'` and `(new.stats->>'failed')::int > 0`). 그래서 **`analyze` 의 `partial`(건너뛴 글)은 알리지 않는다** — 건너뜀은 기록이지 사고가 아니다. `apply` 의 `partial` 만 간다. **함수 본문 전체**를 `exception when others` 로 감싼다(`notify_vercel_rebuild` 의 `:115-125` 와 같이) — Vault 읽기·캐스트·`alert` update 중 하나라도 밖에 있으면 트리거 실패가 `end()` 의 update 를 롤백해 행이 `running` 으로 남고 거짓 "중단된 듯" 이 된다. Vault `slack_webhook_url` 읽기 → 없으면 `alert={state:'missing'}` → 있으면 `net.http_post(url, body, timeout 15000)` → `alert={state:'sent', requestId}` → 예외는 `alert={state:'error', note: regexp_replace(sqlerrm, 'https?://\S+', '<hook>', 'g')}`. **본문은 `script`·`status`·`started_at`·`ended_at−started_at`·`left(error,200)`(URL 지움)·`stats` 의 수 칸(`failed`·`applied`·`analyzed`)·`<site>/admin/ops/?run=<id>` 만** — 장소명·글 제목·URL 칸은 읽지 않는다(ADR-023 결정 5, 진짜 보장은 T2.1 의 "분류 문구만"). 사이트 주소는 함수 안 상수(값이 아니라 공개 도메인). 180일 지난 행 정리도 여기서(`rebuild_log` 와 같이).
  → [05](05-security.md) 에 "Slack 웹훅 회전" 절(Deploy Hook 절 복제: 🧑 Slack 에서 새 웹훅 → Studio `vault.update_secret` → 옛 웹훅 삭제 → `/admin/ops` 테스트 버튼으로 200 확인).
- [ ] 🧑 **T5.2 Vault 에 넣는다** — 사용자가 Slack 앱 → Incoming Webhook 생성 → Studio SQL 에서 `select vault.create_secret('<url>', 'slack_webhook_url')`. **Claude 는 값을 보지 않는다**(터미널·대화에 붙이지 않는다). 없으면 T5.1 은 `missing` 만 남기고 다른 것은 전부 동작한다.
- [ ] **T5.3 실측** — 🧑 `pnpm data:apply` 를 일부러 실패시키기 어렵다면 Studio 에서 `pipeline_runs` 한 행을 `running → failed` 로 update 해 메시지가 오는지(`alert.state='sent'`, 다음 `ops_overview` 호출 뒤 `responseStatus=200`). 메시지에 장소명·URL 이 없는지 눈으로.

### T6. 테스트 버튼

- [ ] **T6.1 `adminOpsPageAlerts` 의 `테스트 보내기`** — `ops_slack_test()` 호출, 결과를 그 자리에 한 줄("보냈어요 · 200" / "웹훅이 없어요"). 연타 방지 10초.

### T7. 🙋 pg_cron — "안 돌았다" 를 Slack 으로 (보류, ADR-023 결정 6)

- [ ] **T7.0 켤지 결정** — T2 로 한 달 쌓인 뒤 `pipeline_runs` 를 보고 "정말 잊어서 못 돌린 적이 있었나" 를 센다. 있었으면 ↓, 없었으면 이 절을 닫는다.
- [ ] **T7.1 `cron.schedule('ops-daily', '0 0 * * *' /* 09:00 KST */, $$ select ops_daily_digest() $$)`** — `stageHealth` 의 SQL 판(수집 7일 · 분석 backlog 2일 · 검수 7일 · stranded) 중 warn 이상이 있을 때만 한 줄 메시지. 매일 "다 괜찮아요" 는 보내지 않는다(알림 피로). 판정 규칙이 TS 와 SQL 두 벌이 되므로 **임계값 상수를 `ops_thresholds` 뷰 하나에 두고 TS 는 `ops_overview` 로 그 값을 받는다** — 그 전까지는 TS 상수 하나다.

## UI/UX 설계 요지 (상세는 [features/ops-dashboard.md](../features/ops-dashboard.md))

- **첫 줄이 답이다.** 다섯 칸(수집 → 분석 → 검수 → 반영 → 재빌드 — 장치의 단계. [ADR-020](../decisions/ADR-020-pipeline-stages-and-blocklist.md) 의 다섯 칸은 후보의 **상태**라 다른 축이고 이름도 다르다)에 "마지막 · 쌓인 것 · 왜 노란가" 세 줄. 전부 초록이면 10초 안에 닫는다.
- **주의가 있을 때만 띠.** 띠는 가장 심한 하나만. 첫날(기록 없음)은 회색이지 노랑이 아니다.
- **터미널과 같은 문장.** 실행 기록의 요약 열은 콘솔에 찍힌 줄과 글자까지 같다(`src/lib/runSummary.ts` 한 모듈 — 기존 `formatSummary` 를 옮긴 것).
- **화면은 기록을 고치지 않는다.** 중단된 행을 닫는 버튼·재실행 버튼 없음. 할 일은 터미널에 있고, 화면은 그 명령을 한 줄 적어 줄 뿐.
- **색은 토큰 셋**(`success`·`warning`·`error`) + 회색. 깔때기 막대는 한 색, 보류만 노랑. 차트 라이브러리 없음.
- **PC 기준, 모바일은 읽히기만.** `data-admin-dense` 로 글자 고정, 다섯 칸은 가로 스크롤, 표는 열 셋으로 접음.

## 검증 (전부 끝났을 때)

- `pnpm test` — `adminOpsHealth`(7 케이스) · `runSummary`(기존 콘솔 줄 fixture) 통과.
- `pnpm build` 통과, `out/admin/ops/index.html` 생성, `sw.js` 프리캐시에 `/admin/ops` 없음.
- 🧑 `pnpm data:collect` 한 번 → `/admin/ops` 수집 칸이 "방금 · 정상 · 신규 N", 실행 기록 첫 행의 요약이 터미널 줄과 같다.
- 🧑 `pnpm data:analyze --limit 3` 돌리다 `kill -9` → 10분 뒤 "중단된 듯", lock 안내 한 줄.
- 🧑 Studio 에서 행 하나 `failed` → Slack 메시지 1건, 장소명·URL 없음, `alert.responseStatus=200`.
- anon 으로 `pipeline_runs` select → 42501(`curl` 로, 값 없이).

## 계획과 다르게 간 것

- **T1.2 `runsLastOk` 를 더했다.** 수집 칸의 '실패' 는 마지막 실행을, '주의(7일 넘음)' 는 마지막 **ok** 실행을 본다 — 마지막 실행이 failed 면 `runsLatest` 만으로는 "마지막 성공이 언제였나" 를 답할 수 없다. `status in ('ok','partial')` 의 마지막 행(analyze 의 partial 은 건너뛴 글이 있었을 뿐 돌았다).
- **T1.2 `rebuildRecent` 는 `rebuild_status(5)` 의 결과를 그대로 싣지 않는다.** 그 함수는 `responded_at` 을 돌려주지 않는데 T3.3 의 재빌드 칸이 "응답 null 이 3분 넘음" 을 그 값으로 판정한다. 그래서 `perform rebuild_status(5)` 로 옮겨 적기만 시키고 `rebuild_log` 에서 같은 다섯 행 + `responded_at` 을 직접 읽는다.
- **T2.1 `stats` 키 이름은 표의 것이 아니라 요약 함수가 읽는 이름이다.** 계획 표의 analyze 키(`matched`·`confirm`·`fresh`·`verified`·`proposed`·`claudeCalls`·`totals`)는 `formatSummary` 가 읽는 이름(`auto`·`ask`·`new`·`verify{}`·`propose{}`)과 달랐다. 규칙이 "문장을 새로 만들지 않는다" · "함수가 읽는 수는 전부 stats 에" 이므로 **함수의 입력 모양을 그대로 저장**한다 — 번역 층을 두면 그 층이 어긋나는 순간 화면이 틀린 수를 말한다. Claude 사용량은 패스별 `meters{extract,verify,propose}` 로 두고 `ops_overview.usage30d` 가 셋을 다 더한다(추출만 세면 교차점검·제안이 태운 한도가 빠진다). apply 는 콘솔 줄이 원래 published 보강 수를 따로 말해 `patchedPublished` 를 더했다.
- **T2.1 "`src/` 가 `scripts/*.mjs` 를 import 하는 길은 없다" 는 사실이 아니었다.** `src/lib/adminPosts.ts`·`adminEdit.ts` 가 이미 `scripts/analyze/analyzeCandidates.mjs` 등을 읽는다. 그래도 방향은 계획대로 **스크립트가 `src/lib/runSummary.ts` 를 읽는다** — 다만 `/admin` 번들에 들어가는 `.mjs`(`analyzeCandidates.mjs`)에는 `.ts` import 를 넣지 않았다(요약 함수를 빼기만 했다). `.ts` 를 읽는 `.mjs` 는 스크립트 진입점과 `extractPlaces.mjs`(번들 밖)뿐이다.
- **T1.2 `backlog` 는 `excluded_at` 을 빼지 않는다.** `/admin` 의 `fetchPostBacklog` 는 `blog_posts.excluded_at`(글 단위 분석 제외)이 있으면 그 글을 빼는데, 그 칸을 만드는 마이그레이션이 레포에 없다 — 정적으로 참조하면 함수가 죽는다. 그 칸이 생기면 두 수가 갈린다(마이그레이션 머리 주석).

## 🙋 사용자가 정할 것

| 어디 | 무엇 | 권장안 | 왜 사용자 몫인가 |
|---|---|---|---|
| T3.3 | 임계값 — 수집 **7일** · 분석 backlog **2일** · 검수 대기 **7일** · 심장 **10분** | 표의 값 | 수집 주기가 습관이라(todo/README 🙋) "며칠이면 늦은 건가" 는 사용자의 리듬이다. 주 1회면 7일, 격주면 14일 |
| T5 | Slack 을 처음부터 켤지 | **T1~T4 먼저, Slack 은 T2 가 한 주 쌓인 뒤** | 알림은 받는 사람이 정한다. 웹훅 생성·Vault 입력이 🧑 라 사용자 시간이 든다 |
| T5.1 | 어느 채널·개인 DM 인지, `partial` 도 보낼지 | 개인 DM, `partial` 은 실패 건수 > 0 일 때만 | 채널이면 전달 범위가 넓어진다 — 그래서 메시지에 장소명을 안 넣는 것이 결정 5 다 |
| T7 | pg_cron 을 언제 켤지 | 한 달 뒤 `pipeline_runs` 보고 | 보류의 이유가 "관측 먼저"(todo/04)다. 켜면 판정 규칙이 두 벌(TS·SQL)이 된다 |
| ④·T2.7 | 사용량에 네이버 호출 수를 넣을지(카운터가 없어 **새로 만들어야** 한다) | 넣는다(수만) | 무료 구간 안이면 의미가 없고, 넘길 때만 의미가 있다 — 지금 하루 몇 번인지 사용자만 안다. 안 넣으면 T2.7 을 닫는다 |

## 위험

- **기록이 본업을 막는다** — `beginRun` 이 throw 하면 `collect` 가 안 돈다. fail-soft(T2.1)가 그래서 결정이고, 테스트에 "client 가 insert 를 거부해도 핸들이 돌아온다" 를 둔다.
- **트리거가 던지면 `end()` 가 롤백된다** — AFTER UPDATE 트리거의 예외는 그 update 를 되돌린다. T5.1 이 본문 전체를 `exception` 으로 감싸는 이유. 실측 T5.3 에 "stats.failed 가 문자열인 행을 failed 로 바꿔도 update 가 된다" 를 둔다.
- **세션 만료 중간에 `end()` 가 실패한다** — `analyze` 는 수십 분이라 JWT(≤24h, 만료 30분 전 거부)가 도중에 끝날 수 있다. 그러면 `running` 으로 남아 "중단된 듯" 으로 보인다 — 거짓 경보지만 **들키는 쪽**이다. `end()` 실패 시 콘솔에 "기록 못 닫음(세션 만료) — 화면에 중단된 듯으로 보일 수 있어요" 한 줄.
- **`stats` 키가 바뀌는데 `runSummary.ts` 가 안 바뀐다** — 한 함수를 두 곳이 쓰게 한 이유. 스크립트 요약 줄을 그 함수로 찍어야 테스트가 지킨다.
- **Slack 메시지에 값이 샌다** — 함수가 `error` 에서 URL 을 지우고 `stats` 의 수 칸만 읽는다. 실측(T5.3)에서 눈으로 확인.
- **`/admin` 이 느려진다** — T4.2 의 `ops_overview` 는 fire-and-forget 이고 실패해도 조용하다. `start()` 의 `Promise.all` 에 넣지 않는다.
