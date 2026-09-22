# 5. 보안 — 키 분리 · RLS · 웹훅 · 프리뷰 보호

> 최종 수정: 2026-09-22 (v8: **(c) Actions 폐지** — "어디에 무엇이 있는지" 표를 두 출처(세션·anon) 모델로 다시 씀: service_role 은 어디에도 없다(env 잔존은 트립와이어로 멈춤),
> `CLAUDE_CODE_OAUTH_TOKEN` 없음, 네이버 키는 사용자 로컬 관리(숨김 입력·저장 없음), GitHub 0개(죽은 값 2개 삭제, 실측)·Vercel 0개. Actions 절 폐지. **(b) GRANT 축소 마이그레이션은 파일만 — 원격 미적용·미검증.**
> 새 비용: 7일 일시정지를 깨우는 잡이 없다)
> 이전 (v7: 마켓플레이스 연동은 끊기로 결정 — 원칙 "우회 키를 에이전트가 트리거할 수 있는 경로에 두지 않는다")
> 이전 (v6: RLS 를 PostgREST 로 실측 완료 — anon·세션 없음·비운영자·운영자 네 경우. JWT expiry 는 사용자 결정으로 기본 3600 유지)
> 이전 (v5: Auth 로그인 모델(ADR-016 v4) — 로컬은 운영자 세션(짧은 JWT)+RLS, service_role 은 GitHub Actions 만. RLS 정책 절 갱신, `NAVER_*` 로컬 문구 통일)
> 이전 (v4: 로컬에 시크릿을 두지 않는다 — 로그인된 `supabase` CLI 에게 실행 시점에(ADR-016). 에이전트가 값을 못 보게 하는 게 목적)
> 이전 (v3: anon select·env→번들 유출 경로·보안 헤더(vercel.json) 확인 완료. Anthropic API 키 대신 `CLAUDE_CODE_OAUTH_TOKEN`(구독). Vercel 마켓플레이스가 넣은 여분 시크릿 항목)
> 이전 (v2: 유출 검사·`.env.example`·RLS·Actions 권한 항목 완료 반영)
> 이전 (v1: 신설)
> 상태: 진행 중. 0 에서 시작해 단계마다 한 항목씩 붙는다. "Vercel 내의 보안 조치" 는 대부분 **키가 번들에 들어가지 않게 하는 것**이다.

## 1순위 — 정적 번들에 시크릿이 구워지는 것

이 앱은 `output: 'export'` 다. `NEXT_PUBLIC_` 이 붙은 env 는 **`out/` 의 JS 에 평문으로 들어간다.** 서버가 없으니
"서버에서만 쓰는 키" 라는 개념 자체가 빌드 단계에만 존재한다. 그래서:

**어디에 무엇이 있는지 — 이 표가 정본이다**(2026-09-22 (c) 뒤). Supabase 인증 출처는 **둘뿐**: 운영자 세션(쓰기 스크립트) · anon(`data:pull`). 실행 주체는 사용자 터미널뿐이고
스케줄·CI 는 없다. **프로젝트** 시크릿이 사는 자리는 셋 — 키체인의 세션(≤1일) · 사용자의 비밀번호 관리자 · (4b 뒤) Supabase 웹훅 설정의 Deploy Hook URL. 머신의 CLI 로그인
(`claude`·`supabase`·`gh`·SSH)은 별개다 — `claude` 만 상시, 나머지는 심부름 때만 열고 닫는다(README 다음 할 일 1). **GitHub Secrets 0개(실측 2026-09-22 (5) — 죽은 값
`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_URL` 삭제, `gh secret list` 빈 결과) · Vercel env 0개(실측) · 레포에 env 파일 없음.**

