# ADR-028 — 수집·분석을 Vercel 함수에서도 돌린다. 버튼을 누른 운영자의 세션이 곧 작업 권한이고, 서버에 두는 장기 값은 Claude 토큰과 네이버 키 둘뿐이다

> 최종 수정: 2026-10-08 (v3: 네이버 키는 **넷**이다(결정 6) — 검색 둘에 더해 주소→좌표의 NCP Maps 둘. 보안 리뷰로 사슬 상한(진척·깊이 12)·홉 동안 심장 유지·하위 도메인 위험을 더했다)
> 이전 2026-10-08 (v2: **채택**. 결정 5 를 코드에 맞게 고쳤다 — 버튼 셋 중 `pipeline_requests` 에 줄을 넣는 것은 「저수지 N건 분석」 하나뿐이고 「추가 수집」 은 `collect_requests`, 「재분석」 은 `blog_posts.requested_at` 이다. 그래서 서버도 로컬 `once` 와 같은 한 바퀴를 돌고, 로컬과 겹치지 않게 하는 것은 원자 집기가 아니라 `workers` 심장이다(`candidates` 에 유일 제약이 없어 같은 글을 둘이 읽으면 후보가 둘 생긴다). 결정 9(번들)·10(겹침)을 더했다. 결정 4 의 `refreshSession()` 은 `/admin` 에 refresh token 이 없어(ADR-016) "50분 미만이면 안 깨우고 재로그인 안내" 로)
> 이전 2026-10-08 (v1: 제안 — `worker/api/probe.mjs` 실측(c39beaf)으로 Vercel 함수 안 `claude -p` 가 `setup-token` 으로 도는 것을 확인. 구현은 [docs/todo/20](../todo/20-vercel-remote-worker.md))

## 상태

**채택**(2026-10-08). [ADR-016](ADR-016-secrets-by-login.md)(장기 키 없음)과 [ADR-024](ADR-024-local-worker-and-db-queues.md) 「하지 않은 것」 의
"Vercel 에서 수집·분석" 을 고친다. 아래 「무엇을 고치나」 가 그 범위다. 구현과 진행은 [docs/todo/20](../todo/20-vercel-remote-worker.md).

## 맥락

ADR-024 의 로컬 워커는 돌아간다(todo/17). `/admin` 의 「추가 수집」·「재분석」·「저수지 N건 분석」 이 DB 에 한 줄을 넣으면
터미널의 `pnpm data` 가 ~1초 안에 집는다. 남은 불편은 하나다 — **PC 가 꺼져 있거나 터미널이 없으면 아무것도 돌지 않는다.**

ADR-024 가 서버 실행을 뺀 이유는 셋이었다. ① 키가 밖으로 나간다 ② 비용이 붙는다 ③ "`claude` 구독 로그인은 러너에서 안 된다".
2026-10-08 실측으로 ③ 이 틀렸다.

| 실측(별도 프로젝트 `zgnn-worker`, 프리뷰, Node 24 · linux-x64) | 값 |
|---|---|
| `@anthropic-ai/claude-code-linux-x64/claude --version` | 124ms |
| `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token`) + `claude -p`(haiku, 분석과 같은 고립 플래그) | 성공. CLI 1.8~2.8초 · API 0.6~0.9초 · 벽시계 4~5초 |
| 실제 분석(원격 `pipeline_runs`, 로컬) | 글 3건 93초 — **글당 ~30초**, Claude 호출 글당 2~3번 |

② 는 Hobby 안이다. Fluid 는 Active CPU 과금이고 `claude -p` 는 대부분 응답을 기다리는 시간이다. 남는 것은 ① 하나다.

