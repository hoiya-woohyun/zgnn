# ADR-016 — 시크릿은 `.env.local` 이 아니라 키체인에, 에이전트는 값을 보지 못한다

> 최종 수정: 2026-09-21 (v2: `SUPABASE_URL` 도 키체인으로 — 레포에 env 파일 0개, `.env.local` 은 선택. 노출된 키는 이관하지 않고 회전한다)
> 이전 (v1: 신설 — 사용자 결정 "Claude 가 시크릿 값을 읽는 순간부터 문제다")
> 상태: 결정. 통로는 `scripts/secrets.mjs` 하나, 흐름 표(`scripts/lib/secretsFlow.mjs` 의 `SECRETS`)가 정본.

## 맥락

파이프라인(02 수집·03 분석·`data:pull`)이 로컬에서도 돌아야 해서 `SUPABASE_SERVICE_ROLE_KEY` 같은 값이 로컬에 필요하다.
지금까지는 `.env.local`(gitignored) 에 두고 `node --env-file-if-exists=.env.local` 로 읽었고,
GitHub Secrets 등록도 `gh secret set -f .env.local` 로 할 계획이었다([todo/README](../todo/README.md) 다음 할 일 2).

문제는 이 레포의 작업 대부분을 에이전트(Claude Code)가 한다는 점이다. 에이전트는 디버깅하다 `cat .env.local` 을 치고,
그 값은 대화 기록·서브에이전트 프롬프트·리뷰 워크플로에 실려 밖으로 나간다. **파일에 값이 있는 한 "읽지 마라" 는
규칙은 한 번의 실수로 무너진다.** 사용자 결정: 시크릿은 에이전트가 닿는 파일에 두지 않는다.

## 결정

1. **값의 집은 macOS 키체인**(`security` CLI, service `zgnn`, account = 변수 이름). 비밀이 아닌 `SUPABASE_URL` 도 같은 통로로 보낸다 —
   그래야 **레포에 env 파일이 0개**가 된다. `.env.local` 은 선택 설정(`ANALYZE_MODEL`·`NEXT_PUBLIC_KAKAO_MAP_KEY`)을 바꿀 때만 만든다.
   `.env.example` 이 어느 쪽인지 적는다.
2. **통로는 `scripts/secrets.mjs` 하나.** 값이 이 프로세스 밖으로 나가는 길은 두 가지뿐이다 — 자식 프로세스의 env(`run`),
   `gh`/`vercel` 의 stdin 파이프(`push`). 화면에 찍는 명령이 없다. 그래서 에이전트가 `pnpm secrets ls`·`push`·`data:*` 를
   실행해도 값을 보지 못한다. **`run` 은 `RUNNABLE` 목록(시크릿이 필요한 `data:*` 다섯 — 테스트가 package.json 과의 드리프트를 잡는다)만 받는다** — 아무 경로나 받으면 "값을 찍는 한 줄짜리
   디버그 스크립트" 가 곧 유출 경로가 된다(이 결정을 만들던 세션에서 실제로 그 직전까지 갔다).
3. **값은 사용자 터미널의 숨김 입력으로만 들어온다**(`pnpm secrets set NAME` → `security … -w` 를 끝에 두면 두 번 묻는다).
   TTY 가 아니면 거부한다 — `security` 는 TTY 없이도 0 으로 끝나며 **빈 값을 저장**하므로(재입력 불일치 뒤 빈 값끼리 일치)
   이 가드가 없으면 에이전트가 호출했을 때 조용히 망가진다.
4. **흐름 표가 정본.** 어떤 이름이 로컬 실행(`run`)·GitHub(`gh`)·Vercel(`vercel`) 중 어디로 가는지 `SECRETS` 에 적고,
   표에 없는 이름은 `set` 도 거부한다. `CLAUDE_CODE_OAUTH_TOKEN` 은 `run: false` — 로컬 `claude -p` 는 키체인 로그인을
   쓰는데 env 에 토큰이 있으면 CLI 가 그걸 먼저 본다([05-security](../todo/05-security.md)).
5. **Linux(Actions·Vercel)에서는 통로가 투명하다.** `security` 가 없으면 `run` 은 env 를 그대로 넘긴다 — 거기선 시크릿이
   이미 env 로 들어온다. 그래서 `vercel.json` 의 `pnpm data:pull` 도 같은 명령이다.
6. **에이전트 쪽 자물쇠는 `.claude/settings.json` 의 deny.** `Read(./.env.local)`·`Read(./.vercel/.env*)`·
   `Bash(security find-generic-password *)`·`Bash(vercel env pull *)`. 문서는 bypass 모드에서 deny 가 사는지 말하지 않지만
   **이 세션(bypass)에서 실제로 막혔다** — `sed … .env.local` 과 `security find-generic-password` 를 포함한 명령이 거부됐다.
   특정 CLI 버전의 관측이지 보장이 아니다 — 버전이 바뀌면 재확인한다. 문서가 Read deny 를 적용한다고 명시한 Bash 명령은
   `cat`·`head`·`tail`·`sed`·`tee`·리다이렉션이고 `grep` 은 목록에 없다. 그래도 1차 방어는 "파일에 값이 없다" 이고 deny 는 2차다.

