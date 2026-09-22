# 0. Supabase · Vercel · GitHub — 계정과 시크릿 자리 잡기

> 최종 수정: 2026-09-22 (v6: **(c) Actions 폐지** — "시크릿 자리 잡기" 라는 목표 자체가 뒤집혔다. GitHub Secrets 는 **0개**(죽은 값 2개 삭제 완료, 2026-09-22 (5)), Vercel env 0개(완료),
> 로컬은 키체인의 세션 하나. 네이버 키는 사용자가 로컬에서 직접 관리(스크립트가 env 또는 TTY 숨김 입력으로 받고 저장하지 않는다). Anthropic API 키 항목 폐기(구독 `claude -p`). 대시보드 3개 완료 반영)
> 이전 (v5: Auth 로그인 모델(ADR-016 v4) — `SUPABASE_URL` 은 코드 상수라 시크릿에서 빠지고(6→5개), Vercel 은 Supabase env 가 필요 없어진다. 대시보드 할 일 3개 추가)
> 이전 (v4: 로컬에 시크릿을 두지 않는다 — 로그인된 `supabase` CLI 에게 실행 시점에(ADR-016). `gh secret set -f .env.local` 폐기, `vercel env pull` 금지)
> 이전 (v3: Vercel CLI link·env·빌드 명령·Node·Kakao 도메인 확인 완료 반영. `vercel.json` 의 `outputDirectory` 함정(BUG-005). 남은 것은 Deploy Hook·GitHub Secrets 4개·외부 키)
> 이전 (v2: Supabase 생성 완료, Vercel 은 대시보드 Git 연동으로 이미 붙어 있음. 빈 마이그레이션 함정·`gh` 계정 전환 기록)
> 이전 (v1: 신설)
> 상태: 거의 끝. Supabase(서울·link·대시보드 3개)·Vercel(link·빌드 명령·env 0개·연동 없음)·Kakao 도메인은 끝났다. 남은 것: GitHub 의 죽은 시크릿 2개 삭제(0개로) · Deploy Hook(4b) · 네이버 키 발급(사용자 손에만).

## 되돌릴 수 없는 것부터

- [x] **Supabase 프로젝트를 서울 리전(`ap-northeast-2`)으로 만든다.** 리전은 생성 시에만 정해진다
      ([ADR-012 §2](../decisions/ADR-012-personal-data-and-consent.md)). 지금은 개인정보를 안 받지만,
      나중에 받게 될 때 프로젝트를 다시 만드는 일이 없게 처음부터 서울로.
      → `zgnn_supabase`(ref `qfzasaszpwcgtbzirujx`), 무료 티어, CLI 로 link 됨.
- [x] 프로젝트 이름은 `zgnn_supabase`(문서 초안은 `zgnn`). 무료 티어. DB 비밀번호는 비밀번호 관리자에만.
- [ ] **함정**: `supabase db pull` 이 맨 처음 만든 빈 마이그레이션이 원격에 "적용됨" 으로 기록된다. 그 파일에
      SQL 을 써 넣고 `db push` 해도 **조용히 건너뛴다** — 이미 적용된 걸로 보기 때문이다. 겪으면
      `supabase migration repair --status reverted <그 버전>` 으로 되돌리고 새 마이그레이션 파일을 만든다.

## Supabase

- [x] 생성 뒤 받아 둘 값 — 어디에 두는지는 [05-security.md](05-security.md) 표가 정본. 로컬에는 시크릿이 없다 —
      운영자가 `pnpm data:login` 으로 만든 짧은 세션만 키체인에 있다([ADR-016](../decisions/ADR-016-secrets-by-login.md)). env 파일 없음.
      Supabase 인증 출처는 **둘뿐**이다 — 세션(쓰기 스크립트) · anon(`data:pull`, Vercel 빌드와 로컬이 같은 경로).
  | 값 | 쓰는 곳 | 성격 |
  |---|---|---|
  | 프로젝트 ref(= `SUPABASE_URL`) · publishable 키 | 코드 상수(`scripts/lib/supabaseClient.mjs`) — 빌드(`data:pull`)·로컬 공통 | 공개값. 방어선은 RLS |
  | ~~`SUPABASE_SERVICE_ROLE_KEY`~~ | **어디에도 없다**(2026-09-22 (c)). legacy 키는 퇴역했고 새 secret key 는 만들지 않는다 | 셸 env(export)에 남아 있으면 쓰기 스크립트는 **멈춘다**(트립와이어), `data:pull` 은 anon 으로 가되 이름만 경고. `.env.local` 은 `data:*` 가 읽지 않는다(ADR-016 결정 6) — 잔존은 사용자가 `ls -la .env*` 로 확인 |
  | 운영자 계정(이메일·비밀번호) | 대시보드 Authentication → Users | 비밀번호는 비밀번호 관리자에만. `pnpm data:login` 이 세션으로 바꾼다 |
