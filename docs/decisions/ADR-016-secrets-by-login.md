# ADR-016 — 시크릿은 저장하지 않는다: 로그인된 CLI 에게 실행 시점에 받는다

> 최종 수정: 2026-09-21 (v3: 키체인 스크립트(`pnpm secrets`) 폐기 → **로그인 모델**. `supabase login` 만 돼 있으면 스크립트가 실행 시점에 키를 받는다.
> 사용자 결정 "값을 저장·관리하는 스크립트 말고, 로그인하는 방식으로 단순하게". 파일명 `secrets-in-keychain` → `secrets-by-login`)
> 이전 (v2: `SUPABASE_URL` 도 키체인으로, 노출된 키는 회전 — 커밋 전 폐기)
> 이전 (v1: 신설 — macOS 키체인 + `scripts/secrets.mjs`. 사용자 결정 "Claude 가 시크릿 값을 읽는 순간부터 문제다")
> 상태: 결정. 통로는 `scripts/lib/supabaseClient.mjs` 하나.

## 맥락

파이프라인(02 수집·03 분석·`data:pull`)이 로컬에서도 돌아야 해서 `SUPABASE_SERVICE_ROLE_KEY` 가 로컬에 필요했다.
처음엔 `.env.local` 에 두고 `node --env-file-if-exists` 로 읽었는데, 이 레포의 작업 대부분을 에이전트(Claude Code)가 한다 —
에이전트는 디버깅하다 `cat .env.local` 을 치고, 그 값은 대화 기록·서브에이전트 프롬프트·리뷰 워크플로에 실려 밖으로 나간다.
**파일에 값이 있는 한 "읽지 마라" 는 규칙은 한 번의 실수로 무너진다.**

v1 은 값을 macOS 키체인에 넣고 `pnpm secrets set/ls/push/run` 으로 관리하는 스크립트였다. 동작했지만 사용자가 거부했다 —
"값을 넣고, 목록을 보고, 세 곳에 밀어 넣는" 관리 절차가 하나 더 생기는 게 문제였다. 원하는 건 `gh`·`vercel` 처럼
**로그인 한 번**이고, 접근이 필요하면 "로그인하세요" 로 멈추는 것.

## 결정

1. **로컬은 값을 저장하지 않는다.** `supabase login`(브라우저 로그인, 토큰은 CLI 가 자기 키체인에 보관)만 돼 있으면
   스크립트가 실행 시점에 `supabase projects api-keys --reveal -o json` 으로 키를 받아 프로세스 안에서만 쓴다.
   회전하면 다음 실행이 새 키를 받는다 — 로컬에서 갱신할 것이 없다. 로그인이 없으면 그 자리에서 멈추고 `supabase login` 을 안내한다.
