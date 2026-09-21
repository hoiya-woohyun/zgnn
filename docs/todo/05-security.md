# 5. 보안 — 키 분리 · RLS · 웹훅 · 프리뷰 보호

> 최종 수정: 2026-09-21 (v4: 로컬 시크릿의 집을 `.env.local` → macOS 키체인으로(ADR-016). 에이전트가 값을 못 보게 하는 게 목적)
> 이전 (v3: anon select·env→번들 유출 경로·보안 헤더(vercel.json) 확인 완료. Anthropic API 키 대신 `CLAUDE_CODE_OAUTH_TOKEN`(구독). Vercel 마켓플레이스가 넣은 여분 시크릿 항목)
> 이전 (v2: 유출 검사·`.env.example`·RLS·Actions 권한 항목 완료 반영)
> 이전 (v1: 신설)
> 상태: 진행 중. 0 에서 시작해 단계마다 한 항목씩 붙는다. "Vercel 내의 보안 조치" 는 대부분 **키가 번들에 들어가지 않게 하는 것**이다.

## 1순위 — 정적 번들에 시크릿이 구워지는 것

이 앱은 `output: 'export'` 다. `NEXT_PUBLIC_` 이 붙은 env 는 **`out/` 의 JS 에 평문으로 들어간다.** 서버가 없으니
"서버에서만 쓰는 키" 라는 개념 자체가 빌드 단계에만 존재한다. 그래서:

| 키 | 접두어 | 어디에 | 새면 |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **절대 `NEXT_PUBLIC_` 금지** | Vercel env(Sensitive) · GitHub Secrets · 로컬은 키체인(`.env.local` 아님) | RLS 가 통째로 무의미. 즉시 회전 |
| `SUPABASE_URL` | 없음 | 위와 같음 | 무방(프로젝트 주소) |
| `CLAUDE_CODE_OAUTH_TOKEN` | 금지 | GitHub Secrets 만 (Vercel 엔 없다 — 빌드는 AI 를 안 부른다). 로컬은 `claude` 로그인을 쓰므로 키체인에 두더라도 `run` 에는 안 들어간다(`.env.local` 엔 절대 없다) | **구독 계정 그 자체**다 — 새면 `claude setup-token` 을 다시 발급하고 Anthropic 계정 설정에서 기존 세션을 끊는다. API 키와 달리 예산 상한이 없고 한도(5시간 창)만 있다 |
| `NAVER_CLIENT_SECRET` | 금지 | GitHub Secrets(로컬 실행이 필요하면 키체인) | 재발급 |
| `KAKAO_REST_API_KEY` | 금지 | GitHub Secrets(로컬 dry-run 은 키체인) | 재발급 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 공개 전제 | 코드 기본값(`src/lib/kakaoMap.ts`) — Vercel env 불필요 | 도메인 제한이 방어선. 새 도메인 등록만 조심 |
| Deploy Hook URL | — | Supabase 웹훅 설정 **만** | 아무나 빌드를 돌릴 수 있음 → Vercel 에서 폐기·재발급 |
| anon key | (지금 안 씀) | — | 관리 화면(03 후반)을 만들 때 `NEXT_PUBLIC_` 로 들어간다. 공개돼도 되는 키 — 방어선은 RLS |

- [x] **`out/` 유출 검사를 빌드에 넣는다.** `package.json` 의 `build`(`next build --webpack && node scripts/check-bundle.mjs`):
      `out/` 전체에서 `service_role`·`sk-ant-`·`sb_secret_`·JWT(헤더·페이로드 둘 다 base64url — `eyJ` 만 보면 오탐)·
      `supabase.co` 를 찾으면 **빌드 실패**. 로컬·Vercel 모두 돈다. 실수로 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 라고
      적는 날을 위한 자물쇠다.
- [x] `.env*` 는 `.gitignore` 에 이미 있는지 확인. `.env.example` 에 **이름만** 적어 커밋한다. → 완료.
- [x] **로컬 시크릿은 `.env.local` 이 아니라 macOS 키체인**(`pnpm secrets`, [ADR-016](../decisions/ADR-016-secrets-in-keychain.md)).
      에이전트가 파일을 읽어도 값이 없다. `.claude/settings.json` 의 deny(`Read(./.env.local)`·`security find-generic-password`·
      `vercel env pull`)가 2차 자물쇠 — bypass 세션에서도 막히는 걸 실측했다. 🙋 기존 `.env.local` 의 키 이관은 사용자 터미널에서.

## Supabase

- [x] **모든 테이블 RLS ON, 정책 0개**(01). SQL 로 확인 완료(`relrowsecurity` true × 5, `pg_policies` 0행).
- [x] anon 으로 `select` 해서 빈 결과가 오는지 확인한다 → 5개 테이블 모두 `[]`·HTTP 200, 같은 순간 service_role 은 86행(2026-09-21).
      anon key 는 Vercel 마켓플레이스 연동이 넣어 둔 `SUPABASE_ANON_KEY` 를 썼다(앱은 여전히 어디서도 안 쓴다).
- [ ] Studio 접근은 Supabase 계정 로그인 = 사실상 관리자 인증. 2FA 켠다.
- [ ] `service_role` 키는 회전 가능하다(Settings → API). 회전하면 Vercel·GitHub 두 곳을 같이 갱신 — 한 곳만 하면
      다음 빌드/수집이 조용히 실패한다.
