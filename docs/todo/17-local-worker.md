# 17. 로컬 워커 — `pnpm data` 하나가 DB 를 보고 수집·분석·반영을 그때 돌리고, 화면이 진행을 실시간으로 본다

> 최종 수정: 2026-10-07 (v1: 신설 — 설계·태스크. 코드 없음. 결정은 [ADR-024](../decisions/ADR-024-local-worker-and-db-queues.md))

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

- [ ] **T1.1 죽은 스크립트 삭제** — `scripts/fetch-blog-images.mjs` · `optimize-images.mjs` · `fill-homepage.mjs` · `review-candidates.mjs`(`scripts/analyze/reviewCandidates.mjs` 중 `/admin` 이 안 쓰는 부분도) 파일 삭제. `seed-db.mjs` · `normalize.mjs` 는 **파일만** 남기고 스크립트 줄에서 뺀다. 그 파일들만 보던 테스트·lib 가 있으면 같이 지운다(`placeFields` 는 pull 이 쓰니 남는다).
  수용 기준: `pnpm test` · `pnpm lint` 통과, `grep -rn "data:review\|data:homepage\|fetch-images" src scripts docs` 가 docs 의 이력 문장 말고는 0.
- [ ] **T1.2 진입점 `scripts/data.mjs`** — `pnpm data <sub>` 를 받아 분기. `collect-blog.mjs` · `analyze-candidates.mjs` · `apply-approved.mjs` · `pull-db.mjs` · `login.mjs` · `logout.mjs` · `eval-extract.mjs` 는 각각 `main(argv)` 를 export 하고, `import.meta.url` 이 진입점일 때만 스스로 돈다(기존 직접 실행도 깨지지 않게). `eval` 의 `--import ./scripts/lib/tsExtResolve.mjs` 는 `data.mjs` 가 `eval` 일 때 `register()` 로 건다.
  `package.json`: `data:*` 전부 삭제 → `"data": "node --experimental-strip-types --no-warnings scripts/data.mjs"`. `vercel.json` `buildCommand` → `pnpm data pull && pnpm build`.
  수용 기준: `pnpm data pull` 이 지금의 `data:pull` 과 같은 파일을 만든다(바이트 동일, `dataJson` 보장). `pnpm data` 인자 없음·모르는 하위 명령이면 사용법 한 화면. `pnpm data once` 는 T3 전까지 "collect(요청만) → analyze(요청 글만) → apply" 를 한 번 돈다.
  문서: README 「실행」 명령 표, [architecture/data-pipeline.md](../architecture/data-pipeline.md) 체인, CLAUDE.md 표의 `pnpm data:*` 언급.

### T2. 마이그레이션 `<ts>_local_worker.sql`

- [ ] **T2.1 표·칸** —
  `pipeline_requests`: `id uuid pk default gen_random_uuid()` · `kind text check in ('collect','analyze','apply')` · `args jsonb`(`{limit: 20}` 같은 수만) · `status text check in ('queued','taken','done') default 'queued'` · `requested_at timestamptz default now()` · `requested_by uuid default auth.uid()` · `taken_at` · `run_id uuid references pipeline_runs`. 인덱스 `(status, requested_at)`.
  `workers`: `host text pk` · `last_seen_at timestamptz` · `phase text check in ('idle','collect','analyze','apply','login-needed','rate-limited')` · `run_id uuid` · `started_at` · `version text`(git sha 짧게).
  `pipeline_runs` 에 `progress jsonb`. `blog_posts` 에 `requested_at timestamptz`(인덱스 `(analyzed_at, requested_at)` 부분 — `where analyzed_at is null`).
  권한: 둘 다 RLS `is_operator()`, `grant select, insert, update … to authenticated`(delete 없음 — `narrow_grants` 뒤라 명시). anon 없음.
  Realtime: `alter publication supabase_realtime add table workers, pipeline_runs;` + `alter table … replica identity full`(UPDATE 의 old 값이 필요 없으니 default 로 충분한지 확인 — 필요 없으면 default).
  수용 기준: 롤백 트랜잭션 실측 — 운영자 insert/update 되고 delete 42501, anon 전부 42501. `select * from pg_publication_tables where pubname='supabase_realtime'` 에 두 표.
  🧑 `db push --linked`(쓰기 — 사용자 확인). → [ADR-016](../decisions/ADR-016-secrets-by-login.md)·[05](05-security.md) 표에 두 줄.