| 키 | 접두어 | 어디에 | 새면 |
|---|---|---|---|
| ~~`SUPABASE_SERVICE_ROLE_KEY`~~ | **절대 `NEXT_PUBLIC_` 금지** | **어디에도 없다.** legacy 키는 퇴역(2026-09-22 (3) API keys disable), 새 secret key 는 만들지 않는다. 코드에 service 경로가 없다 — 셸 env(export)에 남아 있으면 쓰기 스크립트는 **멈추고**(`resolveSupabaseCredentials` 트립와이어, CI 예외 없음), `data:pull` 은 anon 으로 가되 **이름만** 한 줄 경고(빌드는 계속). `.env.local` 은 `data:*` 가 읽지 않는다(ADR-016 결정 6) — 파일 잔존은 트립와이어가 아니라 사용자가 `ls -la .env*` 로 확인한다 | 키 자체가 disabled 라 RLS 를 못 우회한다. 그래도 대시보드 API Keys 에서 상태 확인 |
| 운영자 세션(JWT) | — | macOS 키체인(`zgnn`/`SUPABASE_SESSION`), `pnpm data:login` 이 넣는다. 파일·env 없음 | `exp` 뒤 자동 무효(코드 상한 ≤ 1일 `SESSION_MAX_TTL_S` · 대시보드 JWT expiry 는 지금 3600 — skew 30분을 빼 실효 30분). 급하면 대시보드에서 그 사용자 비밀번호 변경 |
| `SUPABASE_URL` · publishable 키 | (공개값) | 코드 상수(`scripts/lib/supabaseClient.mjs` 의 `PROJECT_REF`·`PUBLISHABLE_KEY`). URL 은 env 로 못 바꾼다(바꿀 수 있으면 `SUPABASE_URL=https://attacker` 한 줄이 키체인 JWT 를 밖으로 보낸다) | 무방 — 방어선은 RLS |
| ~~`CLAUDE_CODE_OAUTH_TOKEN`~~ | 금지 | **없다.** Claude 인증은 이 머신에 로그인된 `claude`(키체인)뿐이다. `claude -p` 자식 env 허용 목록에서도 뺐다(`CI`·`GITHUB_ACTIONS` 와 함께) — 토큰이 어디서 흘러와도 자식에 안 넘어간다 | 발급하지 않으니 샐 것이 없다. `claude` 로그인 세션이 의심되면 Anthropic 계정 설정에서 세션을 끊고 다시 로그인 |
| `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` | 금지 | **사용자가 로컬에서 직접 관리**(비밀번호 관리자). `pnpm data:collect` 가 env 로 받고, 없으면 TTY 숨김 입력(`scripts/lib/readHidden.mjs`)으로 없는 쪽만 묻는다 — 프로세스 메모리에만 있고 레포·키체인·파일·로그 어디에도 안 남는다. 에이전트 세션(`CLAUDECODE`)이면 입력을 거부(exit 1), env 로 넘긴 값은 막지 않는다 | 재발급(네이버 개발자센터) |
| `KAKAO_REST_API_KEY` | 금지 | **선택**(사용자가 안 쓰기로). 쓰려면 `KAKAO_REST_API_KEY=… pnpm data:analyze` 로 그 셸에서만. 없으면 보강을 건너뛴다 | 재발급 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 공개 전제 | 코드 기본값(`src/lib/kakaoMap.ts`) — Vercel env 불필요 | 도메인 제한이 방어선. 새 도메인 등록만 조심 |
| Deploy Hook URL | — | Supabase 웹훅 설정 **만**(4b, 아직 없음) | 아무나 빌드를 돌릴 수 있음 → Vercel 에서 폐기·재발급 |
| anon(publishable) key | 공개 전제 | 위 코드 상수. Vercel 빌드와 로컬의 `data:pull` 이 같은 경로로 published 만 읽는다 | 공개돼도 되는 키 — 방어선은 RLS |

- [x] **`out/` 유출 검사를 빌드에 넣는다.** `package.json` 의 `build`(`next build --webpack && node scripts/check-bundle.mjs`):
      `out/` 전체에서 `service_role`·`sk-ant-`·`sb_secret_`·JWT(헤더·페이로드 둘 다 base64url — `eyJ` 만 보면 오탐)·
      `supabase.co` 를 찾으면 **빌드 실패**. 로컬·Vercel 모두 돈다. 실수로 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 라고
      적는 날을 위한 자물쇠다.
- [x] `.env*` 는 `.gitignore` 에 이미 있는지 확인. `.env.example` 에 **이름만** 적어 커밋한다. → 완료.
- [x] **로컬에 시크릿을 저장하지 않는다** — 운영자가 `pnpm data:login` 으로 만든 **짧은 세션(JWT)** 만 키체인에 있고, `pnpm data:*` 는 그걸로 RLS 안에서 논다
      ([ADR-016 v4](../decisions/ADR-016-secrets-by-login.md)). 세션이 만료되면 관리자가 다시 로그인하기 전까지 아무 스크립트도 DB 에 쓰지 못한다.
      에이전트가 파일을 읽어도 값이 없다. `.claude/settings.json` 의 deny 는 사고 방지 장치지 경계가 아니다(키체인은 `node -e` 로 읽힌다) — 경계는
      "값이 파일에 없다 · exp ≤ 1일 · RLS 범위" 셋이다(ADR-016 결정 7). [ ] **이 머신의 잔존 영구 키** — env 파일 2개·`supabase` CLI PAT·Vercel env 는 닫혔다(2026-09-22 (2)·(3)).
      남은 로컬 잠금 3개(`vercel logout` · `gh` hoiya 로그아웃 · SSH 키 암호구)는 구현 push 뒤 사용자 터미널에서(README 다음 할 일 1).