이용 조건도 확인했다([Claude Code — Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). 금지는 "남(최종 사용자)을 대신해 구독 자격증명으로 요청을 돌리는 것" 과
"Claude.ai 자격증명·세션 토큰을 모으거나 중개하는 것" 이다. 본인 구독으로 수정하지 않은 바이너리를 본인이 쓰는 것은 그 밖이다.
운영자는 한 명이고 트리거는 운영자 세션만 받으므로 허용 범위다. **사이트 방문자가 누르면 도는 길은 어떤 모양이든 만들지 않는다** — 이 ADR 의 불변식이다.

## 결정

1. **실행기는 별도 Vercel 프로젝트 `zgnn-worker`**(레포의 `worker/`)다. 사이트(`zgnn`)는 정적 내보내기 그대로 둔다 — 함수를 사이트에 넣으려면 `output: 'export'` 를 풀어야 하고,
   그러면 `--webpack`·serwist·`vercel.json` 을 다시 검증해야 한다(CLAUDE.md 「조용히 깨지는 것들」 셋).
2. **git 자동 배포를 끈다**(`worker/vercel.json` `git.deploymentEnabled: false`). Vercel 빌드는 env 를 읽는다. 켜 두면 push 한 번이 토큰을 꺼내는 빌드를 돌릴 수 있다(ADR-016 위협 4).
   배포는 `vercel deploy --prod` 로만 한다.
3. **트리거는 `/admin` 이 직접 부르는 `POST /api/run` 하나다.** 운영자 Supabase access token 을 `Authorization: Bearer` 로 싣는다. 함수는 이렇게 처리한다.
   - 토큰을 Supabase(`auth.getUser`)와 `is_operator()` 로 확인한다. 아니면 401·403 이고 Claude 는 부르지 않는다.
   - 확인되면 202 로 바로 답하고 `waitUntil` 로 계속 일한다.
   - 사이트에서는 `vercel.json` rewrite(`/api/worker/:path*` → `zgnn-worker` 프로덕션)로 **같은 출처**로 부른다. CORS 를 열지 않는다.
4. **DB 쓰기 권한은 그 요청의 JWT 다.** `resolveSupabaseCredentials` 는 이미 `readSession` 을 주입받는다. 서버에서는 키체인 대신 요청 헤더를 넘긴다.
   형식·만료·30분 앞당김(`SESSION_EXP_SKEW_S`)·RLS 는 로컬과 같은 검사를 거친다. 그래서 **Supabase 쪽 장기 키는 서버에 생기지 않는다.**
   (v2) `/admin` 에는 새로 고칠 refresh token 이 없다(ADR-016 — 로그인 때 버린다). 그래서 남은 시간이 **50분**(서버의 앞당김 30분 + 사슬 여유 20분)보다 적으면 보내지 않고
   "다시 로그인하면 다음 요청부터 서버가 돌려요" 한 줄을 띄운다. JWT 가 12시간(43200)이라 로그인 뒤 약 11시간은 깨운다 — refresh token 을 다시 쥐는 것(ADR-016 을 푸는 일)보다 싸다.
5. **일 단위는 로컬 `once` 와 같은 한 바퀴다**(v2 — v1 은 "요청 한 줄" 이었다). 버튼 셋이 남기는 흔적이 셋 다르다 — 「추가 수집」 은 `collect_requests`, 「재분석」 은
   `blog_posts.requested_at`, 「저수지 N건 분석」 만 `pipeline_requests` 한 줄이다. 그래서 서버는 줄 하나를 집는 대신 로컬 워커의 한 바퀴(`createWorkerCycle`)를 그대로 돈다.
   다른 점은 상한 하나다 — **한 번의 함수 호출(홉)은 분석 단계를 하나만, 글 최대 5건**(30초 × 5 + 여유 < 300초)까지 돈다. 요청 글은 `--requested-only --limit 5`,
   「저수지 N건」 은 `--limit 5` 를 돌고 남은 수(N−5)를 그 줄에 적어 `queued` 로 되돌린다.
   홉이 끝나면 다시 세어 **할 일이 남았고 · 이번 홉이 줄였고 · JWT 실효가 한 홉 이상 남았으면** 같은 JWT 로 자기 자신을 한 번 더 부른다.
   "줄였고" 가 없으면 403 으로 계속 실패하는 글 하나가 JWT 가 끝날 때까지 한도를 태운다. 끊긴 뒤 남은 일은 다음 버튼이나 로컬 워커가 이어 간다.
   `pipeline_requests` 는 여전히 원자적으로 집는다(`update … where status = 관찰한 값 returning`) — 서버 인스턴스 둘, 로컬 둘이 같은 줄을 동시에 볼 때의 안전망이다.
6. **서버 env 에는 장기 값 두 종류만 둔다**: `CLAUDE_CODE_OAUTH_TOKEN`(1년)과 네이버 키 넷 — 검색 API `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(수집·분석의 이름 축, 없으면 분석이 Claude 전에 멈춘다)과
   NCP Maps `NAVER_MAP_CLIENT_ID`·`NAVER_MAP_CLIENT_SECRET`(주소→좌표, 없으면 그 축만 꺼져 로컬보다 덜 채운다 — v3 에서 바로잡음, v1·v2 는 검색 둘만 적었다). 전부 Sensitive · Production 에만 둔다.
   `claude` 자식 env 허용 목록(`claudeChildEnv`)에는 **워커 런타임일 때만** `CLAUDE_CODE_OAUTH_TOKEN` 을 넣는다. 로컬의 "env 토큰이면 멈춘다" 는 그대로 둔다(ADR-016 v4 의 의도).
7. **로컬 워커는 남긴다.** 같은 큐를 보고, 서버가 한도에 걸리거나 꺼져도 PC 가 이어 받는다. 서버는 `workers` 에 `host = 'vercel'` 한 행으로 심장을 남긴다.
   `/admin` 의 로컬 워커 배지(`workerHealth`)는 그 행을 세지 않는다 — 서버 행은 홉 사이에 늘 '멎은' 모양이라 섞으면 "워커 멎음" 이 뜬다. 서버가 도는 동안만 따로 한 줄로 보인다.
8. **자동으로 도는 것은 없다.** cron 도, DB 트리거 → pg_net 호출도 두지 않는다. 사람이 누를 때만 돈다. 키워드 정기 수집(하루 1회)은 로컬 워커 몫으로 남긴다.
   운영자 JWT 가 없는 자동 실행에는 Supabase 장기 키가 필요해지기 때문이다.
9. **번들은 로컬에서 만든다**(v2). `worker/` 는 `../scripts` 를 직접 import 하지 않는다 — Vercel 이 `worker/` 에만 의존성을 설치하면 `scripts/lib` 에서 시작한 패키지 해석이
   레포 루트의 `node_modules` 를 찾다 실패하고, 앱 TS(`src/lib/runSummary.ts`)도 끼어 있다. 그래서 `pnpm worker:build` 가 esbuild 로 진입점(`worker/entry/run.mjs`)과
   거기서 닿는 `scripts/`·`src/lib/` 를 한 파일(`worker/api/run.mjs`, 커밋 안 함)로 묶고, `worker/` 에서 `vercel deploy --prod` 한다. 밖에 남기는 것은 `claude` 바이너리 패키지뿐이다(`includeFiles`).
   이 번들을 레포 밖 빈 폴더에 `worker/package.json` 만으로 설치해 import 해 보는 것이 배포 전 확인이다(T1).
10. **로컬과 서버는 심장으로 비킨다**(v2). `candidates` 에 유일 제약이 없어 같은 글을 둘이 읽으면 후보가 둘 생긴다. 상태 칸 큐(요청 글·추가 수집)는 원자적으로 집을 줄이 없으니
    `workers` 로 가른다 — 서버는 로컬 행(`host ≠ 'vercel'`)이 60초 안에 뛰었으면 아무것도 하지 않고 "로컬 워커가 맡아요" 로 답한다(로컬이 ~1초 안에 집는다).
    로컬은 서버 행이 60초 안에 뛰었고 `idle` 이 아니면 그 바퀴를 넘긴다. 둘이 같은 순간에 시작하는 틈은 남는다 — 그 틈에 같은 글이 두 번 읽히면 검수 대기에 같은 후보가 둘 보일 뿐 사이트에는 닿지 않는다.

## 왜 이것인가

- **트리거와 권한 위임을 요청 하나로 합친다.** Actions(`repository_dispatch`)로 가면 GitHub 토큰을 Vault 에 두고 DB 트리거가 불러야 한다. 그런데 DB 트리거는 운영자 JWT 를 모르고, JWT 를 DB 에 적으면 그게 새 장기 값이다.
  브라우저가 자기 세션을 들고 직접 부르면 그 매듭이 없다.
- **샐 때의 피해가 다르다.** 서버에 남는 두 값이 새면 구독 한도가 타고(claude.ai 에서 회수) 네이버 검색 호출이 쓰인다. DB 에는 닿지 않는다.
  DB 쓰기가 장기 값으로 서버에 있으면 새는 순간 places 가 바뀐다 — 이 레포가 ADR-016 으로 막은 것은 그쪽이다.
- **별도 프로젝트가 사이트를 지킨다.** 사이트 배포 경로(`main` 자동 배포 · `pnpm data pull && pnpm build`)는 한 글자도 바뀌지 않는다. 워커가 망가져도 사이트는 정적 그대로다.

## 하지 않은 것

- **GitHub Actions** — 매듭은 위와 같다. 비용은 무료 2,000분/월 안이라 이유가 아니었다.
- **사이트 프로젝트에 함수 넣기** — 결정 1.
- **서버 cron·DB 트리거로 자동 수집·분석** — 결정 8. 하려면 Supabase 장기 자격증명이 필요하고, 그건 ADR-016 을 하나 더 푸는 일이다.
- **Claude API 키(종량제)** — 구독으로 되고 이용 조건 안이다. 한도가 모자라면 그때 다시 본다.
- **한 함수 안에서 긴 배치** — 300초 상한. 결정 5 의 사슬로 나눈다.

## 무엇을 고치나

- ADR-016: 「서버에 두는 장기 값」 절을 새로 둔다(값 둘 · 프로젝트 · 회전 · 샐 때 피해). "레포와 Supabase 장기 키는 없다" 는 그대로다.
- ADR-024: 「하지 않은 것」 첫 줄에 이 ADR 로 번복했다는 표시를 단다. 결정 3(터미널 상주)은 "실행기 둘 중 하나" 로 바뀐다.
- `scripts/analyze/extractPlaces.mjs` `claudeChildEnv` · `scripts/lib/supabaseClient.mjs`(세션 주입 진입점) · `scripts/lib/workerQueue.mjs`(원자 집기) ·
  `scripts/lib/workerLoop.mjs`(분석 상한·남은 수 되돌리기) · `scripts/lib/workerRemote.mjs`(홉 하나) · `worker/entry/run.mjs` · `scripts/build-worker.mjs`.

## 남은 위험

- **rewrite 대상 하위 도메인**(`zgnn-worker.vercel.app`)은 사이트 `vercel.json` 에 박혀 있다. 워커 프로젝트를 지우거나 이름을 바꾸면 그 이름을 남이 가져가 `/admin` 이 보내는 운영자 JWT(12시간)를 받을 수 있다 — 프로젝트를 없앨 때 rewrite 를 **먼저** 지운다.
- **Vercel CLI 로그인이 있는 기기에서는 에이전트도 `vercel deploy --prod` 를 할 수 있다.** 토큰을 찍는 코드를 배포하면 읽힌다. 경계가 아니라 "배포 전 diff 를 본다" 는 습관이다.
  회전은 `claude setup-token` 재발급 → `pbpaste | tr -d '[:space:]' | vercel env add …`(줄바꿈이 숨김 입력을 끊는다 — 실측 때 49자로 잘렸다).
- **구독 5시간 한도를 로컬 대화와 나눠 쓴다.** 서버가 한도에 걸리면 `rate-limited` 로 요청을 되돌린다(ADR-024 v2 의 `attempts` 그대로).
- **Hobby 는 비상업 조건이다.** 상업 운영으로 가면 Pro 로 옮긴다.
