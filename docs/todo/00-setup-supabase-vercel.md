# 0. Supabase · Vercel · GitHub — 계정과 시크릿 자리 잡기

> 최종 수정: 2026-09-21 (v5: Auth 로그인 모델(ADR-016 v4) — `SUPABASE_URL` 은 코드 상수라 시크릿에서 빠지고(6→5개), Vercel 은 Supabase env 가 필요 없어진다. 대시보드 할 일 3개 추가)
> 이전 (v4: 로컬에 시크릿을 두지 않는다 — 로그인된 `supabase` CLI 에게 실행 시점에(ADR-016). `gh secret set -f .env.local` 폐기, `vercel env pull` 금지)
> 이전 (v3: Vercel CLI link·env·빌드 명령·Node·Kakao 도메인 확인 완료 반영. `vercel.json` 의 `outputDirectory` 함정(BUG-005). 남은 것은 Deploy Hook·GitHub Secrets 4개·외부 키)
> 이전 (v2: Supabase 생성 완료, Vercel 은 대시보드 Git 연동으로 이미 붙어 있음. 빈 마이그레이션 함정·`gh` 계정 전환 기록)
> 이전 (v1: 신설)
> 상태: 진행 중. Supabase·Vercel(link·env·빌드 명령)·Kakao 도메인은 끝났다. 남은 것: Deploy Hook(4b), GitHub Secrets 4개(네이버·Anthropic·Kakao REST), 외부 키 발급.

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
      운영자가 `pnpm data:login` 으로 만든 짧은 세션만 키체인에 있다([ADR-016 v4](../decisions/ADR-016-secrets-by-login.md)). env 파일 없음.
  | 값 | 쓰는 곳 | 성격 |
  |---|---|---|
  | 프로젝트 ref(= `SUPABASE_URL`) · publishable 키 | 코드 상수(`scripts/lib/supabaseClient.mjs`) — 빌드(`data:pull`)·로컬·Actions 공통 | 공개값. 방어선은 RLS |
  | `SUPABASE_SERVICE_ROLE_KEY` | **GitHub Actions 만** | **RLS 를 우회하는 키. 절대 `NEXT_PUBLIC_` 금지, 절대 커밋 금지, Vercel·로컬에 두지 않는다** |
  | 운영자 계정(이메일·비밀번호) | 대시보드 Authentication → Users | 비밀번호는 비밀번호 관리자에만. `pnpm data:login` 이 세션으로 바꾼다 |
- [x] Vercel Marketplace 의 Supabase 연동 여부와 무관하게 **리전은 서울로 확인됐다**(`projects list` 의 `ap-northeast-2`).
      단 Vercel 쪽에 Supabase env 는 아직 하나도 없다 — 자동 주입이 안 됐으니 4a 에서 손으로 넣는다.