## Supabase

- [x] **모든 테이블 RLS ON**(01). 정책은 ADR-016 v4 에서 8개(마이그레이션 `20260921075901`·`20260921080333`): 운영자(`operators` 허용 목록)만 5 테이블 all,
      anon 은 `places(status='published')`·`items` select 만. `authenticated` 이지만 허용 목록 밖이면 아무것도 못 한다(회원가입이 열려 있어도).
      어드바이저 `supabase db advisors --linked` = No issues.
- [ ] **(b) GRANT 를 스크립트가 하는 일만큼으로 좁힌다** — `supabase/migrations/20260922120000_narrow_grants.sql` **파일만 작성(2026-09-22 (5)), 원격 미적용·미검증.**
      왜 지금인가: service 키가 퇴역해 남은 두 출처가 둘 다 RLS 를 지나므로 이제 **GRANT 가 곧 상한**이다 — RLS 정책은 "어느 행", GRANT 는 "어느 동작". Supabase 기본은 anon·authenticated 에
      모든 테이블 ALL 이라 정책 실수 하나가 delete·truncate 까지 연다. 내용: 여섯 테이블 ALL 회수 → anon 은 `places`·`items` select 만 → authenticated 는 5 테이블 select/insert/update +
      `operators` select → postgres 의 default privileges 에서 앞으로의 테이블도 끊음(postgres 가 만드는 것만 — 마이그레이션 경로) → `operators_all`(for all) 을 `operators_select`/`_insert`/`_update` 로(×5 = 15 정책, anon 2·`operators_read_self` 는 그대로)
      → `is_operator()` execute 를 anon·PUBLIC 에서 회수하고 authenticated 에 명시 grant. 어떤 스크립트도 `.delete(` 하지 않는다(실측 0개).
      **검증 순서**(`pnpm test` 는 grant 실수를 못 잡는다): 사용자 `pnpm exec supabase login` → Claude `pnpm exec supabase db push` → 사용자 `pnpm data:login` → Claude `pnpm data:apply --dry-run` = `반영 0건` exit 0 ·
      세션으로 delete 시도 → 42501(이제 정책이 아니라 DELETE grant 부재) · anon `data:pull` 86·15 → 사용자 `supabase logout` · 어드바이저 새 경고 없음. 마지막까지 못 가면 **미검증**으로 남긴다.
      **push 뒤 첫 증상이** `permission denied for function is_operator` 나 `for table operators` 면 grant 미적용이지 정책 버그가 아니다.
      **이 뒤로 새 테이블 마이그레이션은 grant 한 줄을 반드시 같이 쓴다** — default privileges 를 끊었으므로 정책을 붙여도 grant 전엔 API 로 아무도 못 본다(증상 42501 — 정책 버그처럼 읽힌다). grant 는 했는데 정책이 없으면 조용한 `[]`.
- [x] anon 으로 `select` 해서 빈 결과가 오는지 확인한다 → 정책 0개 시절 5개 테이블 모두 `[]`(2026-09-21). **정책이 생긴 뒤의 확인은 PostgREST 로만** —
      `db query`(postgres)는 RLS 를 우회해서 증거가 안 된다. anon 은 `candidates` 에서 `[]`, 운영자 JWT 는 같은 테이블에서 행/insert 성공이 기준.
      [x] **실측 완료(2026-09-21 (4))** — anon `data:pull` 86·15 행, `data:apply --dry-run` 이 세션 없음·비운영자·운영자에서 세 결과로 갈림. legacy 키 퇴역 뒤에도 anon 86·15(2026-09-22 (3)).