- [x] Vercel Marketplace 의 Supabase 연동 여부와 무관하게 **리전은 서울로 확인됐다**(`projects list` 의 `ap-northeast-2`).
      (v4 이전엔 "Vercel env 를 4a 에서 손으로 넣는다" 였다 — ADR-016 v4 뒤로 Vercel 엔 Supabase env 가 **하나도 필요 없고**, 있던 것은 지웠다. 아래 Vercel 절.)
- [x] **대시보드 Authentication 세 가지**(사용자, 2026-09-22 (3) 완료 보고): Users → Add user(`zgnn@gmail.com`, Auto Confirm) → Claude 가 `operators` 에 넣음 ·
      Sign In / Providers → **Allow new users to sign up: off** · Secure password change on · legacy JWT secret 퇴역.
      **JWT expiry 는 기본 3600 유지(사용자 결정)** — 코드의 30분 skew 와 합치면 로그인 뒤 **30분**만 세션으로 쓸 수 있다. 긴 `data:analyze` 전에 `43200` 으로 올리는 것은 열린 선택.
- [ ] Database Webhooks 를 켤 수 있는지 확인(Database → Webhooks). 4b 에서 쓴다.

## Vercel

- [x] Git 연동은 이미 돼 있다 — 대시보드에서 `hoiya-woohyun/zgnn` 의 `main` → Production 으로 붙여 놨고
      `vercel[bot]` 이 실제로 배포 중이다.
- [x] `npm i -g vercel` 로 CLI 설치.
- [x] `vercel login` · `vercel link` 완료(`.vercel/project.json`, `.gitignore` 됨). `vercel pull --environment=production` 으로
      대시보드 설정을 `.vercel/project.json` 에 받아 볼 수 있다 — `settings.outputDirectory` 가 `null` 인지 볼 때 쓴다(BUG-005).
- [x] Framework Preset: Next.js. Build Command 는 `vercel.json` 의 `buildCommand: "pnpm data:pull && pnpm build"`(4a).
      **Output Directory 는 비워 둔다** — `out` 을 적으면 Next 프리셋이 `out/routes-manifest.json` 을 찾다 배포만 실패한다
      (→ [BUG-005](../bugs/BUG-005-vercel-output-directory.md)). `--webpack` 은 `package.json` 의 `build` 에 이미 있다(→ CLAUDE.md "조용히 깨지는 것").
- [x] Node 24 (대시보드 `nodeVersion: 24.x` 확인). `pnpm` 은 lockfile 로 자동 감지됐다(빌드 로그의 `pnpm install`).
- [x] 환경변수: **0개**(2026-09-22 (2) 실측 `vercel env ls` → `No Environment`). 빌드는 코드 상수의 publishable 키로 published 만 읽으므로 Supabase env 가
      하나도 필요 없다 — 손으로 넣었던 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 는 Claude 가 `vercel env rm`(값 노출 없음), 마켓플레이스 연동이 넣은
      12개(`POSTGRES_*`·`SUPABASE_JWT_SECRET` 등)는 사용자가 연동을 끊자 함께 사라졌다. 그 상태에서 `main` 프로덕션이 `publishable(anon)` 86·15 로 Ready.
      다시 env 를 넣을 일이 생기면 Sensitive 로. **함정**: Sensitive 값은 `vercel pull` 로 내려받으면 `[SENSITIVE]` 자리표시자가 온다 — 로컬 `vercel build` 는 그 값이
      CLI 경로보다 우선돼 `Invalid API key` 로 죽는다. `vercel env pull` 은 쓰지 않는다 — `.env.local` 을 시크릿으로 덮어쓴다(ADR-016).
- [ ] Deploy Hook 을 하나 만든다(Settings → Git → Deploy Hooks, 브랜치 `main`). URL 자체가 비밀이다 → Supabase 웹훅 설정에만 붙여 넣고 다른 데 적지 않는다.

## Kakao 지도 — 배포 주소 등록