2. **통로는 `scripts/lib/supabaseClient.mjs` 하나.** `createSupabase()` 가 env(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`, CI·Vercel)를
   먼저 보고, 없으면 link 된 프로젝트(`supabase/.temp/project-ref`)로 CLI 를 부른다. URL 도 ref 에서 만들므로 `SUPABASE_URL` 을
   따로 둘 필요가 없다. 값을 찍는 코드가 없다 — 에이전트가 `pnpm data:*` 를 돌려도 키를 보지 못한다.
3. **새 secret 키(`sb_secret_…`)를 우선, 없으면 legacy `service_role` JWT.** 새 키는 개별 폐기가 되고 legacy 를 끌 수 있어서다.
   `--reveal` 이 없으면 새 키는 마스킹된 값이 와서 `Invalid API key` 가 난다(실측) — 이 플래그가 이 결정의 함정이다.
4. **CI·Vercel 은 지금처럼 env.** 러너는 로그인할 수 없다. 값은 사용자가 터미널의 **대화형 프롬프트**로 넣는다 —
   `gh secret set NAME`(숨김 입력에 붙여넣기), `vercel env add NAME production --sensitive`(프롬프트에 붙여넣기) 또는 대시보드.
   파일을 거치지 않으니 에이전트가 볼 것이 없다. `gh secret set -f .env.local` 은 쓰지 않는다.
5. **레포에 env 파일은 없다.** `.env.local` 은 선택 설정(`ANALYZE_MODEL`·`NEXT_PUBLIC_KAKAO_MAP_KEY`)을 바꿀 때만 만든다(gitignored `.env*`).
   `.env.example` 은 그 두 이름과 "시크릿은 여기 적지 않는다" 만 말한다.
6. **에이전트 쪽 자물쇠는 `.claude/settings.json` 의 deny** — `Read(./.env.*)`·`Read(./.vercel/.env*)`·
   `Bash(supabase projects api-keys *)`(+ `pnpm exec`·`npx` 접두)·`Bash(security find-generic-password *)`·`Bash(vercel env pull *)`.
   문서는 bypass 모드에서 deny 가 사는지 말하지 않지만 **이 세션(bypass)에서 실제로 막혔다** — `--help` 조차 거부됐다.
   특정 CLI 버전의 관측이지 보장이 아니다 — 버전이 바뀌면 재확인한다. 그래도 1차 방어는 "값이 파일에 없다" 이고 deny 는 2차다.

## 왜 이것인가

- **키체인 스크립트(v1)가 아닌 이유**: 동작은 같았지만 `set`·`ls`·`push` 라는 관리 절차가 생겼다. 로그인 모델은 절차가 0 이다 —
  이미 `supabase link` 를 하려면 로그인이 돼 있어야 해서, 새로 요구하는 것도 없다.
- **1Password·Doppler 가 아닌 이유**: 도구를 바꿔도 "에이전트가 실행할 수 있는 명령으로 값을 꺼낼 수 있다" 는 구조는 같아서 deny 는
  똑같이 필요하고, 계정·CLI 토큰이 하나 더 생긴다. 시크릿 5개에 과하다.
- **로그인된 CLI 로 DB 작업(`supabase db query` 등)은 에이전트도 할 수 있다** — 지금까지 시드·스키마를 그렇게 했다. 막는 건 **값을 보는 것**이지
  DB 를 만지는 것이 아니다. 둘을 섞으면 에이전트가 파이프라인을 돌릴 수 없다.
- **`vercel env pull` 을 금지하는 이유**: `.env.local` 을 Vercel 값(시크릿 포함)으로 통째로 만든다. 예전 `.env.local` 에 `VERCEL_OIDC_TOKEN` 이
  들어 있던 게 그 흔적이다.
- **이미 파일에 있던 키는 회전한다.** 에이전트 대화 기록(로컬 `~/.claude/projects/**/*.jsonl` 과 API 전송분)에 실렸을 수 있는 값은 노출로 본다.
  회전은 대시보드에서 하고, 로컬은 아무것도 안 한다 — GitHub Secrets·Vercel env 만 대화형으로 다시 넣는다.

## 결과

- 로컬: `pnpm data:pull`·`data:analyze --dry-run` 은 그냥 돈다. 안 돌면 메시지가 `supabase login` 또는 `supabase link` 를 가리킨다.
- 에이전트: `pnpm data:*` 실행·결과 확인·Actions 로그·`supabase db query` 는 가능. `supabase projects api-keys`·`.env*` 읽기·`vercel env pull` 은 불가.
- 회전 절차: 대시보드에서 새 secret 키 발급(옛 키 폐기) → `gh secret set SUPABASE_SERVICE_ROLE_KEY` → `vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive --force`
  (preview 도) → 빈 커밋으로 빌드 확인. 로컬은 없음.
- 실측(2026-09-21): env 없이 `node scripts/pull-db.mjs` → CLI 로그인 → `sb_secret_` 키 → 86곳·15개 읽기, diff 없음. link 파일을 치우면
  "link 돼 있지 않다" 로 멈춤. `--reveal` 없이는 `Invalid API key`.
- 미확인: `supabase login` 이 안 된 상태의 메시지 문구(로그아웃해 보지 않았다). stderr 를 그대로 붙여 보여 주므로 안내는 CLI 의 것이 나온다.
