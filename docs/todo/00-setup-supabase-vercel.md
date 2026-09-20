# 0. Supabase · Vercel · GitHub — 계정과 시크릿 자리 잡기

> 최종 수정: 2026-09-20 (v2: Supabase 생성 완료, Vercel 은 대시보드 Git 연동으로 이미 붙어 있음. 빈 마이그레이션 함정·`gh` 계정 전환 기록)
> 이전 (v1: 신설)
> 상태: 진행 중. Supabase 생성·GitHub Secrets 일부는 끝났고, Vercel CLI 로그인/link·env·Deploy Hook·Kakao 도메인 등록이 남았다.

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

- [x] 생성 뒤 받아 둘 값 세 개 — 어디에 두는지는 [05-security.md](05-security.md) 표가 정본. `SUPABASE_URL`·
      `SUPABASE_SERVICE_ROLE_KEY` 는 로컬 `.env.local`(gitignored) 에 있다.
  | 값 | 쓰는 곳 | 성격 |
  |---|---|---|
  | `SUPABASE_URL` | 빌드(`data:pull`) · GitHub Actions | 공개돼도 무방 |
  | `SUPABASE_SERVICE_ROLE_KEY` | 빌드 · Actions | **RLS 를 우회하는 키. 절대 `NEXT_PUBLIC_` 금지, 절대 커밋 금지** |
  | anon key | (지금은 아무 데도) | 앱이 런타임에 DB 를 안 읽으므로 쓸 곳이 없다. (B) 로 가면 그때 |
- [x] Vercel Marketplace 의 Supabase 연동 여부와 무관하게 **리전은 서울로 확인됐다**(`projects list` 의 `ap-northeast-2`).
      단 Vercel 쪽에 Supabase env 는 아직 하나도 없다 — 자동 주입이 안 됐으니 4a 에서 손으로 넣는다.
- [ ] Database Webhooks 를 켤 수 있는지 확인(Database → Webhooks). 4b 에서 쓴다.

## Vercel

- [x] Git 연동은 이미 돼 있다 — 대시보드에서 `hoiya-woohyun/zgnn` 의 `main` → Production 으로 붙여 놨고
      `vercel[bot]` 이 실제로 배포 중이다.
- [x] `npm i -g vercel` 로 CLI 설치.
- [ ] `vercel login` · `vercel link` 는 아직 — CLI 로 이 레포를 프로젝트에 연결하는 절차가 남아 있다
      (Git 연동과 별개다. `.vercel/` 은 `.gitignore`).
- [ ] Framework Preset: Next.js. **Build Command 를 `pnpm data:pull && pnpm build` 로 바꾼다**(4a 에서, 아직 기본값).
      Output Directory 는 `out`. `--webpack` 은 `package.json` 의 `build` 에 이미 있다(→ CLAUDE.md "조용히 깨지는 것").
- [ ] Node 24 (기본값). `pnpm` 은 `packageManager` 필드 또는 lockfile 로 자동 감지.
- [ ] 환경변수는 대시보드 또는 `vercel env add` 로. 범위는 Production · Preview 둘 다, **Sensitive 토글 켬**. (아직 하나도 없음)
- [ ] Deploy Hook 을 하나 만든다(Settings → Git → Deploy Hooks, 브랜치 `main`). URL 자체가 비밀이다 → Supabase 웹훅 설정에만 붙여 넣고 다른 데 적지 않는다.

## Kakao 지도 — 배포 주소 등록

- [ ] Kakao Developers → 플랫폼 → Web 에 **Vercel 도메인(`*.vercel.app` 과 커스텀 도메인)을 등록**한다.
      안 하면 JS 키가 맞아도 지도 자리가 빈다(→ [ADR-008](../decisions/ADR-008-kakao-map.md), CLAUDE.md "조용히 깨지는 것").
      프리뷰 URL 은 배포마다 바뀌므로 와일드카드가 안 되면 프리뷰에서는 지도가 안 뜨는 걸 감수한다.
- [ ] `NEXT_PUBLIC_KAKAO_JS_KEY` 는 이미 공개 전제의 키다(도메인 제한이 방어선). Vercel env 에 넣는다.

## GitHub

- [ ] Settings → Secrets and variables → Actions 에 2·3 단계가 쓸 시크릿 자리를 만든다:
      `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `KAKAO_REST_API_KEY`.
      값은 각 단계에서 채운다. → 지금 6개 중 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 2개만 등록됨
      (`gh secret set -f .env.local` — 값을 화면에 띄우지 않고 로컬 env 파일에서 그대로 등록하는 방법).
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
- 시크릿 6개의 이름이 GitHub·Vercel 에 자리 잡혀 있다(값은 비어 있어도 됨). — **아직**: GitHub 는 2/6, Vercel 은 0개.