- [x] Kakao Developers → 플랫폼 → Web 에 **Vercel 도메인(`*.vercel.app` 과 커스텀 도메인)을 등록**한다.
      → `https://zgnn.vercel.app/map` 에서 SDK·타일이 200, 콘솔 오류 0 으로 확인(2026-09-21).
      안 하면 JS 키가 맞아도 지도 자리가 빈다(→ [ADR-008](../decisions/ADR-008-kakao-map.md), CLAUDE.md "조용히 깨지는 것").
      프리뷰 URL 은 배포마다 바뀌므로 와일드카드가 안 되면 프리뷰에서는 지도가 안 뜨는 걸 감수한다.
- [x] 지도 키는 `NEXT_PUBLIC_KAKAO_MAP_KEY`(`src/lib/kakaoMap.ts`, 문서 초안의 `_JS_KEY` 는 오기)이고 코드에 공개 기본값이 있어
      Vercel env 에 넣지 않아도 뜬다. 공개 전제의 키 — 도메인 제한이 방어선.

## GitHub — 시크릿 0개가 목표 (2026-09-22 (c))

GitHub Actions 는 "관리자 없이 도는 구조" 라 만료 없는 시크릿(service_role·네이버 키·구독 OAuth 토큰)을 GitHub 에 두어야만 돈다 — 그 자리가 곧
에이전트가 push 한 줄로 읽는 경로다(README 다음 할 일 2 의 원칙). 그래서 워크플로를 없애고 수집·분석·반영을 **사용자 터미널의 운영자 세션**으로 옮겼다.
GitHub 에 남을 시크릿은 없다.

- ~~Settings → Secrets and variables → Actions 에 2·3 단계가 쓸 시크릿 자리를 만든다(5개)~~ — 목표가 사라졌다.
- [x] **남은 죽은 값 삭제** — `SUPABASE_SERVICE_ROLE_KEY`(legacy 라 이미 무효)·`SUPABASE_URL`(공개값). 2026-09-22 (5) Claude 가 `gh auth switch -u hoiya-woohyun`
      → `gh secret list`(이름만) → `gh secret delete` 2개 → `gh secret list` 빈 결과 → 계정 복귀. 실제 목록은 `gh secret list` 가 정본이다 — **0개**.
- [x] ~~Actions 권한 Read~~ — 워크플로(`.github/workflows/collect.yml`)가 삭제돼 `.github/` 자체가 없다. 무관해졌다.
- [ ] **비직관적 함정**: 이 레포 소유 계정(`hoiya-woohyun`)이 `gh` 의 기본 활성 계정이 아니다. 레포가 안 보이면
      먼저 `gh auth switch` 로 계정을 바꾼다(시크릿 삭제 때도).

## 외부 계정 (2·3 단계용) — 사용자가 갖고 있는다, 어디에도 저장하지 않는다

- [ ] **네이버 개발자센터**(developers.naver.com) 애플리케이션 등록 → 검색 API 사용 설정 → Client ID/Secret.
      하루 25,000회. 개인 프로젝트에 충분하다. **값은 비밀번호 관리자에만** — `pnpm data:collect` 가 env(`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`)로 받고,
      없으면 터미널에서 숨김 입력으로 받는다. 레포·키체인·파일 어디에도 저장하지 않으며, 에이전트 세션(`CLAUDECODE`)에서는 입력 자체를 거부한다.
- [ ] **Kakao REST API 키** — 지도 JS 키와 **다른 키**다(같은 앱 안에 있다). 3 단계의 좌표 보강에 쓰는 **선택** 키 — 사용자가 안 쓰기로 했다.
      쓰려면 `KAKAO_REST_API_KEY=… pnpm data:analyze` 로 그 셸에서만. 없으면 보강을 건너뛴다.
- ~~**Anthropic API 키**~~ — 없다. Claude 는 구독의 `claude -p` 로 부르고(2026-09-21 결정, 03), 인증은 이 머신의 `claude` 로그인뿐이다.

## 끝났다고 볼 조건

- Supabase 대시보드에 서울 리전 프로젝트가 있고, Vercel 에 Git 연동된 프로젝트가 있고, `main` 푸시로 지금 상태의 사이트가 **그대로** 배포된다(아직 DB 안 읽음). — **여기까지는 됐다.**
- 시크릿이 있는 자리가 **셋뿐**이다: 키체인의 운영자 세션(≤1일) · 사용자의 비밀번호 관리자(네이버 키·운영자 비밀번호) · Supabase 웹훅 설정의 Deploy Hook URL(4b, 아직 없음).
  GitHub Secrets 0개 · Vercel env 0개 · 레포에 env 파일 없음. — 셋 다 됐다(2026-09-22 (5), `gh secret list` 빈 결과).