- [x] 대시보드 Authentication(2026-09-22 (3) 사용자 완료): **회원가입 off** · **Secure password change on**(access token 만으로 비밀번호를 바꿔 짧은 세션을 영구화하는 경로를 막는다) ·
      운영자 계정 Users → Add user(Auto Confirm) · legacy JWT secret 퇴역. **JWT expiry 는 기본 3600 유지(사용자 결정)** — 코드가 86400 초과를 거부하고 skew 30분을 빼므로 실효 30분.
      이메일 확인·매직링크는 안 쓴다(SMTP 없음). [ ] 최소 비밀번호 길이 ≥ 12 는 미확인.
- [ ] Studio 접근은 Supabase 계정 로그인 = 사실상 관리자 인증. 2FA 켠다.
- ~~`service_role` 키 회전 → 새 secret 키 발급 → `gh secret set`~~ — (c) 로 쓰는 곳이 **0**. 회전이 아니라 **퇴역**시켰다(2026-09-22 (3): Migrate → Rotate → legacy API keys disable → Revoke).
      새 secret key 는 만들지 않는다. 옛 값이 에이전트 대화 기록에 실렸을 수 있었던 노출은 키 자체가 죽어 닫혔다. 남은 것은 GitHub 의 죽은 이름 삭제뿐(00).
- [ ] **무료 티어 7일 일시정지 — 이제 깨우는 잡이 없다**(2026-09-22 (c) 의 비직관적 비용). 옛 Actions 는 화·금마다 DB 를 건드려 이걸 매번 깨웠다. 지금 DB 를 건드리는 것은
      사용자의 `pnpm data:*` 와 Vercel 빌드의 `data:pull`(push 가 있을 때만)뿐이다 — **둘 다 7일 없으면 잠들고, 그러면 다음 배포의 `data:pull` 이 실패해 재배포가 막힌다.**
      이전 배포는 산다. 복구는 대시보드 Restore. 주 1회 `pnpm data:pull`(anon, 세션 불필요 — Claude 도 된다)이나 push 하나면 깨어 있다.

## Vercel

- [x] env 는 **0개**(2026-09-22 (2) 실측 `No Environment`). 다시 넣을 일이 생기면 Sensitive 로 — 만든 뒤 대시보드에서도 값을 못 본다. `vercel pull` 도 `[SENSITIVE]` 자리표시자만 준다(00).
- [x] **끊었다(2026-09-22 (2))** — Vercel 마켓플레이스 Supabase 연동은 이 프로젝트에서 쓰는 기능이 없고(정적 내보내기·빌드 시 anon 읽기·회원 없음),
      넣어 둔 `SUPABASE_JWT_SECRET`·`SUPABASE_SECRET_KEY`·`POSTGRES_PASSWORD` 는 아무 브랜치 push 로 빌드 로그에 찍어 읽을 수 있었다(접근 경로 = 읽기 경로).
      사용자가 연동 해제 → 변수 12개 소멸, 손으로 넣은 3개는 Claude 가 `vercel env rm`(값 노출 없음). 그 상태에서 프로덕션 `publishable(anon)` 86·15 Ready.
- [ ] Deployment Protection: Preview 에 Vercel Authentication(무료). Production 은 공개.
- [ ] Deploy Hook 은 하나만, 이름에 용도(`supabase-places-webhook`). 정체 모를 빌드가 돌면 이 훅부터 폐기.
- [x] 헤더는 **`vercel.json` 의 `headers`** 로 걸었다(`vercel.ts` 로 옮기지 않았다 — `@vercel/config` 의존성 없이 기존 파일에 넣는 쪽이 작고,
      둘은 공존할 수 없다): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `Permissions-Policy: geolocation=(self)`(앱은 위치를 안 쓰지만 문서대로). 로컬 `vercel build` 의 `.vercel/output/config.json` 에
      헤더 라우트가 들어가는 것을 확인. 수정 전 프로덕션엔 HSTS(Vercel 기본)뿐이었다.
      CSP 는 Kakao SDK(`dapi.kakao.com`·`*.daumcdn.net`) 와 인라인 스크립트 때문에 한 번에 안 된다 — 나중에, 콘솔 보면서.
- [ ] Vercel Firewall·BotID 는 지금 필요 없다. 정적 파일이라 막을 요청이 없다.

## GitHub Actions — 폐지 (2026-09-22 (c))