- [ ] 무료 티어 7일 일시정지: 수집 잡(주 2회)이 깨운다. **수집 잡이 7일 이상 실패하면 프로젝트가 잠들고, 그러면 `data:pull` 도
      실패해 재배포가 막힌다.** 이전 배포는 산다. 복구는 대시보드에서 Restore.

## Vercel

- [x] env 는 Sensitive 로 — 만든 뒤 대시보드에서도 값을 못 본다. 잃어버리면 재발급이 정답. `vercel pull` 도 `[SENSITIVE]` 자리표시자만 준다(00).
- [ ] 🙋 Vercel 마켓플레이스의 Supabase 연동이 Production 에 `POSTGRES_URL`·`POSTGRES_PASSWORD`·`SUPABASE_JWT_SECRET`·`SUPABASE_SECRET_KEY` 등을
      넣어 뒀다. 빌드는 하나도 안 쓰고 `NEXT_PUBLIC_` 이 아니라 번들에도 안 들어가지만, 안 쓰는 시크릿은 노출면이다 — 연동을 끊고
      `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 둘만 남길지.
- [ ] Deployment Protection: Preview 에 Vercel Authentication(무료). Production 은 공개.
- [ ] Deploy Hook 은 하나만, 이름에 용도(`supabase-places-webhook`). 정체 모를 빌드가 돌면 이 훅부터 폐기.
- [x] 헤더는 **`vercel.json` 의 `headers`** 로 걸었다(`vercel.ts` 로 옮기지 않았다 — `@vercel/config` 의존성 없이 기존 파일에 넣는 쪽이 작고,
      둘은 공존할 수 없다): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `Permissions-Policy: geolocation=(self)`(앱은 위치를 안 쓰지만 문서대로). 로컬 `vercel build` 의 `.vercel/output/config.json` 에
      헤더 라우트가 들어가는 것을 확인. 수정 전 프로덕션엔 HSTS(Vercel 기본)뿐이었다.
      CSP 는 Kakao SDK(`dapi.kakao.com`·`*.daumcdn.net`) 와 인라인 스크립트 때문에 한 번에 안 된다 — 나중에, 콘솔 보면서.
- [ ] Vercel Firewall·BotID 는 지금 필요 없다. 정적 파일이라 막을 요청이 없다.

## GitHub Actions

- [x] `permissions: contents: read` 기본(`collect.yml` 에 적용됨). 04 의 "스냅샷 PR 자동화" 를 켤 때만 `write`.
- [x] 시크릿을 `echo` 하지 않는다. `fetch` 에러 메시지에는 status·query 만(수집·Kakao·본문). `claude -p` 는 stderr 앞 160자와
      CLI 의 오류 문구(로그인·한도)만 싣고 모델 출력·본문은 싣지 않는다. Claude Code CLI 는 러너에 버전 고정으로 설치(`collect.yml`).
- [x] 서드파티 액션은 `actions/checkout`·`pnpm/action-setup`·`actions/setup-node` 만, **커밋 SHA 고정**(v7.0.1·v6.1.0·v7.0.0).
- [x] 포크 PR 에서는 시크릿이 안 들어온다 — 수집 잡은 `schedule`·`workflow_dispatch` 에서만 돌게 하고 `pull_request` 트리거를 안 건다.

## 관리 화면을 만들게 되면 (03 후반, 지금 아님)

- 앱 번들에 `@supabase/supabase-js` + anon key 가 들어간다. 그 순간부터 방어선은 **RLS 정책**이다:
  `candidates`·`places` 의 update 는 `auth.uid()` 가 관리자 테이블에 있는 사용자만. 관리자 계정은 Supabase Auth 이메일 매직링크 하나.
- 이건 회원 가입이 아니다(관리자 1~2명). [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) 의 약관·처리방침 의무는
  **일반 사용자의 개인정보를 받을 때** 생긴다. 관리자 본인 이메일은 그 범위가 아니다 — 하지만 선을 넘는 순간 ADR-012 전체가 살아난다.

## 끝났다고 볼 조건

- [x] `pnpm build` 뒤 유출 검사가 돈다(`scripts/check-bundle.mjs`). `out/` 에 `service_role` 문자열을 심은 파일을 두고 검사기를
      돌려 **exit 1** 을 확인했다(2026-09-20). env → 번들 경로도 확인(2026-09-21): `NEXT_PUBLIC_TEST_LEAK=service_role… pnpm build` 만으론
      **통과한다** — Next 는 코드에서 `process.env.NEXT_PUBLIC_X` 로 **참조된** 변수만 번들에 넣는다. 임시로 참조를 넣고 빌드하면
      `[service_role] out/_next/static/chunks/….js` 로 exit 1. 즉 이 자물쇠는 "누가 코드에 참조를 쓴 날" 에 걸린다 — 그게 맞는 자리다.
- [x] anon 키로 `places` 를 `select` 하면 0행(확인). — [ ] Preview URL 을 시크릿 창에서 열면 로그인 화면 — **미확인**(Deployment Protection 은 대시보드).
- [ ] 시크릿 회전 절차(위 표의 "새면" 열)가 이 문서에 있고, 한 번은 실제로 회전해 본다. — 표는 있고, 회전은 아직.