## 왜 이것인가

- **1Password `op run`·direnv 가 아닌 이유**: `op` 는 설치돼 있지 않고 구독이 필요하다. direnv 의 `.envrc` 는 위치만 다른
  평문 파일이라 같은 문제다. 키체인은 내장·암호화·의존성 0 이고, `security` 항목을 만든 바이너리(`security` 자신)가 ACL 에
  들어가 node 가 `spawn` 해도 GUI 프롬프트 없이 읽힌다(실측).
- **`vercel env pull` 을 금지하는 이유**: `.env.local` 을 Vercel 값(시크릿 포함)으로 통째로 덮어쓴다. 이전 `.env.local` 에
  `VERCEL_OIDC_TOKEN` 이 들어 있던 게 그 흔적이다.
- **우선순위가 셸 env > 키체인 > `.env.local` 인 이유**(실측): CI 와 같은 규칙이어야 한다. 로컬에서 한 번 다른 키로 돌려 보고 싶을 때도
  `NAME=… pnpm data:pull` 이면 된다. `.env.local` 이 맨 뒤라 이관 전 남은 줄은 키체인 값에 밀려 무해하다.
- **"없음" 과 "읽기 실패" 를 가르는 이유**: `security` 는 없는 항목에 exit 44(errSecItemNotFound)를 낸다(실측). 잠김·비 GUI 세션의
  다른 실패를 "저장 안 됨" 으로 오인하면 `ls` 는 `·`, `run` 은 값 없이 진행해 원인을 가리키는 곳이 없어진다 — 그래서 44 만 없음이고
  나머지는 `ls` 에 `✗`, `run`·`push` 는 중단이다.
- **순수 부분을 `scripts/lib/secretsFlow.mjs` 로 뗀 이유**: 레포 규약(로직은 순수 함수 + 테스트)도 있지만, 한 파일에 두면 테스트 import 를
  위해 "엔트리일 때만 main" 가드가 필요하고 그 가드가 어긋나는 날의 실패 모드가 **exit 0 으로 아무것도 안 함** — `data:pull` 이 조용히
  옛 스냅샷으로 빌드되는, 문서가 막으려는 바로 그 유형이다.

## 결과

- **이미 파일에 있던 키는 이관하지 않고 회전한다.** 에이전트 대화 기록(로컬 `~/.claude/projects/**/*.jsonl` 과 API 전송분)에 실렸을 수
  있는 값은 노출된 것으로 본다 — 옮겨 봤자 같은 값이다. 회전한 새 값은 사용자 터미널에서 `pnpm secrets set` 으로 키체인에만 넣고,
  `.env.local` 은 `rm`. 이후 `pnpm secrets push vercel production`·`push vercel preview`·`push gh` 로 세 곳을 한 번에 맞춘다 —
  05-security 가 경고하는 "한 곳만 갱신해 다음 빌드가 조용히 실패" 를 이 세 명령이 막는다.
- GitHub Secrets 등록: `pnpm secrets push gh` (gh 활성 계정이 `hoiya-woohyun` 이어야 한다). Vercel 회전: `pnpm secrets push vercel production`.
- 새 시크릿을 더할 때: `scripts/lib/secretsFlow.mjs` 의 `SECRETS` 표에 한 줄 → `pnpm secrets set` → `push`. `.env.example` 의 이름 목록도 맞춘다.
  `run` 을 타야 할 스크립트가 늘면 `RUNNABLE` 과 package.json 을 같이 — 한쪽만 고치면 테스트가 잡는다.
- 에이전트가 값이 필요한 것처럼 보이는 순간(예: "키가 맞는지 확인")은 값 없이 할 수 있는 검사로 바꾼다 —
  `pnpm secrets ls` 의 ✓, `pnpm data:pull` 의 exit 0, `vercel env ls` 의 이름.
- 이관이 끝났는지는 `pnpm secrets ls` 의 ⚠ 로 안다 — 이 프로세스가 `.env.local` 을 읽어 시크릿 이름이 값과 함께 남아 있으면
  이름만 경고한다. 에이전트는 파일을 못 읽어도 상태를 알 수 있다.
- 실측한 것(2026-09-21): `push gh` 는 더미 값으로 GitHub 까지 왕복(등록 → `gh secret list` → 삭제), `vercel env add … --sensitive`
  는 stdin 파이프로 Preview 에 등록·삭제, `run` 은 키체인 값이 자식 env 에 들어가고 셸 export 가 이긴다, `security` 없는 PATH 에서도 통과.