Actions 는 "관리자 없이 도는 구조" 라 만료 없는 시크릿(service_role · 네이버 키 · 구독 OAuth 토큰)을 GitHub 에 두어야만 돈다 — 그 자리는 에이전트가 push 한 줄로
읽는 경로고, Free private 레포는 브랜치 보호가 안 돼 그 push 를 막을 방법이 `gh` 로그아웃뿐이었다. 워크플로(`collect.yml`)를 지웠고 `.github/` 자체가 없다.
수집·분석·반영은 사용자 터미널의 운영자 세션(≤1일·RLS 안)으로만 돈다. GitHub Secrets 도 **0개**(2026-09-22 (5), 죽은 이름 2개 삭제 — 00).

- ~~`permissions: contents: read` · 서드파티 액션 SHA 고정 · 포크 PR 에 시크릿 안 들어오게(`pull_request` 트리거 없음)~~ — 워크플로와 함께 소멸.
- [x] **스크립트 로그 위생은 그대로 유효하다**(관측이 Actions 로그에서 사용자 터미널로 바뀌었을 뿐): 시크릿을 `echo` 하지 않는다. `fetch` 에러 메시지에는 status·query 만(수집·Kakao·본문).
      `claude -p` 는 stderr 앞 160자와 CLI 의 오류 문구(로그인·한도)만 싣고 모델 출력·본문은 싣지 않는다. 네이버 키는 숨김 입력이라 터미널에도 안 찍힌다.
      `data:pull` 이 env 의 service 키를 무시할 때도 **이름만** 찍는다.
- [x] `claude -p` 자식 env 는 **허용 목록**이다 — 거부 목록은 아직 이름이 없는 시크릿을 못 거른다. 인증 토큰 env(`CLAUDE_CODE_OAUTH_TOKEN`)·`CI`·`GITHUB_ACTIONS` 는 목록에 없다 —
      테스트가 그 셋을 입력에 일부러 남겨 두고 자식 env 가 `{PATH, HOME}` 만 되는지 단언한다(삭제된 키가 조용히 되살아나는 것을 잡는다).

## 관리 화면을 만들게 되면 (03 후반, 지금 아님)

- 앱 번들에 `@supabase/supabase-js` + publishable key 가 들어간다. 그 순간부터 방어선은 **RLS 정책**이다 — 이미 있다:
  `operators` 허용 목록과 `is_operator()`(ADR-016 v4). 관리 화면은 `pnpm data:login` 과 같은 `signInWithPassword` 로 같은 운영자 계정에 로그인하면 된다.
- 이건 회원 가입이 아니다(관리자 1~2명). [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) 의 약관·처리방침 의무는
  **일반 사용자의 개인정보를 받을 때** 생긴다. 관리자 본인 이메일은 그 범위가 아니다 — 하지만 선을 넘는 순간 ADR-012 전체가 살아난다.

## 끝났다고 볼 조건

- [x] `pnpm build` 뒤 유출 검사가 돈다(`scripts/check-bundle.mjs`). `out/` 에 `service_role` 문자열을 심은 파일을 두고 검사기를
      돌려 **exit 1** 을 확인했다(2026-09-20). env → 번들 경로도 확인(2026-09-21): `NEXT_PUBLIC_TEST_LEAK=service_role… pnpm build` 만으론
      **통과한다** — Next 는 코드에서 `process.env.NEXT_PUBLIC_X` 로 **참조된** 변수만 번들에 넣는다. 임시로 참조를 넣고 빌드하면
      `[service_role] out/_next/static/chunks/….js` 로 exit 1. 즉 이 자물쇠는 "누가 코드에 참조를 쓴 날" 에 걸린다 — 그게 맞는 자리다.
- [x] anon 키로 `places` 를 `select` 하면 0행(정책 0개 시절 확인). 정책 뒤 기준은 위 Supabase 절. — [ ] Preview URL 을 시크릿 창에서 열면 로그인 화면 — **미확인**(Deployment Protection 은 대시보드).
- [ ] 시크릿 회전 절차(위 표의 "새면" 열)가 이 문서에 있고, 한 번은 실제로 회전해 본다. — 표는 있다. service_role 은 회전 대신 **퇴역**(2026-09-22 (3))으로 대상 자체가 없어졌다.
      남은 회전 대상은 네이버 키(재발급, 사용자)와 Deploy Hook URL(4b 뒤)뿐 — 아직.
- [ ] **(b) GRANT 축소가 원격에 적용되고 검증 순서를 끝까지 통과한다**(위 Supabase 절). 파일만 있는 지금은 미검증.
