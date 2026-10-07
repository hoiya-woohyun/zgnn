# ADR-024 — 수집·분석·반영은 터미널에 상주하는 로컬 워커 하나가 DB 를 보고 돈다. 큐는 새로 만들지 않고 기존 표의 상태 칸이고, 진행 상태는 표 하나·칸 하나로 화면에 실시간으로 비친다

> 최종 수정: 2026-10-07 (v1: 결정. 구현은 [docs/todo/17](../todo/17-local-worker.md) 가 추적한다)
> 상태: **결정**. 코드는 todo/17 의 단계가 끝날 때마다 붙는다.

## 맥락

`package.json` 의 `data:*` 가 13개다. 그중 지금 돌아가는 것은 여섯(login · logout · pull · collect · analyze · apply)이고 나머지는 죽었거나(`fetch-images` · `optimize-images` — [ADR-002](ADR-002-no-place-photos.md) 로 사진을 없앴다, `homepage` — 10-02 후보 초기화 뒤 대상이 없다) 1회성이거나(`seed` · `normalize` — Notion 재시드) `/admin` 이 대체했다(`review`). 살아 있는 여섯도 **운영자가 손으로 세 번 순서대로** 친다 — `collect` → `analyze` → `apply`. 스케줄도 트리거도 없다([ADR-023](ADR-023-ops-dashboard-and-run-log.md) 맥락, [todo/README](../todo/README.md) 🙋 "수집 주기").

원하는 것은 둘이다. (1) 명령이 적을 것 — 이어지는 단계는 하나로 보일 것. (2) **실시간**일 것 — `/admin` 에서 `추가 수집` 을 누르거나 후보를 승인하면 사람이 터미널로 가서 명령을 치지 않아도 수집·분석·반영이 **그때** 돌고, 도는 동안 화면이 "지금 분석 12/40" 을 보여 줄 것.

제약은 그대로다. 서버가 없다(정적 내보내기). 네이버 검색 키와 `claude` 구독 로그인은 **로컬에만** 있다([ADR-016](ADR-016-secrets-by-login.md)) — 그래서 GitHub Actions 로 올리면 키를 Secrets 에 넣어야 하고 러너 비용이 붙는다. 세션은 access token 하나(≤1일)뿐이고 refresh token 은 버린다.

조사해 보니 **큐는 이미 DB 에 있다.**

```
collect_requests.status = 'queued'   → 수집할 것        (/admin 「추가 수집」 이 넣는다)
blog_posts.analyzed_at IS NULL       → 분석할 것        (collect 가 넣고, /admin 「재분석」 이 되돌린다)
candidates.status = 'approved'       → 반영할 것        (analyze 가 auto 구간을 바로 approved 로 넣는다 — 지금 'stranded')
```

세 스크립트는 전부 "이 조건의 행이 있으면 처리" 라 멱등이고 재실행이 안전하다. 없는 것은 **그 조건을 보고 있다가 도는 프로세스** 하나뿐이다.

## 결정

1. **진입점은 `pnpm data <하위 명령>` 하나다.** `package.json` 의 `data:*` 13줄은 `"data": "node … scripts/data.mjs"` 한 줄이 된다. 하위 명령: `(없음)` = 상주 워커 · `once` = 한 바퀴 · `collect` / `analyze` / `apply` = 단계 하나(디버깅·수동) · `login` / `logout` · `pull`(Vercel `buildCommand` 가 부른다) · `eval …`. 죽은 다섯(`fetch-images` · `optimize-images` · `homepage` · `review` · `seed`/`normalize` 의 스크립트 줄)은 지운다 — `seed-db.mjs` · `normalize.mjs` **파일**은 재해복구용으로 남기고 `node scripts/…` 로 직접 부른다. 기존 `collect-blog.mjs` 등은 옮기지 않고 **함수를 export** 해 `data.mjs` 가 import 한다 — 진입점만 모으는 것이지 코드를 옮기는 것이 아니다.
2. **큐를 새로 만들지 않는다.** 워커가 보는 큐는 위 세 상태 칸이다. 새로 더하는 것은 셋뿐이다.
   - `pipeline_requests` 표 — "**지금** 돌려 줘" 라는 사람의 의도. `kind`(collect/analyze/apply) · `args`(limit 같은 플래그 이름·수만) · `status`(queued/taken/done) · `run_id`. `/admin` 의 「지금 분석」 버튼이 한 줄 넣고 워커가 집는다. 이것만은 상태 칸으로 표현할 자리가 없다(저수지의 글 N건을 "이번에" 읽으라는 말이라).
   - `workers` 표 — 기기당 한 행. `host` · `last_seen_at` · `phase`(idle / collect / analyze / apply / login-needed / rate-limited) · `run_id`. 화면이 "로컬 워커 · 살아 있음(3초 전) · 분석 중" 또는 "워커 없음 — `pnpm data` 를 켜 주세요" 를 그리는 근거다.
   - `pipeline_runs.progress` jsonb 칸 — `{done, total, current}` 를 5초마다. `heartbeat_at`(60초, 건강 판정용)과 역할이 다르다 — 하나는 "살아 있나", 하나는 "어디까지 왔나".