- [ ] **T2.2 `ops_overview` 에 워커** — `workers` 전부(`host`·`last_seen_at`·`phase`·`run_id`)와 `pipeline_requests` 의 queued 수를 json 에 더한다. 화면 첫 그림용(구독은 그 뒤 갱신).

### T3. 워커 루프(폴링부터)

- [ ] **T3.1 `scripts/lib/workerLoop.mjs`** — 순수 부분: `wake()` 디바운스("도는 중이면 끝난 뒤 한 번 더" — 플래그 하나), 한 바퀴 순서, 요청 집기(`queued` → `taken`, `taken` 10분 초과도 다시 집는다), 다음 타이머 시각(09:00 KST). 단위 테스트.
- [ ] **T3.2 한 바퀴** — `collect(--only-requests)` → 요청 글에 `requested_at` 찍기(`collect-blog.mjs` 안) → `analyze` 는 `requested_at is not null` 만(기본 limit 은 그 수) → `apply`. `pipeline_requests` kind 별로는 그 단계만(analyze 는 `args.limit` 으로 저수지 포함). 타이머는 `collect`(키워드 전체)만.
  `adminReanalyze.ts` 가 `analyzed_at = null` 로 되돌릴 때 `requested_at = now()` 도 찍는다.
- [ ] **T3.3 `workers` 심장과 `progress`** — 워커가 시작할 때 `workers` upsert(`phase: idle`), 15초마다 `last_seen_at`, 단계 들어갈 때 `phase`·`run_id`. `runLog.mjs` 에 `progress({done, total, current})` — 5초에 한 번만 쓴다(`tick` 과 같은 모양). `analyze` 가 글마다 부른다(`current` 는 글 제목 앞 20자 — `candidates` 에 이미 이름이 있으니 `error` 처럼 지울 이유가 없다).
  종료(SIGINT) 때 `phase: idle` · `run_id: null` 로 닫고 나간다 — 못 닫고 죽으면 `last_seen_at` 이 5분 넘어 "워커 없음".
- [ ] **T3.4 세션 만료·한도** — 세션 401/만료면 `phase: login-needed` → `login.mjs` 의 숨김 입력으로 재로그인 → 이어서. TTY 가 아니면(파이프) 멈추고 exit 1. `claude -p` 한도 문구면 `phase: rate-limited` 로 리셋 시각까지(모르면 30분) 잔다.
  수용 기준: `pnpm data` 를 켜 두고 `/admin` 「추가 수집」 → 60초 안에 collect 가 돌고 `/admin/ops` 에 실행 행이 선다. 후보 승인 → 60초 안에 apply. `kill -9` → 5분 뒤 "워커 없음".

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

- 터미널에서 `pnpm data` → `/admin` 「추가 수집」 → 터미널 로그와 `/admin/ops` 진행률이 같은 수를 보이는지 · 승인 → apply → 재빌드 `queued` 까지 한 줄로 이어지는지 · 맥 잠자기 10분 뒤 깨어나 폴링이 이어 가는지.

## 열린 것

- 🙋 JWT exp 를 7일로 늘릴지 — 하루 한 번 비밀번호가 성가셔지면. ADR-016 의 숫자 하나.
- 🙋 정기 키워드 수집 시각 — 09:00 KST 로 두었다. 무료 티어 7일 일시정지 대책([05](05-security.md))도 이 타이머가 대신한다.