- [ ] **대시보드 Authentication 세 가지**(ADR-016 v4, 사용자): Users → Add user(이메일+비밀번호, Auto Confirm) → 만들었다고 알리면 Claude 가
      `operators` 에 넣는다 · Settings → JWT expiry 8~12시간(`43200`) · Sign In / Providers → **Allow new users to sign up: off**.
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
- [x] 환경변수: `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 가 Production·Preview 에 있고 키는 Sensitive(`vercel env ls` 에 `Secret`).
      → **ADR-016 v4 뒤로는 둘 다 필요 없다**(빌드는 publishable 키로 published 만 읽는다). 코드의 `PUBLISHABLE_KEY` 가 채워져 배포된 뒤 지운다 —
      순서가 바뀌면 `data:pull` 이 "publishable 키가 코드에 없다" 로 죽는다(이전 배포는 산다). → todo/README 다음 할 일 2.
      **함정**: Sensitive 값은 `vercel pull` 로 내려받으면 `[SENSITIVE]` 자리표시자가 온다 — 로컬 `vercel build` 는 그 값이
      CLI 경로보다 우선돼 `Invalid API key` 로 죽는다. 재현할 때는 `.vercel/.env.production.local` 의 그 줄을 사용자가 손으로 바꾸고 끝나면 지운다.
      `vercel env pull` 은 쓰지 않는다 — `.env.local` 을 시크릿으로 덮어쓴다(ADR-016).
      Vercel Marketplace 의 Supabase 연동이 `POSTGRES_*`·`SUPABASE_ANON_KEY`·`SUPABASE_SECRET_KEY`·`SUPABASE_JWT_SECRET` 도
      Production 에 넣어 뒀다 — 빌드는 아무것도 안 쓰고, `NEXT_PUBLIC_` 이 아니라 번들에도 안 들어간다. 🙋 안 쓰는 시크릿을
      지워 노출면을 줄일지는 05 에서.
- [ ] Deploy Hook 을 하나 만든다(Settings → Git → Deploy Hooks, 브랜치 `main`). URL 자체가 비밀이다 → Supabase 웹훅 설정에만 붙여 넣고 다른 데 적지 않는다.

## Kakao 지도 — 배포 주소 등록

- [x] Kakao Developers → 플랫폼 → Web 에 **Vercel 도메인(`*.vercel.app` 과 커스텀 도메인)을 등록**한다.
      → `https://zgnn.vercel.app/map` 에서 SDK·타일이 200, 콘솔 오류 0 으로 확인(2026-09-21).
      안 하면 JS 키가 맞아도 지도 자리가 빈다(→ [ADR-008](../decisions/ADR-008-kakao-map.md), CLAUDE.md "조용히 깨지는 것").
      프리뷰 URL 은 배포마다 바뀌므로 와일드카드가 안 되면 프리뷰에서는 지도가 안 뜨는 걸 감수한다.
- [x] 지도 키는 `NEXT_PUBLIC_KAKAO_MAP_KEY`(`src/lib/kakaoMap.ts`, 문서 초안의 `_JS_KEY` 는 오기)이고 코드에 공개 기본값이 있어
      Vercel env 에 넣지 않아도 뜬다. 공개 전제의 키 — 도메인 제한이 방어선.

## GitHub

- [ ] Settings → Secrets and variables → Actions 에 2·3 단계가 쓸 시크릿 자리를 만든다:
      `SUPABASE_SERVICE_ROLE_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `CLAUDE_CODE_OAUTH_TOKEN`, `KAKAO_REST_API_KEY`.
      (`SUPABASE_URL` 은 코드 상수가 돼 시크릿에서 빠졌다 — 등록돼 있는 건 지워도 된다.) 값은 각 단계에서 채운다.
      → 지금 5개 중 `SUPABASE_SERVICE_ROLE_KEY` 1개만 등록됨(회전 예정 — 다음 할 일 1)
      (등록은 사용자 터미널에서 `gh secret set NAME` — 숨김 입력에 붙여넣는다. 파일을 거치지 않는다, ADR-016).
- [x] Actions 권한: Settings → Actions → General → Workflow permissions 는 기본값이 이미 **Read** 였다.
- [ ] **비직관적 함정**: 이 레포 소유 계정(`hoiya-woohyun`)이 `gh` 의 기본 활성 계정이 아니다. 레포가 안 보이면
      먼저 `gh auth switch` 로 계정을 바꾼다.

## 외부 계정 (2·3 단계용, 지금 만들어 둬도 된다)

- [ ] **네이버 개발자센터**(developers.naver.com) 애플리케이션 등록 → 검색 API 사용 설정 → Client ID/Secret.
      하루 25,000회. 개인 프로젝트에 충분하다.
- [ ] **Kakao REST API 키** — 지도 JS 키와 **다른 키**다(같은 앱 안에 있다). 3 단계의 좌표 보강(로컬 API)에 쓴다.
- [ ] **Anthropic API 키** — console.anthropic.com. 3 단계용. 사용량 상한(월 예산)을 콘솔에서 걸어 둔다.

## 끝났다고 볼 조건

- Supabase 대시보드에 서울 리전 프로젝트가 있고, Vercel 에 Git 연동된 프로젝트가 있고, `main` 푸시로 지금 상태의 사이트가 **그대로** 배포된다(아직 DB 안 읽음). — **여기까지는 됐다.**
- 시크릿 6개의 이름이 GitHub·Vercel 에 자리 잡혀 있다(값은 비어 있어도 됨). — GitHub 는 2/6(**아직**), Vercel 은 빌드에 필요한 2개가 다 있다.