3. **워커는 터미널에 상주한다**(`pnpm data`). launchd·cron·Actions 가 아니다. 깨우는 길은 셋이고 **전부 같은 `wake()` 를 부른다** — Realtime 구독(`postgres_changes`, ~1초) 이 주, 60초 폴링이 안전망, 하루 한 번 타이머(09:00 KST)가 키워드 정기 수집. `wake()` 는 "도는 중이면 끝난 뒤 한 번 더" 로 디바운스하고, 한 바퀴는 collect(요청만) → analyze → apply 순이다. 세 길이 겹쳐 불러도 멱등이라 중복은 비용이 아니라 안전망이다. `runLock` 은 그대로 — 워커 둘(또는 워커 + 손 실행)이 analyze 를 겹치지 않게.
4. **워커가 알아서 분석하는 글은 "사람이 요청한 글" 뿐이다** — `추가 수집` 요청에서 온 글과 `재분석` 으로 되돌린 글. 키워드 정기 수집이 쌓는 **저수지는 자동으로 읽지 않는다** — `claude` 구독은 5시간 한도고 저수지를 어디서 멈출지는 열린 결정이다([NOW](../todo/NOW.md) 🙋). 저수지는 「지금 분석 N건」(`pipeline_requests` kind=analyze, args.limit) 으로만 읽는다. 구분은 `blog_posts.requested_at`(요청에서 왔거나 재분석으로 되돌릴 때 찍는다) 한 칸 — 워커의 자동 analyze 는 `analyzed_at is null and requested_at is not null` 만 센다.
5. **세션 만료는 그 자리에서 묻는다.** 워커는 TTY 에서 도니까 access token 이 만료되면 `login` 과 같은 숨김 입력으로 비밀번호를 묻고 이어 간다. ADR-016 의 경계(장기 키 없음 · exp ≤ 1일 · RLS 범위)는 그대로다 — refresh token 을 키체인에 두는 백그라운드 데몬(launchd)은 하지 않는다. 묻는 동안 `workers.phase = login-needed` 라 화면에 "로그인이 필요해요" 가 뜬다. `claude -p` 가 한도에 걸리면 `rate-limited` 로 눕고 리셋 시각까지 잔다(`pipeline_runs.error` 는 기존 분류 문구).
6. **화면은 구독한다**(ADR-023 「하지 않은 것」 의 Realtime 을 **v2 로 번복**). `/admin/ops` 가 `workers` · `pipeline_runs` 의 `postgres_changes` 를 받아 워커 배지와 진행률을 그 자리에서 바꾼다. 그때는 "열 때 보는 화면" 이라 폴링이면 됐지만, 이제는 **도는 동안 보는 화면**이다. 60초 폴링은 재연결 안전망으로 남긴다. `/admin` 검수 화면에는 「지금 분석」 버튼(`pipeline_requests` insert) 하나와 머리글의 워커 한 줄이 들어간다.

## 왜 이것인가

- **큐를 표로 다시 만들면 두 상태가 어긋난다.** "요청은 done 인데 후보는 안 바뀜" 이 가능해진다. 상태 칸 자체가 큐면 그 불일치는 정의상 없다. `pipeline_requests` 만 예외인데 "저수지에서 이번에 N건" 은 다른 어느 칸에도 적을 수 없는 말이다.
- **로컬이 공짜고 키가 거기 있다.** Actions 는 분당 과금에 Secrets 에 네이버 키·Claude 인증을 넣어야 한다(ADR-016 위반). 로컬 워커는 PC 가 켜진 동안만 돌지만 **큐가 DB 에 있으니 잃는 것이 없다** — 깨어나면 이어서 한다.
- **푸시는 빠르지만 끊김을 모른다.** 웹소켓은 절전 뒤 조용히 죽는다. 폴링을 밑에 깔고 둘 다 같은 멱등 함수를 부르게 하면, 가장 나쁜 경우가 "60초 늦음" 이다.
- **터미널 상주가 launchd 보다 나은 이유 셋.** ① ADR-016 을 안 건드린다. ② "PC 가 켜져 있을 때만" 은 어느 쪽이든 같다 — launchd 도 잠든 맥을 깨우진 못한다. ③ 만료가 눈에 보인다 — 백그라운드는 조용히 죽고 "왜 안 돌지?" 를 로그로 안다. 이 레포가 가장 싫어하는 모양이다. 대가는 하루 한 번 비밀번호. 그게 성가셔지면 refresh token 이 아니라 **JWT exp 를 1일 → 7일로** 늘리는 쪽(ADR-016 의 숫자 하나)이 먼저다.
- **진행률을 `pipeline_runs` 에 두는 이유.** 이미 "실행 한 건 = 한 행" 이고 화면이 그 행을 읽는다. 진행률은 그 행의 지금 상태라 같은 자리다. `workers` 를 따로 두는 것은 "실행이 없을 때도 워커가 살아 있나" 를 답할 행이 필요해서다.

