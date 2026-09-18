# 5. 보안 — 키 분리 · RLS · 웹훅 · 프리뷰 보호

> 최종 수정: 2026-09-18 (v1: 신설)
> 상태: 계획. 0 에서 시작해 단계마다 한 항목씩 붙는다. "Vercel 내의 보안 조치" 는 대부분 **키가 번들에 들어가지 않게 하는 것**이다.

## 1순위 — 정적 번들에 시크릿이 구워지는 것

이 앱은 `output: 'export'` 다. `NEXT_PUBLIC_` 이 붙은 env 는 **`out/` 의 JS 에 평문으로 들어간다.** 서버가 없으니
"서버에서만 쓰는 키" 라는 개념 자체가 빌드 단계에만 존재한다. 그래서:

| 키 | 접두어 | 어디에 | 새면 |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **절대 `NEXT_PUBLIC_` 금지** | Vercel env(Sensitive) · GitHub Secrets | RLS 가 통째로 무의미. 즉시 회전 |
| `SUPABASE_URL` | 없음 | 위와 같음 | 무방(프로젝트 주소) |
| `ANTHROPIC_API_KEY` | 금지 | GitHub Secrets 만 (Vercel 엔 없다 — 빌드는 AI 를 안 부른다) | 콘솔에서 폐기. 월 예산 상한이 손실을 막는다 |
| `NAVER_CLIENT_SECRET` | 금지 | GitHub Secrets 만 | 재발급 |
| `KAKAO_REST_API_KEY` | 금지 | GitHub Secrets 만 | 재발급 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 공개 전제 | Vercel env | 도메인 제한이 방어선. 새 도메인 등록만 조심 |
| Deploy Hook URL | — | Supabase 웹훅 설정 **만** | 아무나 빌드를 돌릴 수 있음 → Vercel 에서 폐기·재발급 |
| anon key | (지금 안 씀) | — | 관리 화면(03 후반)을 만들 때 `NEXT_PUBLIC_` 로 들어간다. 공개돼도 되는 키 — 방어선은 RLS |

- [ ] **`out/` 유출 검사를 빌드에 넣는다.** `package.json` 의 `build` 뒤에 `scripts/check-bundle.mjs`:
      `out/` 전체에서 `service_role`·`sk-ant-`·`eyJ`(JWT 접두) 를 찾으면 **빌드 실패**. 로컬·Vercel 모두 돈다.
      실수로 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 라고 적는 날을 위한 자물쇠다.
- [ ] `.env*` 는 `.gitignore` 에 이미 있는지 확인. `.env.example` 에 **이름만** 적어 커밋한다.

## Supabase

- [ ] **모든 테이블 RLS ON, 정책 0개**(01). anon 으로 `select` 해서 빈 결과가 오는지 확인한다.
- [ ] Studio 접근은 Supabase 계정 로그인 = 사실상 관리자 인증. 2FA 켠다.
- [ ] `service_role` 키는 회전 가능하다(Settings → API). 회전하면 Vercel·GitHub 두 곳을 같이 갱신 — 한 곳만 하면
      다음 빌드/수집이 조용히 실패한다.
- [ ] 무료 티어 7일 일시정지: 수집 잡(주 2회)이 깨운다. **수집 잡이 7일 이상 실패하면 프로젝트가 잠들고, 그러면 `data:pull` 도
      실패해 재배포가 막힌다.** 이전 배포는 산다. 복구는 대시보드에서 Restore.

## Vercel

- [ ] env 는 Sensitive 로 — 만든 뒤 대시보드에서도 값을 못 본다. 잃어버리면 재발급이 정답.
- [ ] Deployment Protection: Preview 에 Vercel Authentication(무료). Production 은 공개.
- [ ] Deploy Hook 은 하나만, 이름에 용도(`supabase-places-webhook`). 정체 모를 빌드가 돌면 이 훅부터 폐기.
- [ ] `vercel.ts`(`@vercel/config`) 로 헤더를 건다 — 정적 사이트라 최소:
      `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`.
      CSP 는 Kakao SDK(`dapi.kakao.com`·`*.daumcdn.net`) 와 인라인 스크립트 때문에 한 번에 안 된다 — 나중에, 콘솔 보면서.
- [ ] Vercel Firewall·BotID 는 지금 필요 없다. 정적 파일이라 막을 요청이 없다.

## GitHub Actions

- [ ] `permissions: contents: read` 기본. 04 의 "스냅샷 PR 자동화" 를 켤 때만 `write`.
- [ ] 시크릿을 `echo` 하지 않는다. 디버그 로그에 요청 헤더가 찍히지 않게 `fetch` 에러 메시지에서 헤더를 뺀다.
- [ ] 서드파티 액션은 `actions/checkout`·`pnpm/action-setup`·`actions/setup-node` 만, **커밋 SHA 고정**.
- [ ] 포크 PR 에서는 시크릿이 안 들어온다 — 수집 잡은 `schedule`·`workflow_dispatch` 에서만 돌게 하고 `pull_request` 트리거를 안 건다.

## 관리 화면을 만들게 되면 (03 후반, 지금 아님)

- 앱 번들에 `@supabase/supabase-js` + anon key 가 들어간다. 그 순간부터 방어선은 **RLS 정책**이다:
  `candidates`·`places` 의 update 는 `auth.uid()` 가 관리자 테이블에 있는 사용자만. 관리자 계정은 Supabase Auth 이메일 매직링크 하나.
- 이건 회원 가입이 아니다(관리자 1~2명). [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) 의 약관·처리방침 의무는
  **일반 사용자의 개인정보를 받을 때** 생긴다. 관리자 본인 이메일은 그 범위가 아니다 — 하지만 선을 넘는 순간 ADR-012 전체가 살아난다.

## 끝났다고 볼 조건

- `pnpm build` 뒤 유출 검사가 돌고, 일부러 `NEXT_PUBLIC_TEST_LEAK=service_role` 을 넣은 빌드가 **실패**한다.
- anon 키로 `places` 를 `select` 하면 0행. Preview URL 을 시크릿 창에서 열면 로그인 화면.
- 시크릿 회전 절차(위 표의 "새면" 열)가 이 문서에 있고, 한 번은 실제로 회전해 본다.