## 하지 않은 것

- **GitHub Actions · Vercel Cron · Supabase Edge Function 에서 수집·분석** — 키가 바깥으로 나간다, 비용이 붙는다, `claude` 구독 로그인은 러너에서 안 된다.
- **launchd 데몬 + refresh token** — 결정 5.
- **저수지 자동 분석** — 결정 4. 한도와 수율 결정이 먼저다.
- **워커 여럿의 분산 잠금** — 기기가 하나다. `workers` 행이 둘 이상이면 화면이 둘 다 보여 주고 `runLock`(tmpdir)이 같은 기기 안의 겹침만 막는다. 다른 기기끼리 겹치면 `pipeline_runs` 두 행이 running 으로 보이는 것으로 드러난다 — 그때 고친다.
- **Realtime 로 `/admin` 검수 목록까지** — 거기는 사람이 읽고 고르는 표라 밑에서 줄이 움직이면 안 된다. 구독은 `workers` · `pipeline_runs` 둘뿐이고 후보 표는 그대로 손 새로고침이다.
- **요청 표의 재시도·만료** — `taken` 인데 워커가 죽으면 `pipeline_runs` 가 stalled 로 드러내고, 다음 워커가 `taken` 이 10분 넘은 요청을 다시 집는다. 그 이상의 상태 기계는 두지 않는다.

## 결과

- `package.json` 스크립트가 **7줄**(`dev` · `build` · `preview` · `lint` · `test` · `icons` · `data`). `vercel.json` `buildCommand` 는 `pnpm data pull && pnpm build`. README 의 명령 표가 그에 맞춰 줄어든다.
- 마이그레이션 하나 — `pipeline_requests` · `workers` 표(RLS `is_operator()`, authenticated select/insert/update, delete 없음), `pipeline_runs.progress` · `blog_posts.requested_at` 칸, `supabase_realtime` publication 에 `workers` · `pipeline_runs` 추가. Realtime 은 RLS 를 지키므로 publishable 키만으로는 아무것도 안 보인다(ADR-023 이 걱정한 "권한을 또 연다" 는 세션이 있어야 통과한다).
- `scripts/data.mjs`(진입점 + 워커 루프) · `scripts/lib/worker*.mjs`(깨우기·디바운스·요청 집기 — 순수 부분은 테스트). `runLog.mjs` 에 `progress()` 하나. `collect-blog.mjs` 가 요청 글에 `requested_at` 을 찍고 `adminReanalyze.ts` 도 찍는다.
- `/admin/ops` 에 워커 배지·진행률(구독), `/admin` 머리글에 워커 한 줄, 검수 대기에 「지금 분석」. `adminOpsHealth.ts` 에 "워커 없음"(last_seen 5분 초과) 판정 하나.
- [ADR-023](ADR-023-ops-dashboard-and-run-log.md) v2 — Realtime 번복. [ADR-016](ADR-016-secrets-by-login.md) 은 안 바뀐다(워커가 재로그인을 묻는 것은 `login` 과 같은 경로). [todo/15](15-ops-dashboard.md) 의 남은 Slack 항목은 그대로 — 워커가 생겨도 알림은 DB 가 보낸다.
- 문서: [architecture/data-pipeline.md](../architecture/data-pipeline.md) 의 명령 체인, [features/ops-dashboard.md](../features/ops-dashboard.md) 의 워커 칸, README 「실행」.

## 관련

- [todo/17](../todo/17-local-worker.md) — 진행
- [ADR-023](ADR-023-ops-dashboard-and-run-log.md) 실행 기록·`/admin/ops` · [ADR-016](ADR-016-secrets-by-login.md) 세션 모델 · [ADR-018](ADR-018-in-app-admin-review.md) `/admin` · [ADR-015](ADR-015-supabase-source-and-rebuild.md) 원본=Supabase
- [todo/15](15-ops-dashboard.md) Slack(남음) · [todo/03](03-analyze-and-review.md) 저수지 결정
